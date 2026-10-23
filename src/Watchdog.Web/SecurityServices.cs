using System.Security.Cryptography;
using System.Text;

namespace Watchdog.Web;

public sealed class PasswordHasher
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int Iterations = 310_000;

    public (string Salt, string Hash) Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return (Convert.ToBase64String(salt), Convert.ToBase64String(hash));
    }

    public bool Verify(string password, string saltValue, string hashValue)
    {
        try
        {
            var salt = Convert.FromBase64String(saltValue);
            var expected = Convert.FromBase64String(hashValue);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed class SessionService(ControlStateStore store)
{
    public const string CookieName = "watchdog_session";
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    public OwnerRecord? GetOwner(HttpContext context)
    {
        if (!context.Request.Cookies.TryGetValue(CookieName, out var sessionId) ||
            string.IsNullOrWhiteSpace(sessionId))
        {
            return null;
        }

        var sessionHash = HashValue(sessionId);
        return store.Read(state =>
        {
            var session = state.Sessions.FirstOrDefault(candidate =>
                candidate.IdHash == sessionHash && candidate.ExpiresAt > DateTimeOffset.UtcNow);
            return session is null
                ? null
                : state.Owners.FirstOrDefault(owner => owner.Id == session.OwnerId);
        });
    }

    public string Create(OwnerRecord owner)
    {
        var sessionId = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        store.Mutate(state =>
        {
            state.Sessions.RemoveAll(session => session.ExpiresAt <= DateTimeOffset.UtcNow);
            state.Sessions.Add(new SessionRecord(
                HashValue(sessionId),
                owner.Id,
                DateTimeOffset.UtcNow.Add(Lifetime)));
            AddAudit(state, owner.Username, "session.created", owner.Id, "success", null);
        });
        return sessionId;
    }

    public void Revoke(HttpContext context)
    {
        if (context.Request.Cookies.TryGetValue(CookieName, out var sessionId))
        {
            var sessionHash = HashValue(sessionId);
            store.Mutate(state =>
            {
                var session = state.Sessions.FirstOrDefault(candidate => candidate.IdHash == sessionHash);
                if (session is not null)
                {
                    state.Sessions.Remove(session);
                    AddAudit(state, session.OwnerId, "session.revoked", session.OwnerId, "success", null);
                }
            });
        }
    }

    public static string HashValue(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    internal static void AddAudit(
        ControlState state,
        string actor,
        string action,
        string target,
        string outcome,
        string? detail)
    {
        state.Audit.Add(new AuditRecord(
            Guid.NewGuid().ToString("N"),
            DateTimeOffset.UtcNow,
            actor,
            action,
            target,
            outcome,
            detail));
        if (state.Audit.Count > 10_000)
        {
            state.Audit.RemoveRange(0, state.Audit.Count - 10_000);
        }
    }
}

public sealed class BootstrapService(
    ControlStateStore store,
    PasswordHasher passwordHasher,
    IConfiguration configuration,
    IWebHostEnvironment environment)
{
    public bool IsSetupRequired => !store.Read(state => state.OwnerCreated);

    public bool TryCreateOwner(string code, string username, string password, out OwnerRecord? owner)
    {
        owner = null;
        if (!ValidCredential(username, 3, 64) || password.Length < 14 || password.Length > 256)
        {
            return false;
        }

        var codeHash = HashBootstrapFile("WATCHDOG_PAIRING_CODE_FILE", "watchdog_pairing_code");
        if (codeHash is null)
        {
            return false;
        }

        var suppliedHash = SessionService.HashValue(code);
        var credentials = passwordHasher.Hash(password);
        owner = store.Mutate(state =>
        {
            if (state.OwnerCreated || state.BootstrapPairingConsumed ||
                !CryptographicOperations.FixedTimeEquals(
                    Convert.FromHexString(suppliedHash),
                    Convert.FromHexString(codeHash)))
            {
                SessionService.AddAudit(state, "bootstrap", "owner.pair", "first-owner", "rejected", null);
                return null;
            }

            var record = new OwnerRecord(
                Guid.NewGuid().ToString("N"),
                username.Trim(),
                credentials.Salt,
                credentials.Hash,
                DateTimeOffset.UtcNow);
            state.Owners.Add(record);
            state.OwnerCreated = true;
            state.BootstrapPairingConsumed = true;
            SessionService.AddAudit(state, record.Username, "owner.created", record.Id, "success", null);
            return record;
        });
        return owner is not null;
    }

    public bool TryLogin(string username, string password, out OwnerRecord? owner)
    {
        owner = store.Read(state => state.Owners.FirstOrDefault(candidate =>
            string.Equals(candidate.Username, username, StringComparison.OrdinalIgnoreCase)));
        return owner is not null && passwordHasher.Verify(password, owner.PasswordSalt, owner.PasswordHash);
    }

    public string? HashBootstrapFile(string environmentVariable, string fileName)
    {
        var secretPath = configuration[environmentVariable];
        if (string.IsNullOrWhiteSpace(secretPath))
        {
            return null;
        }

        var resolvedPath = Path.IsPathRooted(secretPath)
            ? secretPath
            : Path.Combine(environment.ContentRootPath, secretPath);
        if (!File.Exists(resolvedPath))
        {
            return null;
        }

        var secret = File.ReadAllText(resolvedPath).Trim();
        return secret.Length is >= 24 and <= 256 ? SessionService.HashValue(secret) : null;
    }

    private static bool ValidCredential(string value, int minimumLength, int maximumLength) =>
        value.Length >= minimumLength &&
        value.Length <= maximumLength &&
        value.All(character => char.IsLetterOrDigit(character) || character is '.' or '_' or '-');
}
