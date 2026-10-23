using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

namespace Watchdog.SetupWizard;

internal sealed record SetupFileContent(string RelativePath, byte[] Bytes);

internal static class SetupFilePersistence
{
    private const long MaximumExistingFileBytes = 1024 * 1024;

    public static async Task<string?> PersistAsync(
        string rootDirectory,
        IReadOnlyCollection<SetupFileContent> files,
        Func<IReadOnlyList<string>, string, bool> confirmReplacement,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectory);
        ArgumentNullException.ThrowIfNull(files);
        ArgumentNullException.ThrowIfNull(confirmReplacement);

        var root = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(root);
        var rootPrefix = Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar;
        var snapshots = new List<FileSnapshot>(files.Count);
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(file.RelativePath) || Path.IsPathRooted(file.RelativePath))
                throw new InvalidDataException("A generated setup file path must be relative to the selected service folder.");

            var destination = Path.GetFullPath(Path.Combine(root, file.RelativePath));
            if (!destination.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) || !seenPaths.Add(destination))
                throw new InvalidDataException("A generated setup file path is duplicated or escapes the selected service folder.");

            byte[]? originalBytes = null;
            if (File.Exists(destination))
            {
                var info = new FileInfo(destination);
                if (info.Length > MaximumExistingFileBytes)
                    throw new InvalidDataException($"Existing {file.RelativePath} is larger than the safe setup limit. It was left unchanged.");
                originalBytes = await File.ReadAllBytesAsync(destination, cancellationToken);
            }

            snapshots.Add(new FileSnapshot(file, destination, originalBytes));
        }

        var conflicts = snapshots
            .Where(snapshot => snapshot.OriginalBytes is not null && !snapshot.OriginalBytes.AsSpan().SequenceEqual(snapshot.File.Bytes))
            .ToArray();

        string? backupDirectory = null;
        var backupPaths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (conflicts.Length > 0)
        {
            backupDirectory = Path.Combine(
                root,
                ".watchdog-control-backups",
                DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffZ", System.Globalization.CultureInfo.InvariantCulture) + "-" + Guid.NewGuid().ToString("N"));
            var relativePaths = conflicts.Select(conflict => conflict.File.RelativePath).ToArray();
            if (!confirmReplacement(relativePaths, backupDirectory))
                throw new InvalidOperationException("Setup was cancelled. Differing local setup files were left unchanged.");

            foreach (var conflict in conflicts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var backupPath = Path.Combine(backupDirectory, conflict.File.RelativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);
                await WriteNewFileAsync(backupPath, conflict.OriginalBytes!, cancellationToken);
                var backupBytes = await File.ReadAllBytesAsync(backupPath, cancellationToken);
                if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(backupBytes), SHA256.HashData(conflict.OriginalBytes!)))
                    throw new IOException($"The backup for {conflict.File.RelativePath} did not match its original bytes. The original file was not replaced.");
                backupPaths.Add(conflict.Destination, backupPath);
            }
        }

        var staged = new List<StagedFile>();
        var applied = new List<FileSnapshot>();
        try
        {
            foreach (var snapshot in snapshots)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (snapshot.OriginalBytes is not null && snapshot.OriginalBytes.AsSpan().SequenceEqual(snapshot.File.Bytes))
                    continue;

                Directory.CreateDirectory(Path.GetDirectoryName(snapshot.Destination)!);
                var snapshotForWrite = backupPaths.TryGetValue(snapshot.Destination, out var backupPath)
                    ? snapshot with { BackupPath = backupPath }
                    : snapshot;
                var temporary = Path.Combine(
                    Path.GetDirectoryName(snapshot.Destination)!,
                    "." + Path.GetFileName(snapshot.Destination) + "." + Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    await WriteNewFileAsync(temporary, snapshot.File.Bytes, cancellationToken);
                    var stagedBytes = await File.ReadAllBytesAsync(temporary, cancellationToken);
                    if (!stagedBytes.AsSpan().SequenceEqual(snapshot.File.Bytes))
                        throw new IOException($"The staged setup file {snapshot.File.RelativePath} did not match its expected bytes.");
                    staged.Add(new StagedFile(snapshotForWrite, temporary));
                }
                catch
                {
                    try { if (File.Exists(temporary)) File.Delete(temporary); }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                    throw;
                }
            }

            foreach (var item in staged)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await ApplyStagedFileAsync(item, cancellationToken);
                applied.Add(item.Snapshot);
            }

            return backupDirectory;
        }
        catch (Exception writeError)
        {
            var rollbackErrors = new List<Exception>();
            foreach (var snapshot in applied.AsEnumerable().Reverse())
            {
                try
                {
                    if (!File.Exists(snapshot.Destination))
                    {
                        rollbackErrors.Add(new IOException($"{snapshot.File.RelativePath} is missing after setup. Its verified backup remains available."));
                        continue;
                    }
                    var currentBytes = await File.ReadAllBytesAsync(snapshot.Destination, CancellationToken.None);
                    if (!currentBytes.AsSpan().SequenceEqual(snapshot.File.Bytes))
                    {
                        rollbackErrors.Add(new IOException($"{snapshot.File.RelativePath} changed after setup wrote it. Rollback left the newer file untouched."));
                        continue;
                    }

                    var displacedPath = Path.Combine(
                        Path.GetDirectoryName(snapshot.Destination)!,
                        "." + Path.GetFileName(snapshot.Destination) + "." + Guid.NewGuid().ToString("N") + ".rollback");
                    File.Move(snapshot.Destination, displacedPath, overwrite: false);
                    var displacedBytes = await File.ReadAllBytesAsync(displacedPath, CancellationToken.None);
                    if (!displacedBytes.AsSpan().SequenceEqual(snapshot.File.Bytes))
                    {
                        TryRestoreWithoutOverwrite(displacedPath, snapshot.Destination);
                        rollbackErrors.Add(new IOException($"{snapshot.File.RelativePath} changed during rollback and was left untouched."));
                        continue;
                    }

                    if (snapshot.OriginalBytes is null)
                    {
                        File.Delete(displacedPath);
                    }
                    else
                    {
                        var liveBackupPath = snapshot.BackupPath + ".live";
                        if (!File.Exists(liveBackupPath))
                        {
                            TryRestoreWithoutOverwrite(displacedPath, snapshot.Destination);
                            rollbackErrors.Add(new IOException($"The original {snapshot.File.RelativePath} is missing from its verified backup folder."));
                            continue;
                        }
                        var backupBytes = await File.ReadAllBytesAsync(liveBackupPath, CancellationToken.None);
                        if (!backupBytes.AsSpan().SequenceEqual(snapshot.OriginalBytes))
                        {
                            TryRestoreWithoutOverwrite(displacedPath, snapshot.Destination);
                            rollbackErrors.Add(new IOException($"The original backup for {snapshot.File.RelativePath} changed. The current file was left untouched."));
                            continue;
                        }
                        try
                        {
                            File.Move(liveBackupPath, snapshot.Destination, overwrite: false);
                            try { File.Delete(displacedPath); }
                            catch (IOException) { }
                            catch (UnauthorizedAccessException) { }
                        }
                        catch (Exception restoreError)
                        {
                            TryRestoreWithoutOverwrite(displacedPath, snapshot.Destination);
                            rollbackErrors.Add(new IOException($"The original {snapshot.File.RelativePath} remains preserved in its backup folder." , restoreError));
                        }
                    }
                }
                catch (Exception rollbackError)
                {
                    rollbackErrors.Add(rollbackError);
                }
            }

            if (rollbackErrors.Count > 0)
            {
                var backupNote = backupDirectory is null ? string.Empty : $" Verified backups remain in {backupDirectory}.";
                throw new IOException("Setup-file replacement stopped and automatic rollback was incomplete." + backupNote, new AggregateException(new[] { writeError }.Concat(rollbackErrors)));
            }

            throw;
        }
        finally
        {
            foreach (var item in staged)
            {
                try { if (File.Exists(item.TemporaryPath)) File.Delete(item.TemporaryPath); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
    }

    private static void EnsureTargetHasNotChanged(FileSnapshot snapshot)
    {
        if (snapshot.OriginalBytes is null)
        {
            if (File.Exists(snapshot.Destination))
                throw new IOException($"A local file appeared at {snapshot.File.RelativePath} during setup. It was left unchanged.");
            return;
        }

        if (!File.Exists(snapshot.Destination))
            throw new IOException($"Existing {snapshot.File.RelativePath} disappeared during setup. No replacement was written.");
        if (new FileInfo(snapshot.Destination).Length > MaximumExistingFileBytes)
            throw new IOException($"Existing {snapshot.File.RelativePath} grew beyond the safe setup limit and was left unchanged.");
        var currentBytes = File.ReadAllBytes(snapshot.Destination);
        if (!currentBytes.AsSpan().SequenceEqual(snapshot.OriginalBytes))
            throw new IOException($"Existing {snapshot.File.RelativePath} changed during setup. The new file was not written over it.");
    }

    private static async Task ApplyStagedFileAsync(StagedFile item, CancellationToken cancellationToken)
    {
        var snapshot = item.Snapshot;
        EnsureTargetHasNotChanged(snapshot);
        if (snapshot.OriginalBytes is null)
        {
            File.Move(item.TemporaryPath, snapshot.Destination, overwrite: false);
            return;
        }

        var liveBackupPath = snapshot.BackupPath + ".live";
        File.Move(snapshot.Destination, liveBackupPath, overwrite: false);
        try
        {
            var movedBytes = await File.ReadAllBytesAsync(liveBackupPath, CancellationToken.None);
            var backupBytes = await File.ReadAllBytesAsync(snapshot.BackupPath!, CancellationToken.None);
            if (!movedBytes.AsSpan().SequenceEqual(snapshot.OriginalBytes) || !movedBytes.AsSpan().SequenceEqual(backupBytes))
                throw new IOException($"Existing {snapshot.File.RelativePath} changed during setup.");
        }
        catch (Exception verificationError)
        {
            if (!File.Exists(snapshot.Destination))
            {
                try
                {
                    File.Move(liveBackupPath, snapshot.Destination, overwrite: false);
                }
                catch (Exception restoreError)
                {
                    throw new IOException(
                        $"Replacement stopped before writing {snapshot.File.RelativePath}. Its moved original remains preserved at {liveBackupPath}.",
                        new AggregateException(verificationError, restoreError));
                }
            }
            else
            {
                throw new IOException(
                    $"Replacement stopped before writing {snapshot.File.RelativePath}. A newer file occupies the destination, and the moved original remains preserved at {liveBackupPath}.",
                    verificationError);
            }

            throw new IOException(
                $"Replacement stopped before writing {snapshot.File.RelativePath}. The moved original was restored; the verified backup remains at {snapshot.BackupPath}.",
                verificationError);
        }

        try
        {
            File.Move(item.TemporaryPath, snapshot.Destination, overwrite: false);
        }
        catch (Exception installError)
        {
            if (!File.Exists(snapshot.Destination))
            {
                try { File.Move(liveBackupPath, snapshot.Destination, overwrite: false); }
                catch (Exception restoreError)
                {
                    throw new IOException($"The new {snapshot.File.RelativePath} was not installed. Its original remains preserved at {liveBackupPath}.", new AggregateException(installError, restoreError));
                }
            }
            throw new IOException(
                $"The new {snapshot.File.RelativePath} was not installed. Its verified original remains preserved at {liveBackupPath}.",
                installError);
        }
    }

    private static void TryRestoreWithoutOverwrite(string sourcePath, string destinationPath)
    {
        if (!File.Exists(sourcePath) || File.Exists(destinationPath)) return;
        File.Move(sourcePath, destinationPath, overwrite: false);
    }

    private static async Task WriteNewFileAsync(string path, byte[] bytes, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 16 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough);
        await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private sealed record FileSnapshot(SetupFileContent File, string Destination, byte[]? OriginalBytes, string? BackupPath = null);
    private sealed record StagedFile(FileSnapshot Snapshot, string TemporaryPath);
}
