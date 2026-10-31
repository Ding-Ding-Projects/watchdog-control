using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Watchdog.Agent.CodexRemote;

/// <summary>Where a command runs and with which environment.</summary>
public sealed record CodexLaunchContext(
    string RunAs,
    string Executable,
    IReadOnlyDictionary<string, string> Environment);

/// <summary>
/// Starts the command-line tool with a fixed argument list. Arguments never come from the
/// controller or the browser; every call site passes compile-time constants.
/// </summary>
public static class CodexProcessLauncher
{
    public static CapturedProcess Start(CodexLaunchContext context, IReadOnlyList<string> arguments, bool killWithJob)
    {
        foreach (var argument in arguments)
        {
            if (argument.Length == 0 || argument.Any(character => char.IsWhiteSpace(character) || character is '"' or '&' or '|' or '<' or '>' or '^' or '%'))
                throw new InvalidOperationException("The command argument list is invalid.");
        }

        var (fileName, commandLineArguments) = BuildCommand(context.Executable, arguments);
        return context.RunAs == CodexSettings.InteractiveUser
            ? InteractiveUserProcess.Start(fileName, commandLineArguments, context.Environment, killWithJob)
            : ServiceAccountProcess.Start(fileName, commandLineArguments, context.Environment);
    }

    private static (string FileName, string Arguments) BuildCommand(string executable, IReadOnlyList<string> arguments)
    {
        var joined = string.Join(' ', arguments);
        if (executable.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase))
        {
            var shell = Path.Combine(System.Environment.SystemDirectory, "cmd.exe");
            return (shell, "/d /s /c \"\"" + executable + "\" " + joined + "\"");
        }
        return (executable, joined);
    }

    /// <summary>Returns the environment the command will see for the selected account.</summary>
    public static Dictionary<string, string> BaseEnvironment(string runAs)
    {
        if (runAs == CodexSettings.InteractiveUser) return InteractiveUserProcess.UserEnvironment();
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (System.Collections.DictionaryEntry entry in System.Environment.GetEnvironmentVariables())
        {
            if (entry.Key is string key && entry.Value is string value) values[key] = value;
        }
        return values;
    }

    private sealed class ServiceAccountProcess : CapturedProcess
    {
        private readonly Process _process;

        private ServiceAccountProcess(Process process)
        {
            _process = process;
            Capture(process.StandardOutput);
            Capture(process.StandardError);
        }

        public static CapturedProcess Start(string fileName, string arguments, IReadOnlyDictionary<string, string> environment)
        {
            var start = new ProcessStartInfo(fileName, arguments)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = OutputEncoding,
                StandardErrorEncoding = OutputEncoding,
                WorkingDirectory = System.Environment.SystemDirectory
            };
            start.Environment.Clear();
            foreach (var pair in environment) start.Environment[pair.Key] = pair.Value;
            var process = Process.Start(start) ?? throw new InvalidOperationException("The command-line tool could not be started.");
            process.StandardInput.Close();
            return new ServiceAccountProcess(process);
        }

        public override int ProcessId => _process.Id;
        public override bool HasExited => _process.HasExited;
        public override int? ExitCode => _process.HasExited ? _process.ExitCode : null;
        public override Task WaitForExitAsync(CancellationToken cancellationToken) => _process.WaitForExitAsync(cancellationToken);

        public override void Kill()
        {
            try { if (!_process.HasExited) _process.Kill(entireProcessTree: true); }
            catch (Exception exception) when (exception is InvalidOperationException or Win32Exception) { }
        }

        public override void Dispose() => _process.Dispose();
    }

    private sealed class InteractiveUserProcess : CapturedProcess
    {
        private readonly SafeProcessHandle _process;
        private readonly SafeFileHandle? _job;
        private readonly int _processId;
        private readonly Task _exit;

        private InteractiveUserProcess(SafeProcessHandle process, int processId, SafeFileHandle? job, SafeFileHandle outputRead)
        {
            _process = process;
            _processId = processId;
            _job = job;
            var stream = new FileStream(outputRead, FileAccess.Read, 4096, isAsync: false);
            Capture(new StreamReader(stream, OutputEncoding));
            _exit = Task.Run(() => WaitForSingleObject(_process, Infinite));
        }

        public static Dictionary<string, string> UserEnvironment()
        {
            using var token = ActiveUserToken();
            return ReadEnvironmentBlock(token);
        }

        public static CapturedProcess Start(string fileName, string arguments, IReadOnlyDictionary<string, string> environment, bool killWithJob)
        {
            using var token = ActiveUserToken();
            var security = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), InheritHandle = true };
            if (!CreatePipe(out var outputRead, out var outputWrite, ref security, 0)) throw new Win32Exception(Marshal.GetLastWin32Error(), "The output pipe could not be created.");
            if (!CreatePipe(out var inputRead, out var inputWrite, ref security, 0))
            {
                outputRead.Dispose();
                outputWrite.Dispose();
                throw new Win32Exception(Marshal.GetLastWin32Error(), "The input pipe could not be created.");
            }
            SetHandleInformation(outputRead, HandleFlagInherit, 0);
            SetHandleInformation(inputWrite, HandleFlagInherit, 0);

            SafeFileHandle? job = null;
            var environmentBlock = BuildEnvironmentBlock(environment);
            var startup = new StartupInfo
            {
                Size = Marshal.SizeOf<StartupInfo>(),
                Desktop = "winsta0\\default",
                Flags = StartfUseStdHandles | StartfUseShowWindow,
                ShowWindow = 0,
                StdInput = inputRead.DangerousGetHandle(),
                StdOutput = outputWrite.DangerousGetHandle(),
                StdError = outputWrite.DangerousGetHandle()
            };
            var flags = CreateUnicodeEnvironment | CreateNoWindow | (killWithJob ? CreateSuspended : 0);
            var commandLine = new StringBuilder("\"" + fileName + "\" " + arguments);
            var profile = ProfileDirectory(token);
            try
            {
                if (!CreateProcessAsUser(token, fileName, commandLine, IntPtr.Zero, IntPtr.Zero, true, flags, environmentBlock, profile, ref startup, out var information))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "The command-line tool could not be started for the signed-in user.");
                using var thread = new SafeProcessHandle(information.Thread, ownsHandle: true);
                var process = new SafeProcessHandle(information.Process, ownsHandle: true);
                if (killWithJob)
                {
                    job = CreateKillOnCloseJob();
                    if (!AssignProcessToJobObject(job, process))
                    {
                        job.Dispose();
                        job = null;
                    }
                    ResumeThread(thread);
                }
                return new InteractiveUserProcess(process, information.ProcessId, job, outputRead);
            }
            catch
            {
                outputRead.Dispose();
                job?.Dispose();
                throw;
            }
            finally
            {
                Marshal.FreeHGlobal(environmentBlock);
                outputWrite.Dispose();
                inputRead.Dispose();
                inputWrite.Dispose();
            }
        }

        public override int ProcessId => _processId;
        public override bool HasExited => _exit.IsCompleted;

        public override int? ExitCode
        {
            get
            {
                if (!_exit.IsCompleted) return null;
                return GetExitCodeProcess(_process, out var code) ? unchecked((int)code) : null;
            }
        }

        public override Task WaitForExitAsync(CancellationToken cancellationToken) => _exit.WaitAsync(cancellationToken);

        public override void Kill()
        {
            if (_exit.IsCompleted) return;
            if (_job is not null) TerminateJobObject(_job, 1);
            else TerminateProcess(_process, 1);
        }

        public override void Dispose()
        {
            _job?.Dispose();
            if (_exit.IsCompleted) _process.Dispose();
        }

        private static SafeAccessTokenHandle ActiveUserToken()
        {
            var session = WTSGetActiveConsoleSessionId();
            if (session == 0xFFFFFFFF || !WTSQueryUserToken(session, out var impersonation))
                throw new InvalidOperationException("No signed-in Windows user was found at this computer's console. Sign in at the computer, or set the remote agent to run as the service account.");
            using (impersonation)
            {
                if (!DuplicateTokenEx(impersonation, MaximumAllowed, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out var primary))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "The signed-in user's token could not be prepared.");
                return primary;
            }
        }

        private static string? ProfileDirectory(SafeAccessTokenHandle token)
        {
            var size = 0;
            GetUserProfileDirectory(token, null, ref size);
            if (size <= 0 || size > 32_768) return null;
            var buffer = new StringBuilder(size);
            return GetUserProfileDirectory(token, buffer, ref size) ? buffer.ToString() : null;
        }

        private static Dictionary<string, string> ReadEnvironmentBlock(SafeAccessTokenHandle token)
        {
            if (!CreateEnvironmentBlock(out var block, token, false))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "The signed-in user's environment could not be read.");
            try
            {
                var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var offset = 0;
                while (true)
                {
                    var entry = Marshal.PtrToStringUni(IntPtr.Add(block, offset));
                    if (string.IsNullOrEmpty(entry)) break;
                    offset += (entry.Length + 1) * 2;
                    var separator = entry.IndexOf('=', 1);
                    if (separator > 0) values[entry[..separator]] = entry[(separator + 1)..];
                    if (offset > 1_048_576) break;
                }
                return values;
            }
            finally
            {
                DestroyEnvironmentBlock(block);
            }
        }

        private static IntPtr BuildEnvironmentBlock(IReadOnlyDictionary<string, string> environment)
        {
            var builder = new StringBuilder();
            foreach (var pair in environment.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase))
            {
                if (pair.Key.Length == 0 || pair.Key.Contains('=') || pair.Key.Contains('\0') || pair.Value.Contains('\0')) continue;
                builder.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
            }
            builder.Append('\0');
            return Marshal.StringToHGlobalUni(builder.ToString());
        }

        private static SafeFileHandle CreateKillOnCloseJob()
        {
            var job = CreateJobObject(IntPtr.Zero, null);
            if (job.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "The process group could not be created.");
            var limits = new JobObjectExtendedLimitInformation();
            limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
            var length = Marshal.SizeOf<JobObjectExtendedLimitInformation>();
            var pointer = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(limits, pointer, false);
                if (!SetInformationJobObject(job, JobObjectExtendedLimitInformationClass, pointer, (uint)length))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "The process group limits could not be applied.");
            }
            finally
            {
                Marshal.FreeHGlobal(pointer);
            }
            return job;
        }

        private const uint Infinite = 0xFFFFFFFF;
        private const uint HandleFlagInherit = 1;
        private const int StartfUseStdHandles = 0x100;
        private const int StartfUseShowWindow = 0x1;
        private const uint CreateUnicodeEnvironment = 0x400;
        private const uint CreateNoWindow = 0x08000000;
        private const uint CreateSuspended = 0x4;
        private const uint MaximumAllowed = 0x02000000;
        private const int SecurityImpersonation = 2;
        private const int TokenPrimary = 1;
        private const int JobObjectExtendedLimitInformationClass = 9;
        private const uint JobObjectLimitKillOnJobClose = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        private struct SecurityAttributes { public int Length; public IntPtr SecurityDescriptor; public bool InheritHandle; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo
        {
            public int Size; public string? Reserved; public string? Desktop; public string? Title;
            public int X; public int Y; public int XSize; public int YSize; public int XCountChars; public int YCountChars;
            public int FillAttribute; public int Flags; public short ShowWindow; public short Reserved2;
            public IntPtr Reserved2Pointer; public IntPtr StdInput; public IntPtr StdOutput; public IntPtr StdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation { public IntPtr Process; public IntPtr Thread; public int ProcessId; public int ThreadId; }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectBasicLimitInformation
        {
            public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
            public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
            public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectExtendedLimitInformation
        {
            public JobObjectBasicLimitInformation BasicLimitInformation; public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll")]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool WTSQueryUserToken(uint sessionId, out SafeAccessTokenHandle token);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DuplicateTokenEx(SafeAccessTokenHandle existing, uint access, IntPtr attributes, int level, int type, out SafeAccessTokenHandle duplicate);

        [DllImport("userenv.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateEnvironmentBlock(out IntPtr environment, SafeAccessTokenHandle token, bool inherit);

        [DllImport("userenv.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DestroyEnvironmentBlock(IntPtr environment);

        [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetUserProfileDirectory(SafeAccessTokenHandle token, StringBuilder? path, ref int size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreatePipe(out SafeFileHandle read, out SafeFileHandle write, ref SecurityAttributes attributes, uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetHandleInformation(SafeFileHandle handle, uint mask, uint flags);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateProcessAsUser(SafeAccessTokenHandle token, string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string? currentDirectory, ref StartupInfo startup, out ProcessInformation information);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(SafeProcessHandle thread);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(SafeProcessHandle handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetExitCodeProcess(SafeProcessHandle process, out uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateProcess(SafeProcessHandle process, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string? name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(SafeFileHandle job, int informationClass, IntPtr information, uint length);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AssignProcessToJobObject(SafeFileHandle job, SafeProcessHandle process);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateJobObject(SafeFileHandle job, uint exitCode);
    }
}
