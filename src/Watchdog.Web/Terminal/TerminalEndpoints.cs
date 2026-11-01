namespace Watchdog.Web.Terminal;

public sealed record TerminalCreateRequest(string Shell, string? Name);

public sealed record TerminalInputRequest(string Text, string Mode);

public sealed record TerminalRenameRequest(string Name);

/// <summary>
/// Owner-only terminal routes. Every route requires a signed-in owner; the shared middleware
/// already limits the API to private addresses and requires same-origin writes. Request bodies
/// are never logged, and sessions are only visible to the owner who created them.
/// </summary>
public static class TerminalEndpoints
{
    private static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(20);

    public static void MapTerminal(this WebApplication app)
    {
        var group = app.MapGroup("/api/terminal");
        group.AddEndpointFilter(async (invocation, next) =>
            ArrivedThroughProxy(invocation.HttpContext.Request)
                ? Results.Json(new { error = "terminal-local-network-only" }, statusCode: StatusCodes.Status403Forbidden)
                : await next(invocation));

        group.MapGet("/capabilities", (HttpContext context, SessionService sessions, TerminalService terminal) =>
            sessions.GetOwner(context) is null ? Results.Unauthorized() : Results.Ok(terminal.Capabilities()));

        group.MapGet("/sessions", (HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            return owner is null ? Results.Unauthorized() : Results.Ok(new { sessions = terminal.List(owner.Username) });
        });

        group.MapPost("/sessions", async (HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            if (owner is null) return Results.Unauthorized();
            var request = await ReadAsync<TerminalCreateRequest>(context);
            if (request is null || string.IsNullOrWhiteSpace(request.Shell)) return Results.BadRequest(new { error = "invalid-session-request" });
            var (session, error) = terminal.Create(owner.Username, request.Shell, request.Name);
            if (session is null)
            {
                return error == "session-limit-reached"
                    ? Results.Conflict(new { error })
                    : Results.BadRequest(new { error });
            }

            return Results.Created($"/api/terminal/sessions/{session.Id}", session.View());
        });

        group.MapGet("/sessions/{id}", async (string id, long? after, bool? wait, HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            if (owner is null) return Results.Unauthorized();
            var session = terminal.Get(owner.Username, id);
            if (session is null) return Results.NotFound(new { error = "session-not-found" });
            var cursor = Math.Max(0, after ?? 0);
            if (wait == true)
            {
                await session.WaitForChangeAsync(cursor, MaxWait, context.RequestAborted);
            }

            var (view, events, more) = session.Read(cursor);
            return Results.Ok(new { session = view, events, more });
        });

        group.MapPost("/sessions/{id}/input", async (string id, HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            if (owner is null) return Results.Unauthorized();
            var session = terminal.Get(owner.Username, id);
            if (session is null) return Results.NotFound(new { error = "session-not-found" });
            var request = await ReadAsync<TerminalInputRequest>(context);
            if (request is null || request.Text is null || request.Mode is not ("command" or "stdin"))
            {
                return Results.BadRequest(new { error = "invalid-input-request" });
            }

            if (request.Text.Length > TerminalShells.Limits.MaxInputCharacters)
            {
                return Results.BadRequest(new { error = "input-too-long", limit = TerminalShells.Limits.MaxInputCharacters });
            }

            var error = session.Send(request.Text, request.Mode);
            return error is null
                ? Results.Accepted(value: session.View())
                : Results.Conflict(new { error, session = session.View() });
        });

        group.MapPatch("/sessions/{id}", async (string id, HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            if (owner is null) return Results.Unauthorized();
            var session = terminal.Get(owner.Username, id);
            if (session is null) return Results.NotFound(new { error = "session-not-found" });
            var request = await ReadAsync<TerminalRenameRequest>(context);
            var name = TerminalService.CleanName(request?.Name);
            if (name is null) return Results.BadRequest(new { error = "invalid-session-name" });
            session.Rename(name);
            return Results.Ok(session.View());
        });

        group.MapDelete("/sessions/{id}", (string id, bool? forget, HttpContext context, SessionService sessions, TerminalService terminal) =>
        {
            var owner = sessions.GetOwner(context);
            if (owner is null) return Results.Unauthorized();
            var found = forget == true ? terminal.Forget(owner.Username, id) : terminal.Stop(owner.Username, id);
            return found ? Results.NoContent() : Results.NotFound(new { error = "session-not-found" });
        });
    }

    private static readonly string[] ForwardingHeaders =
    [
        "Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-IP",
        "CF-Connecting-IP", "CF-Ray", "CF-Visitor", "Cdn-Loop", "True-Client-IP"
    ];

    /// <summary>
    /// Temporary public access forwards internet traffic to the controller from loopback, which
    /// passes the private-address check. The terminal therefore also refuses any request that
    /// carries proxy or tunnel forwarding headers or a tunnel host name, so it only works for a
    /// browser connected directly over the local network.
    /// </summary>
    public static bool ArrivedThroughProxy(HttpRequest request)
    {
        foreach (var header in ForwardingHeaders)
        {
            if (request.Headers.ContainsKey(header)) return true;
        }

        var host = request.Host.Host;
        return host.EndsWith(".trycloudflare.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".cfargotunnel.com", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<T?> ReadAsync<T>(HttpContext context) where T : class
    {
        try
        {
            return await context.Request.ReadFromJsonAsync<T>(context.RequestAborted);
        }
        catch (Exception exception) when (exception is System.Text.Json.JsonException or InvalidOperationException or BadHttpRequestException)
        {
            return null;
        }
    }
}
