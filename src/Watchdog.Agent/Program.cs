using Watchdog.Agent;

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("The host agent supports Windows only.");
    return 2;
}

if (args.Length > 0 && string.Equals(args[0], "install", StringComparison.OrdinalIgnoreCase))
{
    return await AgentInstaller.InstallAsync(args[1..]);
}

if (args.Length > 0 && string.Equals(args[0], "rollback", StringComparison.OrdinalIgnoreCase))
{
    return await AgentInstaller.RollbackAsync();
}

if (args.Length > 0 && !string.Equals(args[0], "run-service", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("Supported command: install --controller-url <https-url> --certificate-sha256 <64-hex> --enrollment-code-file <path>, or rollback.");
    return 2;
}

var configuration = AgentConfigurationStore.Load();
if (configuration is null)
{
    Console.Error.WriteLine("Agent configuration is unavailable. Run the setup assistant from a trusted release.");
    return 2;
}

var builder = Host.CreateApplicationBuilder();
builder.Services.AddWindowsService(options => options.ServiceName = AgentConfigurationStore.ServiceDisplayName);
builder.Services.AddSingleton(configuration);
builder.Services.AddSingleton<AgentConfigurationStore>();
builder.Services.AddSingleton<HostInventoryCollector>();
builder.Services.AddSingleton<AgentOperationExecutor>();
builder.Services.AddHostedService<Worker>();
await builder.Build().RunAsync();
return 0;
