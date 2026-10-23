using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Watchdog.Contracts;

namespace Watchdog.Agent;

public sealed class Worker(
    ILogger<Worker> logger,
    AgentConfiguration configuration,
    AgentConfigurationStore configurationStore,
    HostInventoryCollector inventory,
    AgentOperationExecutor operations) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { MaxDepth = 24 };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var client = CreatePinnedClient(configuration);
        var token = configurationStore.ReadToken();
        if (token is null)
        {
            token = await EnrollAsync(client, stoppingToken);
            if (token is null)
            {
                AgentRuntimeStatusStore.Write("enrollment-pending", "The one-time enrollment code was not accepted.");
                return;
            }
            configurationStore.WriteToken(token);
            configurationStore.RemoveEnrollmentCode();
        }

        var delay = TimeSpan.FromSeconds(2);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                AgentRuntimeStatusStore.Write("connecting", "Connecting to the pinned HTTPS controller.");
                using var heartbeatRequest = new HttpRequestMessage(HttpMethod.Post, "api/agent/heartbeat")
                {
                    Content = JsonContent.Create(inventory.Collect(configuration), options: JsonOptions)
                };
                heartbeatRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                using var heartbeatResponse = await client.SendAsync(heartbeatRequest, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
                if (heartbeatResponse.StatusCode == HttpStatusCode.Unauthorized)
                {
                    AgentRuntimeStatusStore.Write("revoked", "The controller rejected the enrolled agent credential. Re-pair this computer from its owner account.");
                    logger.LogWarning("The controller rejected the enrolled agent credential; automatic re-enrollment is disabled.");
                    return;
                }
                heartbeatResponse.EnsureSuccessStatusCode();

                using var pollRequest = new HttpRequestMessage(HttpMethod.Get, "api/agent/poll");
                pollRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                using var pollResponse = await client.SendAsync(pollRequest, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
                if (pollResponse.StatusCode == HttpStatusCode.Unauthorized)
                {
                    AgentRuntimeStatusStore.Write("revoked", "The controller rejected the enrolled agent credential. Re-pair this computer from its owner account.");
                    return;
                }
                pollResponse.EnsureSuccessStatusCode();
                var poll = await pollResponse.Content.ReadFromJsonAsync<AgentPollResponse>(JsonOptions, stoppingToken);
                if (poll?.Operation is not null)
                {
                    var result = await operations.ExecuteAsync(poll.Operation, stoppingToken);
                    using var resultRequest = new HttpRequestMessage(HttpMethod.Post, "api/agent/results")
                    {
                        Content = JsonContent.Create(result, options: JsonOptions)
                    };
                    resultRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                    using var resultResponse = await client.SendAsync(resultRequest, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
                    resultResponse.EnsureSuccessStatusCode();
                }

                AgentRuntimeStatusStore.Write("online", "The pinned controller accepted the latest host inventory.");
                delay = TimeSpan.FromSeconds(Math.Clamp(poll?.PollAfterSeconds ?? 15, 5, 60));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception) when (exception is HttpRequestException or IOException or JsonException or InvalidOperationException)
            {
                AgentRuntimeStatusStore.Write("offline", "The controller is unreachable or returned an invalid response.");
                logger.LogWarning("Controller exchange failed with {FailureType}; the agent will retry.", exception.GetType().Name);
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
            }

            await Task.Delay(delay, stoppingToken);
        }

        AgentRuntimeStatusStore.Write("stopped", "The Windows service stopped.");
    }

    private async Task<string?> EnrollAsync(HttpClient client, CancellationToken cancellationToken)
    {
        var codePath = configuration.EnrollmentCodePath;
        if (string.IsNullOrWhiteSpace(codePath) || !File.Exists(codePath))
        {
            AgentRuntimeStatusStore.Write("enrollment-pending", "The one-time enrollment code file is not available.");
            return null;
        }

        var code = (await File.ReadAllTextAsync(codePath, cancellationToken)).Trim();
        if (code.Length is < 24 or > 256)
        {
            AgentRuntimeStatusStore.Write("enrollment-pending", "The one-time enrollment code file has an invalid size.");
            return null;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/agent/enroll")
        {
            Content = JsonContent.Create(new EnrollRequest(
                configuration.AgentId,
                configuration.DisplayName,
                "Windows",
                typeof(Worker).Assembly.GetName().Version?.ToString() ?? "0.1.2"), options: JsonOptions)
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", code);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            logger.LogError("The controller rejected the one-time host enrollment code.");
            return null;
        }
        response.EnsureSuccessStatusCode();
        using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        if (!body.RootElement.TryGetProperty("accessToken", out var token) || token.ValueKind != JsonValueKind.String ||
            token.GetString() is not { Length: >= 32 and <= 256 } value)
        {
            throw new InvalidDataException("The controller enrollment response did not contain a valid agent credential.");
        }
        return value;
    }

    private static HttpClient CreatePinnedClient(AgentConfiguration settings)
    {
        var expected = Convert.FromHexString(settings.CertificateSha256);
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (_, certificate, _, _) =>
            {
                if (certificate is null) return false;
                var actual = certificate.GetCertHash(HashAlgorithmName.SHA256);
                return CryptographicOperations.FixedTimeEquals(actual, expected);
            }
        };
        return new HttpClient(handler, disposeHandler: true)
        {
            BaseAddress = new Uri(settings.ControllerUrl, UriKind.Absolute),
            Timeout = TimeSpan.FromSeconds(20)
        };
    }
}
