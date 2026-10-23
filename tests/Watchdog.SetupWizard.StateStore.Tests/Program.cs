using System.Text.Json;
using Watchdog.SetupWizard;

var embeddedCompose = typeof(SetupStateStore).Assembly.GetManifestResourceStream("Watchdog.SetupWizard.compose.yaml")
    ?? throw new InvalidDataException("The setup assistant does not contain its bundled Compose resource.");
await using (embeddedCompose)
using (var composeBuffer = new MemoryStream())
{
    await embeddedCompose.CopyToAsync(composeBuffer);
    var bundledBytes = composeBuffer.ToArray();
    var sourceBytes = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "compose.yaml"));
    if (!bundledBytes.SequenceEqual(sourceBytes))
        throw new InvalidDataException("The setup assistant's embedded Compose resource differs from compose.yaml.");
}
Console.WriteLine("PASS: setup assistant embeds compose.yaml byte-for-byte.");

var testRoot = Path.Combine(Path.GetTempPath(), "watchdog-state-save-race-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(testRoot);
var statePath = Path.Combine(testRoot, "progress.json");

try
{
    const int writers = 32;
    var writes = Enumerable.Range(0, writers).Select(index => Task.Run(() =>
        SetupStateStore.SaveAsync(statePath, new SetupState
        {
            LastStep = index,
            HostPort = 12000 + index,
            StorageDirectory = Path.Combine(testRoot, "data"),
            ComposeDirectory = Path.Combine(testRoot, "service"),
        }))).ToArray();

    await Task.WhenAll(writes);

    var json = await File.ReadAllTextAsync(statePath);
    var state = JsonSerializer.Deserialize<SetupState>(json)
        ?? throw new InvalidDataException("Concurrent saves produced an empty setup record.");
    if (state.LastStep is < 0 or >= writers || state.HostPort != 12000 + state.LastStep)
        throw new InvalidDataException("The final setup record does not match one complete writer.");

    var remainingFiles = Directory.GetFiles(testRoot);
    if (remainingFiles.Length != 1 || !StringComparer.OrdinalIgnoreCase.Equals(remainingFiles[0], statePath))
        throw new IOException("Concurrent saves left an unexpected temporary file.");

    Console.WriteLine($"PASS: {writers} concurrent setup-state saves left valid JSON and no temporary files.");
    File.Delete(statePath);
    Directory.Delete(testRoot);
}
catch
{
    Console.Error.WriteLine($"State-save test data retained at {testRoot}");
    throw;
}
