using System.Text.Json;

namespace Watchdog.Web;

public sealed class ControlStateStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly object _sync = new();
    private readonly string _statePath;
    private ControlState _state;

    public ControlStateStore(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var dataDirectory = configuration["WATCHDOG_DATA_PATH"]
            ?? Path.Combine(environment.ContentRootPath, "data");
        Directory.CreateDirectory(dataDirectory);
        _statePath = Path.Combine(dataDirectory, "control-state.json");
        _state = Load();
    }

    public T Read<T>(Func<ControlState, T> selector)
    {
        lock (_sync)
        {
            return selector(_state);
        }
    }

    public T Mutate<T>(Func<ControlState, T> mutation)
    {
        lock (_sync)
        {
            var result = mutation(_state);
            Save(_state);
            return result;
        }
    }

    public void Mutate(Action<ControlState> mutation)
    {
        lock (_sync)
        {
            mutation(_state);
            Save(_state);
        }
    }

    private ControlState Load()
    {
        if (!File.Exists(_statePath))
        {
            return new ControlState();
        }

        try
        {
            var state = JsonSerializer.Deserialize<ControlState>(File.ReadAllText(_statePath), JsonOptions);
            if (state is null || state.SchemaVersion != 1)
            {
                throw new InvalidDataException("The persisted control state has an unsupported schema.");
            }

            return state;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("The persisted control state could not be read safely.", exception);
        }
    }

    private void Save(ControlState state)
    {
        var temporaryPath = _statePath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(state, JsonOptions));
        File.Move(temporaryPath, _statePath, overwrite: true);
    }
}
