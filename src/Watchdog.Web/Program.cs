using System.Net;
using System.Net.Http;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Watchdog.Contracts;
using Watchdog.Web;

if (args is ["--healthcheck"])
{
    using var handler = new HttpClientHandler
    {
        ServerCertificateCustomValidationCallback = (_, _, _, _) => true
    };
    using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(3) };
    try
    {
        using var response = await client.GetAsync("https://127.0.0.1:8443/health");
        Environment.ExitCode = response.IsSuccessStatusCode ? 0 : 1;
    }
    catch (HttpRequestException)
    {
        Environment.ExitCode = 1;
    }
    catch (TaskCanceledException)
    {
        Environment.ExitCode = 1;
    }
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 1_048_576;
    var certificatePath = builder.Configuration["WATCHDOG_TLS_CERTIFICATE_FILE"];
    var passwordPath = builder.Configuration["WATCHDOG_TLS_CERTIFICATE_PASSWORD_FILE"];
    if (!string.IsNullOrWhiteSpace(certificatePath) && !string.IsNullOrWhiteSpace(passwordPath))
    {
        var password = File.ReadAllText(passwordPath).Trim();
        var certificate = X509CertificateLoader.LoadPkcs12FromFile(
            certificatePath,
            password,
            X509KeyStorageFlags.EphemeralKeySet);
        options.ListenAnyIP(8443, listen => listen.UseHttps(certificate));
    }
    else if (!builder.Environment.IsDevelopment())
    {
        throw new InvalidOperationException("A TLS certificate and password file are required outside development.");
    }
});
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.MaxDepth = 32;
});
builder.Services.AddSingleton<ControlStateStore>();
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<SessionService>();
builder.Services.AddSingleton<BootstrapService>();
builder.Services.AddSingleton<AgentOperationsService>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("pairing", limiter =>
    {
        limiter.PermitLimit = 5;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 8;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
});

var app = builder.Build();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    if (path.StartsWithSegments("/api") && !IsPrivateAddress(context.Connection.RemoteIpAddress))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "lan-access-required" });
        return;
    }

    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
    if (path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
    }

    if (HttpMethods.IsPost(context.Request.Method) ||
        HttpMethods.IsPut(context.Request.Method) ||
        HttpMethods.IsDelete(context.Request.Method) ||
        HttpMethods.IsPatch(context.Request.Method))
    {
        var hasSessionCookie = context.Request.Cookies.ContainsKey(SessionService.CookieName);
        var isAgentRequest = context.Request.Headers.Authorization.ToString()
            .StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
        if (hasSessionCookie && !isAgentRequest && !HasSameOrigin(context.Request))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "same-origin-request-required" });
            return;
        }
    }

    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", (IWebHostEnvironment environment) =>
    Results.Ok(new { status = "ready" }));
app.MapGet("/api/setup/status", (BootstrapService bootstrap) =>
    Results.Ok(new { pairingRequired = bootstrap.IsSetupRequired }));

app.MapPost("/api/setup/pair", async (
    HttpContext context,
    BootstrapService bootstrap,
    SessionService sessions) =>
{
    if (!SecureEnoughForCredentials(context, app.Environment))
    {
        return Results.Problem("HTTPS is required before creating the first owner.", statusCode: 426);
    }

    var request = await context.Request.ReadFromJsonAsync<PairRequest>();
    if (request is null || request.Code.Length is < 24 or > 256 ||
        request.Username.Length is < 3 or > 64 ||
        request.Password.Length is < 14 or > 256)
    {
        return Results.BadRequest(new { error = "invalid-setup-input" });
    }

    if (!bootstrap.TryCreateOwner(request.Code, request.Username, request.Password, out var owner) || owner is null)
    {
        return Results.BadRequest(new { error = "pairing-code-invalid-or-expired" });
    }

    SetSessionCookie(context, sessions.Create(owner), app.Environment);
    return Results.Ok(new { id = owner.Id, username = owner.Username, role = "administrator" });
}).RequireRateLimiting("pairing");

app.MapPost("/api/session", async (
    HttpContext context,
    BootstrapService bootstrap,
    SessionService sessions) =>
{
    if (!SecureEnoughForCredentials(context, app.Environment))
    {
        return Results.Problem("HTTPS is required before signing in.", statusCode: 426);
    }

    var request = await context.Request.ReadFromJsonAsync<LoginRequest>();
    if (request is null || request.Username.Length is < 3 or > 64 || request.Password.Length is < 1 or > 256 ||
        !bootstrap.TryLogin(request.Username, request.Password, out var owner) || owner is null)
    {
        context.Response.Headers["WWW-Authenticate"] = "Watchdog";
        return Results.Unauthorized();
    }

    SetSessionCookie(context, sessions.Create(owner), app.Environment);
    return Results.Ok(new { id = owner.Id, username = owner.Username, role = "administrator" });
}).RequireRateLimiting("login");

app.MapDelete("/api/session", (HttpContext context, SessionService sessions) =>
{
    sessions.Revoke(context);
    context.Response.Cookies.Delete(SessionService.CookieName, new CookieOptions { Path = "/" });
    return Results.NoContent();
});

app.MapGet("/api/session", (HttpContext context, SessionService sessions) =>
{
    var owner = sessions.GetOwner(context);
    return owner is null
        ? Results.Unauthorized()
        : Results.Ok(new { id = owner.Id, username = owner.Username, role = "administrator" });
});

app.MapGet("/api/dashboard", (HttpContext context, SessionService sessions, ControlStateStore store) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    var dashboard = store.Read(state =>
    {
        var now = DateTimeOffset.UtcNow;
        var hosts = state.Agents
            .Where(agent => !agent.Revoked)
            .OrderBy(agent => agent.DisplayName)
            .Select(agent => new HostView(
                agent.Id,
                agent.DisplayName,
                agent.Platform,
                agent.Hostname,
                agent.AgentVersion,
                agent.EnrolledAt,
                agent.LastSeenAt,
                agent.Snapshot,
                now - agent.LastSeenAt <= TimeSpan.FromSeconds(75),
                false))
            .ToArray();
        return new DashboardResponse(
            now,
            hosts,
            state.Operations.OrderByDescending(operation => operation.CreatedAt).Take(100).ToArray(),
            state.Audit.OrderByDescending(audit => audit.Time).Take(500).ToArray(),
            !state.OwnerCreated);
    });

    return Results.Ok(dashboard);
});

app.MapPost("/api/agents/invitations", async (
    HttpContext context,
    SessionService sessions,
    AgentOperationsService agents) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    var request = await context.Request.ReadFromJsonAsync<CreateInvitationRequest>();
    if (request is null || request.DisplayName.Length is < 2 or > 80 ||
        request.DisplayName.Any(char.IsControl))
    {
        return Results.BadRequest(new { error = "invalid-display-name" });
    }

    return Results.Ok(agents.CreateInvitation(owner.Username, request.DisplayName));
});

app.MapDelete("/api/agents/{agentId}", (
    string agentId,
    HttpContext context,
    SessionService sessions,
    AgentOperationsService agents) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    agents.RevokeAgent(owner.Username, agentId);
    return Results.NoContent();
});

app.MapPost("/api/agent/enroll", async (
    HttpContext context,
    AgentOperationsService agents) =>
{
    var authorization = context.Request.Headers.Authorization.ToString();
    if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        return Results.Unauthorized();
    }

    var request = await context.Request.ReadFromJsonAsync<EnrollRequest>();
    if (request is null)
    {
        return Results.BadRequest(new { error = "invalid-enrollment" });
    }

    var code = authorization["Bearer ".Length..].Trim();
    var enrollment = agents.Enroll(code, request);
    return enrollment is null
        ? Results.Unauthorized()
        : Results.Ok(new
        {
            agentId = enrollment.Value.AgentId,
            accessToken = enrollment.Value.AgentToken,
            displayName = enrollment.Value.DisplayName,
            pollAfterSeconds = 15
        });
});

app.MapPost("/api/agent/heartbeat", async (
    HttpContext context,
    AgentOperationsService agents) =>
{
    if (!agents.TryAuthenticate(context.Request.Headers.Authorization, out var agentId) || agentId is null)
    {
        return Results.Unauthorized();
    }

    var snapshot = await context.Request.ReadFromJsonAsync<HostSnapshot>();
    if (snapshot is null || !agents.AcceptHeartbeat(agentId, snapshot))
    {
        return Results.BadRequest(new { error = "invalid-host-snapshot" });
    }

    return Results.NoContent();
});

app.MapGet("/api/agent/poll", (
    HttpContext context,
    AgentOperationsService agents) =>
{
    if (!agents.TryAuthenticate(context.Request.Headers.Authorization, out var agentId) || agentId is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(agents.Poll(agentId));
});

app.MapPost("/api/agent/results", async (
    HttpContext context,
    AgentOperationsService agents) =>
{
    if (!agents.TryAuthenticate(context.Request.Headers.Authorization, out var agentId) || agentId is null)
    {
        return Results.Unauthorized();
    }

    var result = await context.Request.ReadFromJsonAsync<OperationResultRequest>();
    if (result is null || !agents.AcceptOperationResult(agentId, result))
    {
        return Results.BadRequest(new { error = "operation-result-not-accepted" });
    }

    return Results.NoContent();
});

app.MapPost("/api/hosts/{hostId}/operations", async (
    string hostId,
    HttpContext context,
    SessionService sessions,
    AgentOperationsService agents) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    var request = await context.Request.ReadFromJsonAsync<OperationRequest>();
    if (request is null)
    {
        return Results.BadRequest(new { error = "invalid-operation-request" });
    }

    var result = agents.QueueOperation(owner.Username, hostId, request);
    if (result.Error == "confirmation-required")
    {
        return Results.Conflict(new
        {
            error = result.Error,
            requiredPhrase = agents.RequiredConfirmation(hostId, request)
        });
    }

    return result.Operation is null
        ? Results.BadRequest(new { error = result.Error ?? "operation-not-accepted" })
        : Results.Accepted($"/api/operations/{result.Operation.Id}", result.Operation);
});

app.MapPost("/api/hosts/{hostId}/power/prepare", async (
    string hostId,
    HttpContext context,
    SessionService sessions,
    AgentOperationsService agents) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    var request = await context.Request.ReadFromJsonAsync<PreparePowerRequest>();
    if (request is null || request.HostId != hostId)
    {
        return Results.BadRequest(new { error = "invalid-power-request" });
    }

    var challenge = agents.PreparePower(owner.Username, hostId, request.Kind);
    return challenge is null
        ? Results.Conflict(new { error = "host-offline-or-operation-unsupported" })
        : Results.Ok(challenge);
});

app.MapPost("/api/power/{challengeId}/confirm", async (
    string challengeId,
    HttpContext context,
    SessionService sessions,
    AgentOperationsService agents) =>
{
    var owner = sessions.GetOwner(context);
    if (owner is null)
    {
        return Results.Unauthorized();
    }

    var request = await context.Request.ReadFromJsonAsync<ConfirmPowerRequest>();
    if (request is null)
    {
        return Results.BadRequest(new { error = "invalid-confirmation" });
    }

    var operation = agents.ConfirmPower(owner.Username, challengeId, request.ConfirmationPhrase);
    return operation is null
        ? Results.Conflict(new { error = "confirmation-expired-or-mismatched" })
        : Results.Accepted($"/api/operations/{operation.Id}", operation);
});

app.MapGet("/api/operations/{operationId}", (
    string operationId,
    HttpContext context,
    SessionService sessions,
    ControlStateStore store) =>
{
    if (sessions.GetOwner(context) is null)
    {
        return Results.Unauthorized();
    }

    var operation = store.Read(state => state.Operations.FirstOrDefault(candidate => candidate.Id == operationId));
    return operation is null ? Results.NotFound() : Results.Ok(operation);
});

app.MapFallbackToFile("index.html");
app.Run();

static void SetSessionCookie(HttpContext context, string value, IWebHostEnvironment environment)
{
    context.Response.Cookies.Append(SessionService.CookieName, value, new CookieOptions
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment() || context.Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/",
        MaxAge = TimeSpan.FromHours(8)
    });
}

static bool SecureEnoughForCredentials(HttpContext context, IWebHostEnvironment environment) =>
    context.Request.IsHttps || (environment.IsDevelopment() && context.Connection.RemoteIpAddress is { } address && IPAddress.IsLoopback(address));

static bool HasSameOrigin(HttpRequest request)
{
    var origin = request.Headers.Origin.ToString();
    return Uri.TryCreate(origin, UriKind.Absolute, out var originUri) &&
           string.Equals(originUri.Scheme, request.Scheme, StringComparison.OrdinalIgnoreCase) &&
           string.Equals(originUri.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase);
}

static bool IsPrivateAddress(IPAddress? address)
{
    if (address is null)
    {
        return false;
    }

    if (address.IsIPv4MappedToIPv6)
    {
        address = address.MapToIPv4();
    }

    if (IPAddress.IsLoopback(address))
    {
        return true;
    }

    var bytes = address.GetAddressBytes();
    if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
    {
        return bytes[0] == 10 ||
               bytes[0] == 172 && bytes[1] is >= 16 and <= 31 ||
               bytes[0] == 192 && bytes[1] == 168 ||
               bytes[0] == 169 && bytes[1] == 254;
    }

    return address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 &&
           (address.IsIPv6LinkLocal || (bytes[0] & 0xfe) == 0xfc);
}
