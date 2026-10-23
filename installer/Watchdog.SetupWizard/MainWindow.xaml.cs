using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Navigation;
using System.Windows.Automation.Peers;
using Microsoft.Win32;

namespace Watchdog.SetupWizard;

public partial class MainWindow : Window
{
    private const int StepCount = 6;
    private const string OwnerRepository = "Ding-Ding-Projects/watchdog-control";
    private const string ManifestAssetName = "watchdog-release-manifest.json";
    private const string ImagePrefix = "ghcr.io/ding-ding-projects/watchdog-control@sha256:";
    private static readonly TimeSpan CommandTimeout = TimeSpan.FromMinutes(12);
    private static readonly HttpClient Http = CreateHttpClient();
    private readonly SetupPrerequisites _setupPrerequisites = new(Http);
    private readonly SetupStateStore _stateStore = new();
    private SetupState _state = new();
    private CancellationTokenSource? _operationCancellation;
    private int _step = 0;
    private bool _operationRunning;
    private string _pairingCode = string.Empty;
    private string _certificatePath = string.Empty;
    private string _certificatePasswordPath = string.Empty;
    private string _pairingPath = string.Empty;
    private string _agentEnrollmentPath = string.Empty;
    private string _certificateFingerprint = string.Empty;
    private string _publicCertificatePath = string.Empty;
    private TextBox? _portBox;
    private TextBox? _storageBox;
    private ComboBox? _lanBindBox;
    private TextBlock? _prerequisiteStatus;
    private TextBlock? _operationOutput;
    private ProgressBar? _operationProgress;
    private TextBlock? _reviewDetails;
    private Button? _installDockerButton;
    private Button? _startInstallButton;
    private Button? _quickHostButton;
    private Button? _finishButton;
    private Button? _retryAgentButton;
    private CheckBox? _systemServiceConsent;
    private CheckBox? _progressRecoveryAcknowledgement;
    private CheckBox? _storageChoiceConfirmation;
    private TextBlock? _pageHeading;
    private readonly List<StepIndicator> _indicators = [];

    public MainWindow()
    {
        InitializeComponent();
        BuildStepList();
        VersionText.Text = BuildProvenance.ReadableLabel();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _state = await _stateStore.LoadAsync();
        _certificateFingerprint = _state.CertificateFingerprint ?? string.Empty;
        _publicCertificatePath = _state.PublicCertificatePath ?? string.Empty;
        _agentEnrollmentPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ding-Ding-Projects", "WatchdogControlSetup", "secrets", "watchdog_agent_enrollment_code");
        var pairingPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ding-Ding-Projects", "WatchdogControlSetup", "secrets", "watchdog_pairing_code");
        if (!_state.PairingCodeShown && File.Exists(pairingPath)) _pairingCode = await File.ReadAllTextAsync(pairingPath);
        if (_state.ProgressRecoveryWarning is not null)
            _step = 0;
        else if (!string.IsNullOrWhiteSpace(_state.StorageDirectory))
            _step = Math.Clamp(_state.LastStep, 0, StepCount - 1);
        RenderStep();
        if (_step is 0 or 2)
            await ProbeDockerAsync();
        await ProbeReleaseAsync();
        ApplyCompactWindowLayout();
        FocusPageHeading();
    }

    private async Task ProbeReleaseAsync()
    {
        try
        {
            await EnsureManifestAsync(CancellationToken.None);
            await LoadBundledComposeAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            _state.ManifestAvailable = false;
            _state.ManifestUnavailableReason = SafeSummary(ex.Message);
            SetStatus("No verified normal release image is available. Setup cannot start without its immutable manifest.", false);
            await SaveStateAsync();
        }
        if (_step == 0) RenderStep();
        RefreshReview();
    }

    private void BuildStepList()
    {
        string[] titles = ["Welcome", "Host settings", "Prerequisites", "Manage this computer", "Review", "Install and verify"];
        string[] subtitles = ["What this setup changes", "HTTPS port and persistent data", "Container runtime", "Pairing, TLS and optional Windows agent", "Confirm the destination", "Pull, start, health check"];
        for (var i = 0; i < titles.Length; i++)
        {
            var dot = new Border
            {
                Width = 30, Height = 30, CornerRadius = new CornerRadius(15),
                Background = new SolidColorBrush(Color.FromRgb(238, 242, 249)),
                Child = new TextBlock { Text = (i + 1).ToString(), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold }
            };
            var title = new TextBlock { Text = titles[i], FontWeight = FontWeights.SemiBold, FontSize = 13 };
            var sub = new TextBlock { Text = subtitles[i], Foreground = (Brush)FindResource("TextSecondary"), FontSize = 11, Margin = new Thickness(0, 3, 0, 0) };
            var text = new StackPanel { Margin = new Thickness(12, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, Children = { title, sub } };
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 18), Children = { dot, text } };
            StepList.Children.Add(row);
            _indicators.Add(new StepIndicator(dot, title));
        }
    }

    private void RenderStep()
    {
        PageHost.Children.Clear();
        var isDone = _state.InstallationVerified;
        var contentStep = isDone ? StepCount - 1 : _step;
        StepCounter.Text = isDone ? "SETUP COMPLETE" : $"STEP {contentStep + 1} OF {StepCount}";
        CompactStepText.Text = StepCounter.Text;
        for (var i = 0; i < _indicators.Count; i++)
        {
            _indicators[i].Dot.Background = i == contentStep ? new SolidColorBrush(Color.FromRgb(36, 88, 211)) : i < contentStep ? new SolidColorBrush(Color.FromRgb(210, 224, 255)) : new SolidColorBrush(Color.FromRgb(238, 242, 249));
            _indicators[i].Title.Foreground = i == contentStep ? new SolidColorBrush(Color.FromRgb(30, 75, 185)) : (Brush)FindResource("TextSecondary");
            _indicators[i].Title.FontWeight = i == contentStep ? FontWeights.Bold : FontWeights.SemiBold;
            ((TextBlock)_indicators[i].Dot.Child!).Foreground = i == contentStep ? Brushes.White : (Brush)FindResource("TextPrimary");
        }
        BackButton.IsEnabled = !_operationRunning && !isDone && contentStep > 0;
        CancelButton.IsEnabled = true;
        NextButton.Visibility = contentStep < 4 && !isDone ? Visibility.Visible : Visibility.Collapsed;
        NextButton.Content = contentStep == 3 ? "Review setup" : "Next";
        if (isDone)
        {
            ShowDonePage();
            FocusPageHeading();
            return;
        }
        switch (contentStep)
        {
            case 0: ShowWelcomePage(); break;
            case 1: ShowHostSettingsPage(); break;
            case 2: ShowPrerequisitesPage(); break;
            case 3: ShowAccessPage(); break;
            case 4: ShowReviewPage(); break;
            default: ShowOperationPage(); break;
        }
        FocusPageHeading();
    }

    private void ShowWelcomePage()
    {
        AddEyebrow("WATCHDOG CONTROL  /  SETUP");
        AddHeading("A clear path to a running service.");
        AddQuickHostControls();
        AddBody("This portable assistant prepares the Watchdog Control container on the local Docker host. It verifies its embedded Compose configuration against the latest public release manifest, pulls that release’s immutable image, starts only the Watchdog Control Compose project, then checks service health and the host’s LAN address.");
        AddCallout("Before setup", "This changes Docker resources on the active context. Check the destination below before continuing. Setup never removes unrelated containers or deletes existing service data.", "Info");
        AddCallout("What this assistant will not do", "It will not accept an arbitrary command, replace an existing data folder, expose a secret in its logs, or restart this computer. Differing setup files are backed up and replaced only after confirmation. Docker installation, if needed, is started only after you choose it and approve any native elevation prompt.", "ShieldCheck");
        AddBody("The setup record stores your selected port, storage folder, release identity and last completed step in your local profile. It does not store the access credential.");
        if (_state.ProgressRecoveryWarning is { } recoveryWarning)
        {
            AddCallout("Previous setup progress could not be read", recoveryWarning + " The original progress file will be preserved before a new setup record is created. Select the correct existing data folder before starting, or choose a new empty folder if this is a fresh setup.", "Warning");
            _progressRecoveryAcknowledgement = new CheckBox
            {
                Content = "Preserve the unreadable progress file and continue with a fresh setup record.",
                Margin = new Thickness(0, 8, 0, 12),
                FontSize = 14
            };
            AutomationProperties.SetName(_progressRecoveryAcknowledgement, "Confirm preserving the unreadable progress file before starting fresh");
            PageHost.Children.Add(_progressRecoveryAcknowledgement);
        }
        AddReleaseStatus();
    }

    private void AddQuickHostControls()
    {
        var card = NewCard();
        var stack = (StackPanel)card.Child!;
        stack.Children.Add(new TextBlock { Text = "Quick host", FontWeight = FontWeights.Bold, FontSize = 16 });
        stack.Children.Add(new TextBlock
        {
            Text = "Open this single portable executable directly. The assistant and its Compose configuration need no installation. With an already-ready local Docker Engine, one click verifies and downloads the Watchdog Control image, writes this service's configuration and protected local files, and starts only this service on the selected private LAN address and HTTPS port. Quick hosting does not install Docker Desktop, another runtime, the optional Windows host agent, or other host prerequisites.",
            Foreground = (Brush)FindResource("TextSecondary"), FontSize = 13, LineHeight = 20, Margin = new Thickness(0, 8, 0, 12)
        });

        _quickHostButton = new Button { Content = "Host Watchdog Control on this computer", MinWidth = 280, HorizontalAlignment = HorizontalAlignment.Left };
        AutomationProperties.SetName(_quickHostButton, "Host Watchdog Control on this computer with the selected local Docker Engine");
        _quickHostButton.Click += QuickHost_Click;
        var available = CanQuickHost(out var selectedLan, out var reason);
        _quickHostButton.IsEnabled = available;
        stack.Children.Add(_quickHostButton);

        var destination = selectedLan is null
            ? "Destination: choose an active private LAN interface in Host settings"
            : $"Destination: selected private LAN interface · HTTPS port {_state.HostPort}";
        stack.Children.Add(new TextBlock
        {
            Text = destination,
            FontFamily = new FontFamily("Consolas"), FontSize = 12, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 0)
        });
        if (!available)
            stack.Children.Add(new TextBlock { Text = reason, Foreground = new SolidColorBrush(Color.FromRgb(153, 74, 28)), FontSize = 12, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) });
        PageHost.Children.Add(card);
    }

    private bool CanQuickHost(out LanInterfaceOption? selectedLan, out string reason)
    {
        selectedLan = null;
        if (_state.ProgressRecoveryWarning is not null)
        {
            reason = "Review and preserve the unreadable setup progress before quick hosting.";
            return false;
        }
        if (_state.RequiresStorageSelection)
        {
            reason = "Confirm the existing data folder in Host settings before quick hosting.";
            return false;
        }
        if (_state.ManageThisComputer)
        {
            reason = "The optional host agent is selected. Review that separate installation in the full setup flow, or clear it before quick hosting.";
            return false;
        }
        if (!_state.DockerReady)
        {
            reason = "Start the already-installed local Docker Engine first. Quick hosting never installs Docker.";
            return false;
        }
        if (!_state.ManifestAvailable)
        {
            reason = "A verified normal release is not ready yet. Quick hosting waits for its immutable image manifest.";
            return false;
        }
        var interfaces = GetPrivateLanInterfaces();
        selectedLan = ResolveLanSelection(interfaces, _state.LanBindAddress);
        if (selectedLan is null)
        {
            reason = interfaces.Count == 0
                ? "Connect an active Ethernet or Wi-Fi interface with a private IPv4 address, then choose it in Host settings."
                : "More than one private LAN interface is active. Choose the intended interface in Host settings.";
            return false;
        }
        if (_state.HostPort is < 1024 or > 65535)
        {
            reason = "Choose a host port from 1024 to 65535 in Host settings.";
            return false;
        }
        if (!_state.ServiceStarted && !ValidatePort(out reason)) return false;
        reason = string.Empty;
        return true;
    }

    private async void QuickHost_Click(object sender, RoutedEventArgs e)
    {
        if (_operationRunning) return;
        if (!CanQuickHost(out var selectedLan, out var reason) || selectedLan is null)
        {
            SetStatus(reason, false);
            RenderStep();
            return;
        }
        _state.LanBindAddress = selectedLan.Address.ToString();
        _state.StartConfirmed = true;
        await SaveStateAsync();
        await StartInstallAsync(allowDockerInstallation: false);
    }

    private void ShowHostSettingsPage()
    {
        AddEyebrow("DESTINATION");
        AddHeading("Choose how the service is reached.");
        AddBody("Choose the private LAN interface, HTTPS port, and persistent data folder for this Watchdog Control service.");
        AddLabel("Private LAN interface", "The service binds only to this active private IPv4 address. Setup does not add a public-interface binding or change the host firewall.");
        var lanOptions = GetPrivateLanInterfaces();
        _lanBindBox = new ComboBox
        {
            ItemsSource = lanOptions,
            DisplayMemberPath = nameof(LanInterfaceOption.DisplayName),
            MinHeight = 48,
            Margin = new Thickness(0, 6, 0, 10),
            ToolTip = "Choose the Ethernet or Wi-Fi interface that should reach the service"
        };
        AutomationProperties.SetName(_lanBindBox, "Private LAN interface and IPv4 address");
        var selectedLan = ResolveLanSelection(lanOptions, _state.LanBindAddress);
        _lanBindBox.SelectedItem = selectedLan;
        var selectedAddress = selectedLan?.Address.ToString();
        if (!string.Equals(_state.LanBindAddress, selectedAddress, StringComparison.Ordinal))
        {
            _state.LanBindAddress = selectedAddress;
            _state.StartConfirmed = false;
            _ = SaveStateAsync();
        }
        _lanBindBox.SelectionChanged += LanBindBox_SelectionChanged;
        PageHost.Children.Add(_lanBindBox);
        if (lanOptions.Count == 0)
            AddCallout("No private LAN interface is ready", "Connect an active Ethernet or Wi-Fi interface with a private IPv4 address, then return here and choose it before setup.", "Warning");
        else if (selectedLan is null)
            AddCallout("Choose the intended interface", "More than one private interface is active. Select the one that clients on your local network will use.", "Info");
        AddLabel("HTTPS host port", "The service listens inside the container on HTTPS port 8443. Choose an unused host port from 1024 to 65535.");
        _portBox = new TextBox { Text = _state.HostPort.ToString(), Width = 220, HorizontalAlignment = HorizontalAlignment.Left };
        AutomationProperties.SetName(_portBox, "HTTPS host port");
        _portBox.PreviewTextInput += (_, args) => args.Handled = args.Text.Any(c => !char.IsDigit(c));
        DataObject.AddPastingHandler(_portBox, (_, args) => args.CancelCommand());
        PageHost.Children.Add(_portBox);
        AddLabel("Persistent data folder", "Choose a folder on this host. The assistant creates it if needed and does not clear existing contents.");
        var storageRow = new DockPanel { LastChildFill = true };
        _storageBox = new TextBox { Text = _state.StorageDirectory, IsReadOnly = true, ToolTip = "Choose a folder with Browse" };
        var browse = new Button { Content = "Browse…", Margin = new Thickness(8, 6, 0, 14), MinWidth = 106 };
        browse.Click += BrowseStorage_Click;
        DockPanel.SetDock(browse, Dock.Right);
        storageRow.Children.Add(browse);
        storageRow.Children.Add(_storageBox);
        PageHost.Children.Add(storageRow);
        AddCallout("Default location", _state.StorageDirectory, "Folder");
        if (_state.RequiresStorageSelection)
        {
            AddCallout("Choose the existing data folder", "The previous setup progress was unreadable, so its custom data location could not be recovered. Browse to the folder that already contains Watchdog Control data, or deliberately choose an empty folder for a fresh installation. Nothing will be moved automatically.", "Warning");
            _storageChoiceConfirmation = new CheckBox
            {
                Content = "I verified that this folder is the intended existing data location, or a new empty folder.",
                IsChecked = _state.StorageChoiceConfirmed,
                Margin = new Thickness(0, 8, 0, 12),
                FontSize = 14
            };
            AutomationProperties.SetName(_storageChoiceConfirmation, "Confirm the selected persistent data folder");
            _storageChoiceConfirmation.Checked += async (_, _) => { _state.StorageChoiceConfirmed = true; await SaveStateAsync(); };
            _storageChoiceConfirmation.Unchecked += async (_, _) => { _state.StorageChoiceConfirmed = false; await SaveStateAsync(); };
            PageHost.Children.Add(_storageChoiceConfirmation);
        }
        AddBody("A different Docker context may point to another host. The next step reads its name and reachability before any container operation.");
    }

    private void ShowPrerequisitesPage()
    {
        AddEyebrow("PREREQUISITES");
        AddHeading("Confirm the container host is ready.");
        AddBody("The wizard needs a reachable Docker Engine and the Docker Compose plugin. It uses the currently selected context. No container is changed during this check.");
        var card = NewCard();
        var stack = (StackPanel)card.Child!;
        stack.Children.Add(new TextBlock { Text = "Docker Engine and Compose", FontWeight = FontWeights.Bold, FontSize = 16 });
        _prerequisiteStatus = new TextBlock { Text = _state.DockerStatus ?? "Checking the selected context…", Margin = new Thickness(0, 9, 0, 14), FontSize = 13 };
        stack.Children.Add(_prerequisiteStatus);
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var check = new Button { Content = "Check again" };
        check.Click += async (_, _) => await ProbeDockerAsync();
        row.Children.Add(check);
        _installDockerButton = new Button { Content = "Install Docker Desktop automatically", Visibility = Visibility.Collapsed };
        _installDockerButton.Click += InstallDocker_Click;
        row.Children.Add(_installDockerButton);
        stack.Children.Add(row);
        PageHost.Children.Add(card);
        AddCallout("Docker Desktop is optional when another supported engine is already available.", "The wizard checks its CLI and Compose plugin, then uses the selected context. Installation may require Windows Subsystem for Linux or a user-approved restart. The assistant never initiates a restart.", "Information");
          AddCallout("Automatic prerequisite setup", "After you confirm setup, the assistant checks App Installer and WinGet, tries Windows' supported registration route, and acquires the latest stable Microsoft package when registration is unavailable. It verifies the release digests before installing for this user, then runs the official Docker Desktop package interactively and waits for the local engine and Compose plugin. Complete any license or native consent prompts yourself. A required computer restart remains manual; reopen this assistant to resume.", "ShieldCheck");
    }

    private void ShowAccessPage()
    {
        AddEyebrow("SERVICE ACCESS");
        AddHeading("Protect the service from first start.");
        AddBody("The wizard creates a local TLS certificate and a cryptographically random, single-use owner-pairing code. The service receives file paths only. The code appears once after setup, and the owner creates a username and password in the browser over verified HTTPS.");
        AddCallout("TLS trust", "The public certificate is saved separately and its SHA-256 fingerprint is shown at completion. No trust is installed automatically. Before entering owner credentials, each client must verify and import that certificate using its normal operating-system trust controls.", "Lock");
        AddCallout("Pairing boundary", "No username or password is collected by this wizard. The pairing code is stored in a protected host file and mounted read-only in the service. The service consumes it once when the first owner is created.", "ShieldCheck");
        var manageComputer = new CheckBox { Content = "Install the Windows host agent on this computer", IsChecked = _state.ManageThisComputer, Margin = new Thickness(0, 18, 0, 4), FontSize = 14 };
        AutomationProperties.SetName(manageComputer, "Manage this computer with the Watchdog Control Windows agent");
        manageComputer.Checked += (_, _) => { _state.ManageThisComputer = true; if (_systemServiceConsent is not null) _systemServiceConsent.Visibility = Visibility.Visible; _ = SaveStateAsync(); RefreshReview(); };
        manageComputer.Unchecked += (_, _) => { _state.ManageThisComputer = false; _state.SystemServiceConsent = false; if (_systemServiceConsent is not null) _systemServiceConsent.Visibility = Visibility.Collapsed; _ = SaveStateAsync(); RefreshReview(); };
        PageHost.Children.Add(manageComputer);
        AddBody("The host agent runs as LocalSystem so it can inspect services, processes, event logs, storage, networking, firewall state and updates, and apply the approved operation catalog. It does not accept arbitrary shell commands. The host agent is an unsigned release asset, so Windows may show an unknown-publisher warning.");
        _systemServiceConsent = new CheckBox
        {
            Content = "I authorize a machine-wide LocalSystem service and will review the native administrator prompt.",
            IsChecked = _state.SystemServiceConsent,
            Visibility = _state.ManageThisComputer ? Visibility.Visible : Visibility.Collapsed,
            Margin = new Thickness(26, 4, 0, 8),
            FontSize = 13
        };
        AutomationProperties.SetName(_systemServiceConsent, "Authorize the LocalSystem host service and native administrator prompt");
        _systemServiceConsent.Checked += (_, _) => { _state.SystemServiceConsent = true; _ = SaveStateAsync(); RefreshReview(); };
        _systemServiceConsent.Unchecked += (_, _) => { _state.SystemServiceConsent = false; _ = SaveStateAsync(); RefreshReview(); };
        PageHost.Children.Add(_systemServiceConsent);
        AddBody("If administrator consent is cancelled, the dashboard can still run, and computer management remains clearly pending.");
    }

    private void ShowReviewPage()
    {
        AddEyebrow("REVIEW");
        AddHeading("Check the destination before setup.");
        AddBody("Start setup resolves supported missing prerequisites automatically, verifies the embedded Compose file against the release manifest, pulls the pinned image, writes the selected Compose setup, and runs `docker compose up -d` for one named project.");
        var card = NewCard();
        var stack = (StackPanel)card.Child!;
        _reviewDetails = new TextBlock { FontFamily = new FontFamily("Consolas"), FontSize = 13, LineHeight = 24 };
        stack.Children.Add(_reviewDetails);
        PageHost.Children.Add(card);
        var consent = new CheckBox { Content = "I confirm this computer as the destination and authorize automatic prerequisite setup and service start.", IsChecked = _state.StartConfirmed, Margin = new Thickness(0, 18, 0, 8), FontSize = 14 };
        AutomationProperties.SetName(consent, "Confirm this computer and authorize automatic prerequisite setup and Watchdog Control service start");
        consent.Checked += (_, _) => { _state.StartConfirmed = true; _ = SaveStateAsync(); RefreshReview(); };
        consent.Unchecked += (_, _) => { _state.StartConfirmed = false; _ = SaveStateAsync(); RefreshReview(); };
        PageHost.Children.Add(consent);
        AddCallout("Safe update behavior", "Existing service data is preserved. The assistant does not run `down`, prune images, remove volumes, change other Compose projects, or stop unrelated containers.", "ShieldCheck");
        RefreshReview();
        _startInstallButton = new Button { Content = "Install and start automatically", MinWidth = 210, IsEnabled = _state.StartConfirmed && _state.ManifestAvailable && (!_state.ManageThisComputer || _state.SystemServiceConsent) };
        _startInstallButton.Click += StartInstall_Click;
        _startInstallButton.HorizontalAlignment = HorizontalAlignment.Left;
        PageHost.Children.Add(_startInstallButton);
    }

    private void ShowOperationPage()
    {
        AddEyebrow("SETUP ACTIVITY");
        AddHeading("Preparing Watchdog Control.");
        AddBody("Progress below comes from the actual Docker operation and health checks. Cancel stops the active setup command where safe. An already launched prerequisite installer is allowed to finish before setup stops. If a container start has completed, cancel does not stop or remove the service.");
        _operationProgress = new ProgressBar { Height = 8, IsIndeterminate = true, Margin = new Thickness(0, 12, 0, 18), Foreground = new SolidColorBrush(Color.FromRgb(36, 88, 211)) };
        PageHost.Children.Add(_operationProgress);
        var card = NewCard();
        _operationOutput = new TextBlock { Text = _state.LastOperationSummary ?? "Waiting for setup to start.", FontFamily = new FontFamily("Consolas"), FontSize = 12, MaxHeight = 300, TextWrapping = TextWrapping.Wrap };
        AutomationProperties.SetLiveSetting(_operationOutput, AutomationLiveSetting.Polite);
        ((StackPanel)card.Child!).Children.Add(_operationOutput);
        PageHost.Children.Add(card);
        _finishButton = new Button { Content = "Finish", Visibility = Visibility.Collapsed, IsEnabled = false };
        _finishButton.Click += (_, _) => Close();
        PageHost.Children.Add(_finishButton);
        if (!_operationRunning && !_state.InstallationVerified && _state.LastOperationSummary is not null)
        {
            AddCallout("Setup needs attention", _state.LastOperationSummary, "Warning");
            if (_state.StartConfirmed && _state.ManifestAvailable)
            {
                var resume = new Button
                {
                    Content = _state.ServiceStarted ? "Resume setup and verify" : "Continue setup",
                    MinWidth = 190,
                    HorizontalAlignment = HorizontalAlignment.Left
                };
                resume.Click += StartInstall_Click;
                PageHost.Children.Add(resume);
                AddBody("Progress is saved on this computer. Continue runs the missing steps again, checks the current local engine, and keeps the existing data folder and unrelated containers intact.");
            }
        }
    }

    private void ShowDonePage()
    {
        AddEyebrow("SERVICE READY");
        AddHeading("Watchdog Control is responding.");
        AddBody("The Compose pull and start completed, and the HTTPS health endpoint answered from this host. The URL below was checked from this host. Verify the displayed certificate fingerprint on every client before entering owner credentials.");
        if (Uri.TryCreate(_state.LanUrl, UriKind.Absolute, out var lanUri)) AddLinkCallout("LAN address", lanUri);
        else AddCallout("LAN address", "Not available", "Link");
        AddCallout("Certificate fingerprint", _certificateFingerprint, "Lock");
        AddCallout("Public certificate", _publicCertificatePath, "Certificate");
        AddCallout("One-time owner pairing code", string.IsNullOrEmpty(_pairingCode) ? "This code was shown during the earlier setup completion." : _pairingCode, "Key");
        if (!string.IsNullOrEmpty(_pairingCode))
        {
            AddBody("Copy the code now. This wizard will not show it again. Open the HTTPS address after verifying/importing the certificate, then enter this code and choose the first owner credentials in the browser.");
            _state.PairingCodeShown = true;
            _ = SaveStateAsync();
            _pairingCode = string.Empty;
        }
        AddCallout("Release", $"Tag: {_state.ReleaseTag}\nSource: {_state.SourceSha}\nImage: {_state.ImageReference}", "Package");
        AddCallout("Data folder", _state.StorageDirectory, "Folder");
        var controlsButton = new Button { Content = "Open host controls", MinWidth = 164, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 8, 0, 10) };
        controlsButton.Click += (_, _) =>
        {
            var entrypoint = Path.Combine(_state.ComposeDirectory, "host.bat");
            if (File.Exists(entrypoint)) Process.Start(new ProcessStartInfo(entrypoint) { UseShellExecute = true, WorkingDirectory = _state.ComposeDirectory });
            else SetStatus("The host controls file is missing. Run setup again to restore the release-matched entrypoint.", false);
        };
        PageHost.Children.Add(controlsButton);
        AddCallout("Computer management", _state.ManageThisComputer ? _state.AgentStatus ?? "Pending" : "Not selected", "Computer");
        if (_state.ManageThisComputer && (_state.AgentStatus is null || _state.AgentStatus.StartsWith("Pending", StringComparison.Ordinal)))
        {
            _retryAgentButton = new Button { Content = "Retry computer management", MinWidth = 210, HorizontalAlignment = HorizontalAlignment.Left };
            _retryAgentButton.Click += RetryAgent_Click;
            PageHost.Children.Add(_retryAgentButton);
        }
        AddBody("The setup assistant is safe to close. Closing it leaves the service running. Use the separate host controls to view logs or stop the service.");
        _finishButton = new Button { Content = "Finish", MinWidth = 126 };
        _finishButton.Click += (_, _) => Close();
        PageHost.Children.Add(_finishButton);
    }

    private async Task ProbeDockerAsync(bool duringOperation = false)
    {
        if (_operationRunning && !duringOperation) return;
        SetStatus("Checking Docker Engine and Compose…", false);
        if (_prerequisiteStatus is not null) _prerequisiteStatus.Text = "Checking Docker CLI, active context and Engine connection…";
        if (_installDockerButton is not null) _installDockerButton.Visibility = Visibility.Collapsed;
        try
        {
            var docker = FindDockerCli() ?? "docker";
            var version = await CommandRunner.RunAsync(docker, ["--version"], null, null, TimeSpan.FromSeconds(15), CancellationToken.None, null, string.Empty);
            if (version.ExitCode != 0) throw new InvalidOperationException("Docker CLI is not available on PATH.");
            var compose = await CommandRunner.RunAsync(docker, ["compose", "version"], null, null, TimeSpan.FromSeconds(15), CancellationToken.None, null, string.Empty);
            if (compose.ExitCode != 0) throw new InvalidOperationException("The Docker Compose plugin is not available.");
            var context = await CommandRunner.RunAsync(docker, ["context", "show"], null, null, TimeSpan.FromSeconds(15), CancellationToken.None, null, string.Empty);
            if (context.ExitCode != 0) throw new InvalidOperationException("Docker could not identify its selected context.");
            var endpoint = await CommandRunner.RunAsync(docker, ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], null, null, TimeSpan.FromSeconds(15), CancellationToken.None, null, string.Empty);
            if (endpoint.ExitCode != 0) throw new InvalidOperationException("Docker could not verify whether the selected engine is local to this computer.");
            using var endpointDocument = JsonDocument.Parse(endpoint.StandardOutput.Trim());
            var endpointAddress = endpointDocument.RootElement.ValueKind == JsonValueKind.String
                ? endpointDocument.RootElement.GetString()
                : null;
            if (endpointAddress is null || !endpointAddress.StartsWith("npipe://", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The selected Docker context is not a local Windows engine. Setup requires a local named-pipe engine because the certificate, pairing files, data folder and service agent are created on this computer.");
            var info = await CommandRunner.RunAsync(docker, ["info", "--format", "{{.ServerVersion}}"], null, null, TimeSpan.FromSeconds(20), CancellationToken.None, null, string.Empty);
            if (info.ExitCode != 0) throw new InvalidOperationException("Docker Engine did not respond: " + SafeSummary(info.StandardError));
            _state.DockerReady = true;
            _state.DockerContext = SafeSummary(context.StandardOutput);
            _state.DockerStatus = $"Ready · Docker {SafeSummary(version.StandardOutput)} · Compose {SafeSummary(compose.StandardOutput)} · local context {_state.DockerContext} · Engine {SafeSummary(info.StandardOutput)}";
            if (_prerequisiteStatus is not null) _prerequisiteStatus.Text = _state.DockerStatus;
            SetStatus("Docker Engine and Compose are reachable.", true);
        }
        catch (Exception ex)
        {
            _state.DockerReady = false;
            _state.DockerStatus = ex.Message;
            if (_prerequisiteStatus is not null) _prerequisiteStatus.Text = ex.Message;
            if (_installDockerButton is not null) _installDockerButton.Visibility = Visibility.Visible;
            SetStatus("Docker prerequisites are incomplete. No service changes were made.", false);
        }
        await SaveStateAsync();
        RefreshReview();
        if (_step == 0) RenderStep();
    }

    private async void InstallDocker_Click(object sender, RoutedEventArgs e)
    {
        if (_operationRunning) return;
        _operationRunning = true;
        _operationCancellation = new CancellationTokenSource();
        CancelButton.Content = "Cancel install";
        BackButton.IsEnabled = false;
        try
        {
            await InstallDockerDesktopAsync(_operationCancellation.Token);
        }
        catch (OperationCanceledException) when (_operationCancellation?.IsCancellationRequested == true)
        {
            _state.DockerReady = false;
            _state.DockerStatus = "Cancellation was requested after the official package installer finished. Docker Engine readiness was not verified; check again before retrying setup.";
            SetStatus(_state.DockerStatus, false);
        }
        catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            _state.DockerStatus = "Native consent was cancelled. Docker Desktop was not installed by this attempt; setup remains incomplete.";
            SetStatus(_state.DockerStatus, false);
        }
        catch (Exception ex)
        {
            _state.DockerStatus = "Docker Desktop installation did not complete: " + ex.Message;
            SetStatus(_state.DockerStatus, false);
        }
        finally
        {
            _operationRunning = false;
            _operationCancellation?.Dispose();
            _operationCancellation = null;
            CancelButton.Content = "Cancel";
            RenderStep();
            if (!_state.DockerReady && _installDockerButton is not null)
                _installDockerButton.Visibility = Visibility.Visible;
        }
        await SaveStateAsync();
    }

    private async Task InstallDockerDesktopAsync(CancellationToken cancellationToken)
    {
        var winget = await _setupPrerequisites.EnsureWinGetAvailableAsync(Report, cancellationToken);
        SetStatus("Starting the official Docker Desktop package. Any required native consent is shown by Windows.", false);
        var start = new ProcessStartInfo(winget)
        {
            UseShellExecute = true,
            Arguments = "install --exact --id Docker.DockerDesktop --source winget --accept-source-agreements --interactive",
            WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
        };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("WinGet did not start.");
        // WinGet may hand work to a separate package installer. Do not abandon the wait
        // when the user cancels, because that would permit an overlapping retry while
        // the first installer is still changing this computer.
        await process.WaitForExitAsync(CancellationToken.None);
        cancellationToken.ThrowIfCancellationRequested();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"WinGet returned exit code {process.ExitCode}. Any prior installation remains untouched.");

        var desktop = FindDockerDesktop();
        if (desktop is null) throw new InvalidOperationException("The package manager completed, but Docker Desktop was not found in its documented per-user or all-users location.");
        SetStatus("Starting Docker Desktop. Complete any license or first-run prompt shown by Docker.", false);
        using var desktopProcess = Process.Start(new ProcessStartInfo(desktop) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(desktop)! });
        if (desktopProcess is null) throw new InvalidOperationException("Windows could not start Docker Desktop. Setup remains incomplete and no existing service was removed.");

        SetStatus("Package installer completed. Waiting for the local engine and Compose plugin to become ready.", false);
        for (var attempt = 0; attempt < 36 && !_state.DockerReady; attempt++)
        {
            await ProbeDockerAsync(duringOperation: true);
            if (_state.DockerReady) break;
            SetStatus($"Docker Engine is still starting. Checking again ({attempt + 1}/36). A required computer restart remains manual.", false);
            await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
        }
        if (!_state.DockerReady)
            throw new TimeoutException("Docker Desktop was installed, but its local engine did not become reachable within three minutes. Complete any first-run setup or required computer restart manually, then check again.");
    }

    private async void StartInstall_Click(object sender, RoutedEventArgs e) => await StartInstallAsync(allowDockerInstallation: true);

    private async Task StartInstallAsync(bool allowDockerInstallation)
    {
        if (_operationRunning) return;
        if (!_state.StartConfirmed || !_state.ManifestAvailable || (_state.ManageThisComputer && !_state.SystemServiceConsent)) return;
        var resuming = _state.ServiceStarted || (_state.LastStep >= StepCount - 1 && _state.LastOperationSummary is not null);
        if (!resuming && !ValidatePort(out var portError)) { SetStatus(portError, false); _step = 1; RenderStep(); return; }
        _state.HostPort = ParsePort();
        _state.LastStep = 5;
        _step = 5;
        _operationCancellation = new CancellationTokenSource();
        _operationRunning = true;
        CancelButton.Content = "Cancel operation";
        NextButton.Visibility = Visibility.Collapsed;
        BackButton.IsEnabled = false;
        RenderStep();
        await SaveStateAsync();
        try
        {
            await ProbeDockerAsync(duringOperation: true);
            if (!_state.DockerReady)
            {
                if (!allowDockerInstallation)
                    throw new InvalidOperationException("The local Docker Engine is no longer ready. Quick hosting did not install Docker or change another host prerequisite; start the existing engine and retry.");
                Report("No reachable local Docker Engine is ready. Resolving the supported runtime prerequisite automatically.");
                await InstallDockerDesktopAsync(_operationCancellation.Token);
            }
            await PerformInstallAsync(_operationCancellation.Token);
        }
        catch (OperationCanceledException)
        {
            await RecordFailureAsync("Setup operation cancelled. The assistant did not remove or stop any started container. Review the actual Docker service state before retrying.");
        }
        catch (Exception ex)
        {
            await RecordFailureAsync(ex.Message);
        }
        finally
        {
            _operationRunning = false;
            _operationCancellation?.Dispose();
            _operationCancellation = null;
            CancelButton.Content = "Cancel";
            CancelButton.IsEnabled = true;
            if (_finishButton is not null) _finishButton.IsEnabled = true;
            RenderStep();
            if (_state.InstallationVerified) SetStatus("Service health is verified. The service remains running after this assistant closes.", true);
            else SetStatus(_state.LastOperationSummary ?? "Setup remains incomplete.", false);
            await SaveStateAsync();
        }
    }

    private async Task PerformInstallAsync(CancellationToken cancellationToken)
    {
        var bindAddress = GetSelectedLanAddress() ?? throw new InvalidOperationException("Select an active private Ethernet or Wi-Fi IPv4 address before setup.");
        _state.LanBindAddress = bindAddress.ToString();
        await EnsureManifestAsync(cancellationToken);
        Report("Release manifest validated against the normal public release.");
        var compose = await LoadBundledComposeAsync(cancellationToken);
        Report("Bundled Compose file SHA-256 matches the selected release " + _state.ReleaseTag + ".");
        var hostEntrypoints = await DownloadHostEntrypointsAsync(cancellationToken);
        Directory.CreateDirectory(_state.ComposeDirectory);
        Directory.CreateDirectory(_state.StorageDirectory);
        var composePath = Path.Combine(_state.ComposeDirectory, "compose.yaml");
        var secretDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ding-Ding-Projects", "WatchdogControlSetup", "secrets");
        CreateProtectedSecretDirectory(secretDirectory);
        _pairingCode = _state.PairingCodeShown ? string.Empty : File.Exists(Path.Combine(secretDirectory, "watchdog_pairing_code")) ? await File.ReadAllTextAsync(Path.Combine(secretDirectory, "watchdog_pairing_code"), cancellationToken) : CreatePairingCode();
        _pairingPath = Path.Combine(secretDirectory, "watchdog_pairing_code");
        if (_pairingCode.Length > 0 && !File.Exists(_pairingPath)) await WriteProtectedFileAsync(_pairingPath, _pairingCode, cancellationToken);
        _agentEnrollmentPath = Path.Combine(secretDirectory, "watchdog_agent_enrollment_code");
        if (!File.Exists(_agentEnrollmentPath)) await WriteProtectedFileAsync(_agentEnrollmentPath, CreatePairingCode(), cancellationToken);
        var tls = await CreateTlsMaterialAsync(secretDirectory, bindAddress, _state.PublicCertificatePath, cancellationToken);
        _certificatePath = tls.PfxPath;
        _certificatePasswordPath = tls.PasswordPath;
        _publicCertificatePath = tls.PublicCertificatePath;
        _certificateFingerprint = tls.Fingerprint;
        _state.CertificateFingerprint = tls.Fingerprint;
        _state.PublicCertificatePath = tls.PublicCertificatePath;
        _state.ComposePath = composePath;
        await SaveStateAsync();
        Report("Selected data and setup folders are ready. Existing contents were preserved.");

        var environment = new Dictionary<string, string?>
        {
            ["WATCHDOG_IMAGE"] = _state.ImageReference,
            ["WATCHDOG_HOST_PORT"] = _state.HostPort.ToString(),
            ["WATCHDOG_HOST_BIND_IP"] = bindAddress.ToString(),
            ["WATCHDOG_DATA_PATH"] = _state.StorageDirectory,
            ["WATCHDOG_PAIRING_CODE_HOST_FILE"] = _pairingPath,
            ["WATCHDOG_TLS_CERTIFICATE_HOST_FILE"] = _certificatePath,
            ["WATCHDOG_TLS_PASSWORD_HOST_FILE"] = _certificatePasswordPath,
            ["WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE"] = _agentEnrollmentPath,
        };
        var setupFiles = new List<SetupFileContent>
        {
            new("compose.yaml", new UTF8Encoding(false).GetBytes(compose)),
            new(".env", BuildHostEnvironmentFile(environment))
        };
        setupFiles.AddRange(hostEntrypoints);
        var backupDirectory = await SetupFilePersistence.PersistAsync(
            _state.ComposeDirectory,
            setupFiles,
            (paths, backupPath) => MessageBox.Show(
                this,
                "These existing setup files differ from the verified release:\n\n" +
                string.Join(Environment.NewLine, paths.Select(path => "• " + path)) +
                "\n\nByte-for-byte backups will be saved under:\n" + backupPath +
                "\n\nContinue and replace only these listed setup files? The selected data folder and unrelated containers will not be changed.",
                "Review existing setup files",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning,
                MessageBoxResult.No) == MessageBoxResult.Yes,
            cancellationToken);
        if (backupDirectory is not null)
            Report("Confirmed setup-file replacement completed. Verified backups are stored at " + backupDirectory + ".");
        else
            Report("Verified setup files were created or exact matches were reused. No differing local file was replaced.");
        var baseArgs = new List<string> { "compose", "-p", "watchdog-control", "-f", composePath };
        Report("Validating the rendered Compose configuration before pulling the image.");
        var config = await RunDockerAsync([.. baseArgs, "config", "--quiet"], environment, cancellationToken);
        if (config.ExitCode != 0) throw new InvalidOperationException("Compose configuration validation failed: " + SafeSummary(config.StandardError));
        Report("Compose configuration validation completed.");
        Report("Pulling the exact digest-pinned image. This can take several minutes.");
        List<string> pullArgs = [.. baseArgs, "pull", "watchdog"];
        var pull = await RunDockerAsync(pullArgs, environment, cancellationToken);
        if (pull.ExitCode != 0) throw new InvalidOperationException("Image pull failed: " + SafeSummary(pull.StandardError));
        Report("Image pull completed.");
        if (GetSelectedLanAddress() is not { } currentBindAddress || !currentBindAddress.Equals(bindAddress))
            throw new InvalidOperationException("The selected LAN address changed or is no longer active after the image pull. The service was not started; review the interface and retry.");
        Report("Starting the named Watchdog Control service. No other Compose project is modified.");
        var up = await RunDockerAsync([.. baseArgs, "up", "-d", "watchdog"], environment, cancellationToken);
        if (up.ExitCode != 0) throw new InvalidOperationException("Service start failed: " + SafeSummary(up.StandardError));
        _state.ServiceStarted = true;
        await SaveStateAsync();
        Report("Service start command completed. Waiting up to 90 seconds for the selected LAN HTTPS endpoint to pass /health.");
        await WaitForHealthAsync(cancellationToken);
        Report("Pinned-certificate HTTPS health check succeeded on the selected LAN endpoint.");
        var address = await VerifyLanAddressAsync(cancellationToken);
        if (address is null)
        {
            _state.InstallationVerified = false;
            _state.LastOperationSummary = "The service passed its selected-address health check, but the final LAN URL verification did not succeed. The service remains running. Check host firewall and network binding, then retry verification.";
            throw new InvalidOperationException(_state.LastOperationSummary);
        }
        _state.LanUrl = address;
        _state.InstallationVerified = true;
        if (_state.ManageThisComputer && _state.SystemServiceConsent)
            await InstallAgentAsync(cancellationToken);
        else if (_state.ManageThisComputer)
            _state.AgentStatus = "Pending. The machine-wide service was not installed because explicit LocalSystem consent was not recorded.";
        _state.LastOperationSummary = "Compose start and health checks completed on this host. Remote LAN-client reachability still requires a separate device check.";
        _state.LastStep = 5;
    }

    private async Task InstallAgentAsync(CancellationToken cancellationToken)
    {
        try
        {
            var agent = await DownloadAgentAsync(cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            Report("Requesting native administrator consent to verify a protected agent copy and install the Watchdog Control service for this computer.");
            var exitCode = await LaunchVerifiedAgentInstallerAsync(agent.Path, agent.Sha256, _state.LanUrl!, _certificateFingerprint, _agentEnrollmentPath);
            if (exitCode != 0) throw new InvalidOperationException($"The secure host-agent setup returned exit code {exitCode}.");
            if (File.Exists(_agentEnrollmentPath)) File.Delete(_agentEnrollmentPath);
            _state.AgentStatus = "Installed. The host agent enrolled over the fingerprint-pinned HTTPS controller connection.";
        }
        catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            _state.AgentStatus = "Pending. Native administrator consent was cancelled. The Watchdog Control dashboard remains installed and running.";
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _state.AgentStatus = "Pending. Setup was cancelled during host-agent installation. The dashboard remains installed and running.";
        }
        catch (Exception ex)
        {
            _state.AgentStatus = "Pending. " + SafeSummary(ex.Message) + " The dashboard remains installed and running.";
        }
        await SaveStateAsync();
    }

    private async void RetryAgent_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_state.LanUrl) || string.IsNullOrWhiteSpace(_certificateFingerprint)) return;
        if (!File.Exists(_agentEnrollmentPath))
        {
            SetStatus("The enrollment code is unavailable. Retry the full setup to create a fresh code and restart the dashboard with it.", false);
            return;
        }
        _retryAgentButton!.IsEnabled = false;
        await InstallAgentAsync(CancellationToken.None);
        RenderStep();
        SetStatus(_state.AgentStatus ?? "Computer management remains pending.", _state.AgentStatus?.StartsWith("Installed", StringComparison.Ordinal) == true);
    }

    private async Task<(string Path, string Sha256)> DownloadAgentAsync(CancellationToken cancellationToken)
    {
        using var releaseResponse = await Http.GetAsync($"https://api.github.com/repos/{OwnerRepository}/releases/latest", cancellationToken);
        releaseResponse.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await releaseResponse.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (ReadBool(root, "draft") || ReadBool(root, "prerelease") || ReadString(root, "tag_name") != _state.ReleaseTag) throw new InvalidDataException("The normal release changed while setup was running.");
        var asset = root.GetProperty("assets").EnumerateArray().FirstOrDefault(a => ReadString(a, "name") == "watchdog-agent-win-x64.exe");
        var url = ReadString(asset, "browser_download_url");
        var digest = ReadString(asset, "digest");
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Host != "github.com" || !uri.AbsolutePath.EndsWith($"/releases/download/{_state.ReleaseTag}/watchdog-agent-win-x64.exe", StringComparison.Ordinal) || !Regex.IsMatch(digest, "^sha256:[0-9a-f]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release has no Windows agent asset with a SHA-256 digest.");
        using var response = await Http.GetAsync(uri, cancellationToken);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (bytes.Length is 0 or > 128 * 1024 * 1024) throw new InvalidDataException("The Windows agent asset size is outside the accepted bound.");
        var actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (!string.Equals(actual, digest[7..], StringComparison.Ordinal)) throw new InvalidDataException("The Windows agent asset SHA-256 does not match release metadata.");
        var path = Path.Combine(_state.ComposeDirectory, "watchdog-agent-win-x64.exe");
        await File.WriteAllBytesAsync(path, bytes, cancellationToken);
        return (path, digest[7..]);
    }

    private static async Task<int> LaunchVerifiedAgentInstallerAsync(string sourcePath, string expectedSha256, string controllerUrl, string certificateSha256, string enrollmentCodePath)
    {
        var powerShellPath = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(powerShellPath)) throw new PlatformNotSupportedException("Windows PowerShell is required for protected agent staging on this host.");

        var agentArguments = string.Join(" ", new[]
        {
            "install",
            "--controller-url", controllerUrl,
            "--certificate-sha256", certificateSha256,
            "--enrollment-code-file", enrollmentCodePath
        }.Select(QuoteWindowsArgument));
        var script = $$"""
            $ErrorActionPreference = 'Stop'
            $sourcePath = {{PowerShellUtf8Expression(sourcePath)}}
            $expectedSha256 = {{PowerShellUtf8Expression(expectedSha256)}}
            $agentArguments = {{PowerShellUtf8Expression(agentArguments)}}
            function Get-WatchdogSha256Hex([IO.Stream]$stream) {
                $sha = [Security.Cryptography.SHA256]::Create()
                try {
                    $hex = New-Object System.Text.StringBuilder
                    foreach ($byte in $sha.ComputeHash($stream)) { [void]$hex.Append($byte.ToString('x2')) }
                    return $hex.ToString()
                } finally { $sha.Dispose() }
            }
            $exitCode = 1
            $stageDirectory = $null
            $sourceStream = $null
            $stagedStream = $null
            $child = $null
            try {
                $programFiles = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
                # Program Files is the trusted parent. A random direct child avoids
                # inheriting permissions from any pre-existing product directory.
                $stageDirectory = Join-Path $programFiles ('WatchdogControlSetup-' + [Guid]::NewGuid().ToString('N'))
                [IO.Directory]::CreateDirectory($stageDirectory) | Out-Null

                $adminSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
                $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
                $usersSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')
                $directoryAcl = New-Object System.Security.AccessControl.DirectorySecurity
                $directoryAcl.SetAccessRuleProtection($true, $false)
                $directoryAcl.SetOwner($adminSid)
                $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
                $directoryAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($systemSid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow))
                $directoryAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($adminSid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow))
                $directoryAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($usersSid, [System.Security.AccessControl.FileSystemRights]::ReadAndExecute, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow))
                [IO.Directory]::SetAccessControl($stageDirectory, $directoryAcl)

                $stagedPath = Join-Path $stageDirectory 'watchdog-agent.exe'
                $sourceStream = [IO.File]::Open($sourcePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                if ($sourceStream.Length -lt 10485760 -or $sourceStream.Length -gt 134217728) { throw 'The downloaded host-agent size is outside the accepted range.' }
                $sourceHash = Get-WatchdogSha256Hex $sourceStream
                if ($sourceHash -cne $expectedSha256) { throw 'The downloaded host-agent digest changed before elevated staging.' }
                $sourceStream.Position = 0
                $stagedStream = [IO.File]::Open($stagedPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                $sourceStream.CopyTo($stagedStream)
                $stagedStream.Flush($true)
                $stagedStream.Dispose()
                $stagedStream = $null
                $sourceStream.Dispose()
                $sourceStream = $null

                $fileAcl = New-Object System.Security.AccessControl.FileSecurity
                $fileAcl.SetAccessRuleProtection($true, $false)
                $fileAcl.SetOwner($adminSid)
                $fileAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($systemSid, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
                $fileAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($adminSid, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
                $fileAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($usersSid, [System.Security.AccessControl.FileSystemRights]::ReadAndExecute, [System.Security.AccessControl.AccessControlType]::Allow))
                [IO.File]::SetAccessControl($stagedPath, $fileAcl)

                $stagedStream = [IO.File]::OpenRead($stagedPath)
                $stagedHash = Get-WatchdogSha256Hex $stagedStream
                $stagedStream.Dispose()
                $stagedStream = $null
                if ($stagedHash -cne $expectedSha256) { throw 'The protected host-agent copy failed its SHA-256 check.' }

                $start = New-Object System.Diagnostics.ProcessStartInfo
                $start.FileName = $stagedPath
                $start.Arguments = $agentArguments
                $start.UseShellExecute = $false
                $start.CreateNoWindow = $true
                $start.WorkingDirectory = $stageDirectory
                $child = [Diagnostics.Process]::Start($start)
                if ($null -eq $child) { throw 'The protected host-agent installer did not start.' }
                $child.WaitForExit()
                $exitCode = $child.ExitCode
            } catch {
                $exitCode = 1
            } finally {
                if ($null -ne $child) { $child.Dispose() }
                if ($null -ne $stagedStream) { $stagedStream.Dispose() }
                if ($null -ne $sourceStream) { $sourceStream.Dispose() }
                if ($null -ne $stageDirectory -and [IO.Directory]::Exists($stageDirectory)) {
                    try { [IO.Directory]::Delete($stageDirectory, $true) } catch { }
                }
            }
            exit $exitCode
            """;
        var encodedScript = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
        var start = new ProcessStartInfo(powerShellPath)
        {
            UseShellExecute = true,
            Verb = "runas",
            WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            WindowStyle = ProcessWindowStyle.Hidden,
            Arguments = "-NoLogo -NoProfile -NonInteractive -EncodedCommand " + QuoteWindowsArgument(encodedScript)
        };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Windows PowerShell did not start the protected host-agent setup.");
        await process.WaitForExitAsync();
        return process.ExitCode;
    }

    private static string PowerShellUtf8Expression(string value) =>
        "[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + Convert.ToBase64String(Encoding.UTF8.GetBytes(value)) + "'))";

    private static string QuoteWindowsArgument(string value)
    {
        var quoted = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }
            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private async Task EnsureManifestAsync(CancellationToken cancellationToken)
    {
        SetOperationProgress("Finding the latest normal Watchdog Control release…");
        using var response = await Http.GetAsync($"https://api.github.com/repos/{OwnerRepository}/releases/latest", cancellationToken);
        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (ReadBool(root, "draft") || ReadBool(root, "prerelease")) throw new InvalidDataException("The latest release is a draft or prerelease; setup requires a normal published release.");
        var tag = ReadString(root, "tag_name");
        if (!Regex.IsMatch(tag, "^[A-Za-z0-9._-]{1,80}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release tag is missing or malformed.");
        if (!root.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array) throw new InvalidDataException("The release has no readable assets list.");
        var manifestAsset = assets.EnumerateArray().FirstOrDefault(a => string.Equals(ReadString(a, "name"), ManifestAssetName, StringComparison.Ordinal));
        var manifestUrl = ReadString(manifestAsset, "browser_download_url");
        var manifestDigest = ReadString(manifestAsset, "digest");
        if (!Uri.TryCreate(manifestUrl, UriKind.Absolute, out var manifestUri) || manifestUri.Host != "github.com" || !manifestUri.AbsolutePath.EndsWith($"/releases/download/{tag}/{ManifestAssetName}", StringComparison.Ordinal)) throw new InvalidDataException("The release is missing its official image manifest asset.");
        if (!Regex.IsMatch(manifestDigest, "^sha256:[0-9a-f]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release manifest asset has no valid SHA-256 digest.");
        using var manifestResponse = await Http.GetAsync(manifestUri, cancellationToken);
        manifestResponse.EnsureSuccessStatusCode();
        var raw = await manifestResponse.Content.ReadAsByteArrayAsync(cancellationToken);
        if (raw.Length is 0 or > 32 * 1024) throw new InvalidDataException("The release manifest size is outside the accepted bound.");
        if (!string.Equals(Convert.ToHexString(SHA256.HashData(raw)).ToLowerInvariant(), manifestDigest[7..], StringComparison.Ordinal)) throw new InvalidDataException("The release manifest asset SHA-256 does not match GitHub release metadata.");
        using var manifest = JsonDocument.Parse(raw);
        var manifestRoot = manifest.RootElement;
        var schema = ReadInt(manifestRoot, "schemaVersion");
        var sourceSha = ReadString(manifestRoot, "sourceCommit");
        var version = ReadString(manifestRoot, "version");
        var imageNode = manifestRoot.GetProperty("image");
        var serviceNode = manifestRoot.GetProperty("service");
        var tlsNode = manifestRoot.GetProperty("tls");
        var image = ReadString(imageNode, "reference");
        var archive = ReadString(imageNode, "archiveAsset");
        var archiveHash = ReadString(imageNode, "archiveSha256");
        var composeHash = ReadString(serviceNode, "composeSha256");
        var serviceName = ReadString(serviceNode, "name");
        var port = ReadInt(serviceNode, "containerPort");
        var healthPath = ReadString(serviceNode, "healthPath");
        var dataPath = ReadString(serviceNode, "dataPath");
        var tlsCertPath = ReadString(tlsNode, "certificateFile");
        var tlsPasswordPath = ReadString(tlsNode, "passwordFile");
        var pairingCodePath = ReadString(serviceNode, "pairingCodeFile");
        var agentEnrollmentPath = ReadString(serviceNode, "agentEnrollmentCodeFile");
        if (schema != 1 || !Regex.IsMatch(sourceSha, "^[0-9a-f]{40}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release manifest schema or source revision is invalid.");
        if (!string.Equals(version, tag, StringComparison.Ordinal)) throw new InvalidDataException("The release tag does not match the manifest version.");
        await VerifyReleaseSourceShaAsync(tag, sourceSha, cancellationToken);
        if (!Regex.IsMatch(image, "^" + Regex.Escape(ImagePrefix) + "[0-9a-f]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release manifest does not contain the required immutable image digest.");
        if (archive != "watchdog-control-image-linux-amd64.tar" || !Regex.IsMatch(archiveHash, "^[0-9a-f]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release image archive name or SHA-256 is invalid.");
        if (!Regex.IsMatch(composeHash, "^[0-9a-f]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The release manifest does not contain a valid Compose SHA-256.");
        if (serviceName != "watchdog" || port != 8443 || healthPath != "/health" || dataPath != "/var/lib/watchdog-control") throw new InvalidDataException("The manifest service contract does not match this setup wizard.");
        if (tlsCertPath != "/run/secrets/watchdog_tls_certificate" || tlsPasswordPath != "/run/secrets/watchdog_tls_password" || pairingCodePath != "/run/secrets/watchdog_pairing_code") throw new InvalidDataException("The manifest protected secret paths do not match this setup wizard.");
        if (agentEnrollmentPath != "/run/secrets/watchdog_agent_enrollment_code") throw new InvalidDataException("The manifest host-agent enrollment secret path does not match this setup wizard.");
        _state.ReleaseTag = tag;
        _state.SourceSha = sourceSha;
        _state.ImageReference = image;
        _state.ComposeSha256 = composeHash;
        _state.ManifestAvailable = true;
        _state.ManifestUnavailableReason = null;
        await SaveStateAsync();
    }

    private static async Task VerifyReleaseSourceShaAsync(string tag, string manifestSourceSha, CancellationToken cancellationToken)
    {
        var referenceUrl = $"https://api.github.com/repos/{OwnerRepository}/git/ref/tags/{Uri.EscapeDataString(tag)}";
        using var referenceResponse = await Http.GetAsync(referenceUrl, cancellationToken);
        referenceResponse.EnsureSuccessStatusCode();
        using var reference = await JsonDocument.ParseAsync(await referenceResponse.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var target = reference.RootElement.GetProperty("object");
        var targetSha = ReadString(target, "sha");
        var targetType = ReadString(target, "type");
        for (var depth = 0; targetType == "tag" && depth < 3; depth++)
        {
            using var tagResponse = await Http.GetAsync($"https://api.github.com/repos/{OwnerRepository}/git/tags/{targetSha}", cancellationToken);
            tagResponse.EnsureSuccessStatusCode();
            using var tagDocument = await JsonDocument.ParseAsync(await tagResponse.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            target = tagDocument.RootElement.GetProperty("object");
            targetSha = ReadString(target, "sha");
            targetType = ReadString(target, "type");
        }
        if (targetType != "commit" || !Regex.IsMatch(targetSha, "^[0-9a-f]{40}$", RegexOptions.CultureInvariant) || !string.Equals(targetSha, manifestSourceSha, StringComparison.Ordinal))
            throw new InvalidDataException("The release tag target does not match the manifest source commit.");
    }

    private async Task<string> LoadBundledComposeAsync(CancellationToken cancellationToken)
    {
        await using var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("Watchdog.SetupWizard.compose.yaml")
            ?? throw new InvalidDataException("The portable setup assistant does not contain its bundled Compose configuration.");
        if (source.Length is 0 or > 64 * 1024) throw new InvalidDataException("The bundled Compose file is empty or exceeds 64 KiB.");
        var bytes = new byte[checked((int)source.Length)];
        await source.ReadExactlyAsync(bytes, cancellationToken);
        if (bytes.Length is 0 or > 64 * 1024) throw new InvalidDataException("The release Compose file is empty or exceeds 64 KiB.");
        var digest = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (!string.Equals(digest, _state.ComposeSha256, StringComparison.Ordinal)) throw new InvalidDataException("The bundled Compose file does not match the Compose SHA-256 in the selected release manifest. Use the setup assistant packaged with that release.");
        var text = new UTF8Encoding(false, true).GetString(bytes);
        if (!text.Contains("watchdog:", StringComparison.Ordinal) ||
            !text.Contains("${WATCHDOG_IMAGE", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_HOST_PORT", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_HOST_BIND_IP", StringComparison.Ordinal) ||
            !text.Contains(":8443", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_DATA_PATH", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_PAIRING_CODE_FILE", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_TLS_CERTIFICATE_FILE", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_TLS_CERTIFICATE_PASSWORD_FILE", StringComparison.Ordinal) ||
            !text.Contains("WATCHDOG_AGENT_ENROLLMENT_CODE_FILE", StringComparison.Ordinal) ||
            !text.Contains("/run/secrets/watchdog_pairing_code", StringComparison.Ordinal) ||
            !text.Contains("/run/secrets/watchdog_tls_certificate", StringComparison.Ordinal) ||
            !text.Contains("/run/secrets/watchdog_tls_password", StringComparison.Ordinal) ||
            !text.Contains("/run/secrets/watchdog_agent_enrollment_code", StringComparison.Ordinal) ||
            !text.Contains("/health", StringComparison.Ordinal))
            throw new InvalidDataException("The source-pinned Compose file is missing the required watchdog service, digest, port, data, or health configuration.");
        if (text.Contains("container_name:", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The release Compose file sets a global container name and cannot be used safely beside other projects.");
        return text;
    }

    private async Task<IReadOnlyList<SetupFileContent>> DownloadHostEntrypointsAsync(CancellationToken cancellationToken)
    {
        var root = new Uri($"https://raw.githubusercontent.com/{OwnerRepository}/{_state.SourceSha}/");
        var hostBatch = await DownloadPinnedFileAsync(new Uri(root, "host.bat"), 16 * 1024, cancellationToken);
        var hostScript = await DownloadPinnedFileAsync(new Uri(root, "scripts/host.ps1"), 96 * 1024, cancellationToken);
        return new[]
        {
            new SetupFileContent("host.bat", hostBatch),
            new SetupFileContent(Path.Combine("scripts", "host.ps1"), hostScript)
        };
    }

    private static async Task<byte[]> DownloadPinnedFileAsync(Uri address, int maximumBytes, CancellationToken cancellationToken)
    {
        using var response = await Http.GetAsync(address, cancellationToken);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (bytes.Length is 0 || bytes.Length > maximumBytes) throw new InvalidDataException("A pinned host-control file is empty or exceeds its accepted size.");
        return bytes;
    }

    private byte[] BuildHostEnvironmentFile(IReadOnlyDictionary<string, string?> values)
    {
        var names = new[]
        {
            "WATCHDOG_IMAGE", "WATCHDOG_HOST_PORT", "WATCHDOG_HOST_BIND_IP", "WATCHDOG_DATA_PATH", "WATCHDOG_TLS_CERTIFICATE_HOST_FILE",
            "WATCHDOG_TLS_PASSWORD_HOST_FILE", "WATCHDOG_PAIRING_CODE_HOST_FILE", "WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE"
        };
        var selectedAddress = GetSelectedLanAddress();
        if (selectedAddress is null || !values.TryGetValue("WATCHDOG_HOST_BIND_IP", out var configuredAddress) ||
            !IPAddress.TryParse(configuredAddress, out var parsedAddress) || !parsedAddress.Equals(selectedAddress))
            throw new InvalidDataException("WATCHDOG_HOST_BIND_IP must match the selected active private LAN address.");
        var lines = new List<string>();
        foreach (var name in names)
        {
            if (!values.TryGetValue(name, out var value) || string.IsNullOrWhiteSpace(value) || value.Contains('\r') || value.Contains('\n'))
                throw new InvalidDataException($"The generated host setting {name} is missing or invalid.");
            var normalized = value.Replace('\\', '/').Replace("$", "$$", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);
            lines.Add($"{name}=\"{normalized}\"");
        }
        return new UTF8Encoding(false).GetBytes(string.Join(Environment.NewLine, lines) + Environment.NewLine);
    }

    private async Task WaitForHealthAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(90);
        var attempt = 0;
        while (DateTimeOffset.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var selectedAddress = GetSelectedLanAddress();
            if (selectedAddress is null)
                throw new InvalidOperationException("The selected private LAN address is no longer active. The service remains running; select an active interface and retry verification.");
            attempt++;
            SetOperationProgress($"Waiting for service health at https://{selectedAddress}:{_state.HostPort}/health… check {attempt}, up to 90 seconds.");
            try
            {
                using var client = CreatePinnedClient();
                using var response = await client.GetAsync($"https://{selectedAddress}:{_state.HostPort}/health", cancellationToken);
                if (response.IsSuccessStatusCode) return;
                Report($"Health endpoint returned HTTP {(int)response.StatusCode}.");
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { }
            await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
        }
        throw new TimeoutException("The selected LAN endpoint did not return a successful pinned-certificate HTTPS /health response within 90 seconds. The service may still be running; no automatic removal was attempted.");
    }

    private async Task<string?> VerifyLanAddressAsync(CancellationToken cancellationToken)
    {
        var ip = GetSelectedLanAddress();
        if (ip is null) return null;
        cancellationToken.ThrowIfCancellationRequested();
        using var client = CreatePinnedClient();
        try
        {
            using var response = await client.GetAsync($"https://{ip}:{_state.HostPort}/health", cancellationToken);
            if (response.IsSuccessStatusCode) return $"https://{ip}:{_state.HostPort}/";
        }
        catch (HttpRequestException) { }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { }
        return null;
    }

    private HttpClient CreatePinnedClient()
    {
        var expected = _certificateFingerprint.Replace(":", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (_, certificate, _, errors) =>
                certificate is not null &&
                string.Equals(Convert.ToHexString(certificate.GetCertHash(HashAlgorithmName.SHA256)), expected, StringComparison.Ordinal) &&
                (errors == System.Net.Security.SslPolicyErrors.None || errors == System.Net.Security.SslPolicyErrors.RemoteCertificateChainErrors)
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(4) };
    }

    private static string CreatePairingCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static async Task WriteProtectedFileAsync(string path, string value, CancellationToken cancellationToken)
    {
        CreateProtectedSecretDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, value, new UTF8Encoding(false), cancellationToken);
    }

    private static void CreateProtectedSecretDirectory(string path)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Protected secret files require the supported Windows host.");
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        foreach (var sid in new[]
                 {
                     WindowsIdentity.GetCurrent().User!,
                     new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                     new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null)
                 })
            security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        Directory.CreateDirectory(path);
        new DirectoryInfo(path).SetAccessControl(security);
    }

    private static async Task<TlsMaterial> CreateTlsMaterialAsync(string secretDirectory, IPAddress bindAddress, string? reusablePublicCertificatePath, CancellationToken cancellationToken)
    {
        var secretRoot = Path.GetFullPath(secretDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!string.IsNullOrWhiteSpace(reusablePublicCertificatePath))
        {
            try
            {
                var priorPublicPath = Path.GetFullPath(reusablePublicCertificatePath);
                if (priorPublicPath.StartsWith(secretRoot, StringComparison.OrdinalIgnoreCase) &&
                    Path.GetFileName(priorPublicPath).StartsWith("watchdog_tls_", StringComparison.Ordinal))
                {
                    var priorPfxPath = Path.ChangeExtension(priorPublicPath, ".pfx");
                    var priorPasswordPath = Path.ChangeExtension(priorPublicPath, ".password");
                    var priorFingerprintPath = Path.ChangeExtension(priorPublicPath, ".fingerprint");
                    if (File.Exists(priorPublicPath) && File.Exists(priorPfxPath) && File.Exists(priorPasswordPath) && File.Exists(priorFingerprintPath))
                    {
                        var priorPassword = await File.ReadAllTextAsync(priorPasswordPath, cancellationToken);
                        using var priorCertificate = X509CertificateLoader.LoadPkcs12FromFile(priorPfxPath, priorPassword, X509KeyStorageFlags.EphemeralKeySet);
                        var priorFingerprint = Convert.ToHexString(priorCertificate.GetCertHash(HashAlgorithmName.SHA256));
                        var expectedRecord = $"WATCHDOG_TLS_V1\n{bindAddress}\n{priorFingerprint}";
                        var actualRecord = await File.ReadAllTextAsync(priorFingerprintPath, cancellationToken);
                        if (priorCertificate.NotAfter > DateTime.UtcNow && string.Equals(actualRecord, expectedRecord, StringComparison.Ordinal))
                            return new TlsMaterial(priorPfxPath, priorPasswordPath, priorPublicPath, priorFingerprint);
                    }
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or CryptographicException or ArgumentException)
            {
                // Preserve an unreadable prior generation and create a new uniquely named one below.
            }
        }
        CreateProtectedSecretDirectory(secretDirectory);
        var addressHash = Convert.ToHexString(SHA256.HashData(bindAddress.GetAddressBytes()))[..12].ToLowerInvariant();
        var generation = $"watchdog_tls_{addressHash}_{Guid.NewGuid():N}";
        var pfxPath = Path.Combine(secretDirectory, generation + ".pfx");
        var passwordPath = Path.Combine(secretDirectory, generation + ".password");
        var publicPath = Path.Combine(secretDirectory, generation + ".cer");
        var fingerprintPath = Path.Combine(secretDirectory, generation + ".fingerprint");
        using var rsa = RSA.Create(3072);
        var request = new CertificateRequest("CN=Watchdog Control", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        var enhanced = new OidCollection { new("1.3.6.1.5.5.7.3.1") };
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(enhanced, true));
        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("localhost");
        san.AddDnsName(Environment.MachineName);
        san.AddIpAddress(IPAddress.Loopback);
        san.AddIpAddress(bindAddress);
        request.CertificateExtensions.Add(san.Build());
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(1));
        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(36));
        var fingerprint = Convert.ToHexString(certificate.GetCertHash(HashAlgorithmName.SHA256));
        await File.WriteAllBytesAsync(pfxPath, certificate.Export(X509ContentType.Pfx, password), cancellationToken);
        await WriteProtectedFileAsync(passwordPath, password, cancellationToken);
        await File.WriteAllBytesAsync(publicPath, certificate.Export(X509ContentType.Cert), cancellationToken);
        await File.WriteAllTextAsync(fingerprintPath, $"WATCHDOG_TLS_V1\n{bindAddress}\n{fingerprint}", new UTF8Encoding(false), cancellationToken);
        return new TlsMaterial(pfxPath, passwordPath, publicPath, fingerprint);
    }

    private sealed record TlsMaterial(string PfxPath, string PasswordPath, string PublicCertificatePath, string Fingerprint);

    private Task<CommandResult> RunDockerAsync(IReadOnlyList<string> arguments, IReadOnlyDictionary<string, string?> environment, CancellationToken cancellationToken)
    {
        return CommandRunner.RunAsync(FindDockerCli() ?? "docker", arguments, _state.ComposeDirectory, environment, CommandTimeout, cancellationToken, Report, string.Empty);
    }

    private static string? FindDockerCli()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var candidates = new[]
        {
            Path.Combine(local, "Programs", "DockerDesktop", "resources", "bin", "docker.exe"),
            Path.Combine(programFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
        };
        foreach (var candidate in candidates)
            if (File.Exists(candidate)) return candidate;

        return Environment.GetEnvironmentVariable("PATH")?
            .Split(Path.PathSeparator)
            .Select(directory => Path.Combine(directory.Trim('"'), "docker.exe"))
            .FirstOrDefault(File.Exists);
    }

    private static string? FindDockerDesktop()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var candidates = new[]
        {
            Path.Combine(local, "Programs", "DockerDesktop", "Docker Desktop.exe"),
            Path.Combine(programFiles, "Docker", "Docker", "Docker Desktop.exe")
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private async Task RecordFailureAsync(string reason)
    {
        _state.InstallationVerified = false;
        _state.LastOperationSummary = reason;
        Report(reason);
        await SaveStateAsync();
    }

    private async void BrowseStorage_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Choose the persistent Watchdog Control data folder", InitialDirectory = Directory.Exists(_state.StorageDirectory) ? _state.StorageDirectory : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) };
        if (dialog.ShowDialog(this) != true) return;
        var selectedPath = Path.GetFullPath(dialog.FolderName);
        if (_state.ServiceStarted && !string.Equals(selectedPath, _state.StorageDirectory, StringComparison.OrdinalIgnoreCase))
        {
            var answer = MessageBox.Show(
                this,
                "Changing this folder does not move or copy existing Watchdog Control data. The previous folder and its contents will remain untouched. Continue with the newly selected folder?",
                "Confirm data folder change",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning,
                MessageBoxResult.No);
            if (answer != MessageBoxResult.Yes) return;
        }
        _state.StorageDirectory = selectedPath;
        if (_state.RequiresStorageSelection)
        {
            _state.StorageChoiceConfirmed = false;
            if (_storageChoiceConfirmation is not null) _storageChoiceConfirmation.IsChecked = false;
        }
        _storageBox!.Text = _state.StorageDirectory;
        await SaveStateAsync();
    }

    private async void Next_Click(object sender, RoutedEventArgs e)
    {
        if (_step == 0 && _state.ProgressRecoveryWarning is not null)
        {
            if (_progressRecoveryAcknowledgement?.IsChecked != true)
            {
                SetStatus("Preserve the unreadable setup record before continuing.", false);
                return;
            }
            try
            {
                var preservedPath = await _stateStore.PreserveUnreadableProgressAsync();
                _state = new SetupState
                {
                    RequiresStorageSelection = true,
                    LastOperationSummary = "Previous setup progress was preserved to " + Path.GetFileName(preservedPath) + ". Choose the correct data folder before starting setup."
                };
                _step = 1;
                _state.LastStep = 1;
                await SaveStateAsync();
                RenderStep();
                SetStatus(_state.LastOperationSummary, false);
            }
            catch (Exception ex)
            {
                SetStatus("The unreadable setup record could not be preserved, so setup cannot continue: " + SafeSummary(ex.Message), false);
            }
            return;
        }
        if (_step == 1)
        {
            if (!ValidatePort(out var message)) { SetStatus(message, false); return; }
            var selectedAddress = (_lanBindBox?.SelectedItem as LanInterfaceOption)?.Address;
            if (selectedAddress is null || !IsPrivateLanAddress(selectedAddress) || !GetPrivateLanInterfaces().Any(option => option.Address.Equals(selectedAddress)))
            {
                SetStatus("Choose an active private Ethernet or Wi-Fi IPv4 address before continuing.", false);
                return;
            }
            _state.LanBindAddress = selectedAddress.ToString();
            if (_state.RequiresStorageSelection && !_state.StorageChoiceConfirmed)
            {
                SetStatus("Confirm the existing data folder or deliberately choose a new empty folder before continuing.", false);
                return;
            }
            _state.HostPort = ParsePort();
            if (string.IsNullOrWhiteSpace(_state.StorageDirectory)) _state.StorageDirectory = DefaultStoragePath();
            _state.LastStep = 2;
            _step = 2;
            _ = SaveStateAsync();
            RenderStep();
            _ = ProbeDockerAsync();
            return;
        }
        if (_step == 2 && !_state.DockerReady) SetStatus("The confirmed setup run will install the supported container runtime automatically, then verify it before starting the service.", false);
        if (_step == 3)
        {
            _state.LastStep = 4;
            _step = 4;
            _ = SaveStateAsync();
            RenderStep();
            return;
        }
        if (_step == 4 && !_state.ManifestAvailable) { SetStatus("A normal release with a valid immutable-image manifest is required before setup can start.", false); return; }
        if (_step < 4)
        {
            _step++;
            _state.LastStep = _step;
            _ = SaveStateAsync();
            RenderStep();
            if (_step == 2) _ = ProbeDockerAsync();
        }
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (_operationRunning)
        {
            if (_step == 5) _operationCancellation?.Cancel();
            return;
        }
        if (_step <= 0) return;
        if (_step == 5)
        {
            _step = 4;
            _state.LastStep = 4;
            RenderStep();
            _ = SaveStateAsync();
            return;
        }
        _step--;
        _state.LastStep = _step;
        RenderStep();
        _ = SaveStateAsync();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        if (_operationRunning)
        {
            _operationCancellation?.Cancel();
            SetStatus("Cancellation requested. A completed service start is left running.", false);
            return;
        }
        Close();
    }

    private void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (!_operationRunning) return;
        e.Cancel = true;
        _operationCancellation?.Cancel();
        SetStatus("Cancellation requested. The window will close after the active setup command returns.", false);
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (Keyboard.Modifiers == ModifierKeys.Alt && e.Key == Key.Left) { Back_Click(this, new RoutedEventArgs()); e.Handled = true; }
        else if (Keyboard.Modifiers == ModifierKeys.Alt && e.Key == Key.Right && NextButton.Visibility == Visibility.Visible && NextButton.IsEnabled) { Next_Click(this, new RoutedEventArgs()); e.Handled = true; }
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2) Maximize_Click(sender, e);
        else if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }
    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void Maximize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void RefreshReview()
    {
        if (_reviewDetails is not null)
        {
            var runtime = _state.DockerReady ? $"Ready · {_state.DockerContext ?? "local context"}" : "Missing · the assistant will install and verify it automatically";
            _reviewDetails.Text = $"Container runtime: {runtime}\nRelease: {_state.ReleaseTag ?? "not available"}\nSource: {_state.SourceSha ?? "not available"}\nImage: {_state.ImageReference ?? "not available"}\nLAN bind: {_state.LanBindAddress ?? "not selected"}\nHTTPS endpoint: https://{_state.LanBindAddress ?? "not selected"}:{_state.HostPort}/\nPersistent data: {_state.StorageDirectory}\nCompose project: watchdog-control";
        }
        if (_startInstallButton is not null) _startInstallButton.IsEnabled = _state.StartConfirmed && _state.ManifestAvailable && GetSelectedLanAddress() is not null && (!_state.ManageThisComputer || _state.SystemServiceConsent);
    }

    private void LanBindBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var selectedAddress = (_lanBindBox?.SelectedItem as LanInterfaceOption)?.Address.ToString();
        if (string.Equals(_state.LanBindAddress, selectedAddress, StringComparison.Ordinal)) return;
        _state.LanBindAddress = selectedAddress;
        _state.StartConfirmed = false;
        RefreshReview();
        SetStatus("The selected LAN interface changed. Review and confirm this destination again before setup.", false);
        _ = SaveStateAsync();
    }

    private void AddReleaseStatus()
    {
        var message = _state.ManifestAvailable
            ? $"Release {_state.ReleaseTag} is available, with source {_state.SourceSha} and a digest-pinned image."
            : "Image availability has not been confirmed. Setup will fetch a public normal release manifest before it changes the selected Docker host.";
        AddCallout("Release source", _state.ManifestUnavailableReason ?? message, "Package");
    }

    private void Report(string line)
    {
        Dispatcher.Invoke(() =>
        {
            if (_operationOutput is not null) _operationOutput.Text = (string.IsNullOrEmpty(_operationOutput.Text) ? string.Empty : _operationOutput.Text + Environment.NewLine) + line;
            SetStatus(line, false);
        });
    }

    private void SetOperationProgress(string message) => Dispatcher.Invoke(() =>
    {
        if (_operationOutput is null) return;
        _operationOutput.Text = (string.IsNullOrEmpty(_operationOutput.Text) ? string.Empty : _operationOutput.Text + Environment.NewLine) + message;
        RaiseLiveRegionChanged(_operationOutput);
    });

    private void SetStatus(string message, bool good)
    {
        StatusText.Text = message;
        StatusDot.Fill = good ? new SolidColorBrush(Color.FromRgb(34, 150, 103)) : new SolidColorBrush(Color.FromRgb(96, 112, 138));
        RaiseLiveRegionChanged(StatusText);
    }

    private static void RaiseLiveRegionChanged(FrameworkElement element)
    {
        var peer = UIElementAutomationPeer.FromElement(element) ?? UIElementAutomationPeer.CreatePeerForElement(element);
        peer?.RaiseAutomationEvent(AutomationEvents.LiveRegionChanged);
    }

    private void FocusPageHeading()
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            if (_pageHeading is { IsVisible: true }) Keyboard.Focus(_pageHeading);
        }), System.Windows.Threading.DispatcherPriority.Input);
    }

    private void ApplyCompactWindowLayout()
    {
        var workArea = SystemParameters.WorkArea;
        MinWidth = Math.Min(640, workArea.Width);
        MinHeight = Math.Min(480, workArea.Height);
        Width = Math.Min(1180, workArea.Width);
        Height = Math.Min(780, workArea.Height);
        UpdateResponsiveLayout();
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e) => UpdateResponsiveLayout();

    private static IReadOnlyList<LanInterfaceOption> GetPrivateLanInterfaces()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(network => network.OperationalStatus == OperationalStatus.Up &&
                    network.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211)
                .SelectMany(network =>
                {
                    try
                    {
                        var properties = network.GetIPProperties();
                        var hasPrivateGateway = properties.GatewayAddresses.Any(gateway => IsPrivateLanAddress(gateway.Address));
                        return properties.UnicastAddresses
                            .Select(unicast => new LanInterfaceOption(network.Name, unicast.Address, hasPrivateGateway));
                    }
                    catch (NetworkInformationException)
                    {
                        return Enumerable.Empty<LanInterfaceOption>();
                    }
                })
                .Where(option => IsPrivateLanAddress(option.Address))
                .DistinctBy(option => (option.Name, Address: option.Address.ToString()))
                .OrderBy(option => option.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(option => option.Address.ToString(), StringComparer.Ordinal)
                .ToArray();
        }
        catch (NetworkInformationException)
        {
            return Array.Empty<LanInterfaceOption>();
        }
    }

    private static LanInterfaceOption? ResolveLanSelection(IReadOnlyList<LanInterfaceOption> interfaces, string? savedAddress)
    {
        var savedSelection = interfaces.FirstOrDefault(option => string.Equals(option.Address.ToString(), savedAddress, StringComparison.Ordinal));
        if (savedSelection is not null) return savedSelection;

        var privateGatewayOptions = interfaces.Where(option => option.HasPrivateGateway).ToArray();
        if (privateGatewayOptions.Length == 1) return privateGatewayOptions[0];
        if (privateGatewayOptions.Length == 0 && interfaces.Count == 1) return interfaces[0];
        return null;
    }

    private static bool IsPrivateLanAddress(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 ||
            (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
            (bytes[0] == 192 && bytes[1] == 168);
    }

    private IPAddress? GetSelectedLanAddress()
    {
        if (!IPAddress.TryParse(_state.LanBindAddress, out var address) || !IsPrivateLanAddress(address)) return null;
        return GetPrivateLanInterfaces().Any(option => option.Address.Equals(address)) ? address : null;
    }

    private void UpdateResponsiveLayout()
    {
        var compact = ActualWidth < 900;
        WorkspaceGrid.Margin = compact ? new Thickness(10) : new Thickness(26, 24, 26, 20);
        WorkspaceGrid.ColumnDefinitions[0].Width = compact ? new GridLength(0) : new GridLength(250);
        WorkspaceGrid.ColumnDefinitions[1].Width = compact ? new GridLength(0) : new GridLength(28);
        NavigationPanel.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        ContentPanel.Padding = compact ? new Thickness(14, 12, 14, 12) : new Thickness(34, 30, 34, 22);
        CompactStepText.Visibility = compact ? Visibility.Visible : Visibility.Collapsed;
    }

    private async Task SaveStateAsync()
    {
        if (_state.ProgressRecoveryWarning is not null) return;
        await _stateStore.SaveAsync(_state);
    }

    private bool ValidatePort(out string message)
    {
        var port = ParsePort();
        if (port is < 1024 or > 65535) { message = "Choose a host port from 1024 to 65535."; return false; }
        try
        {
            using var listener = new TcpListener(IPAddress.Any, port);
            listener.Start(); listener.Stop();
        }
        catch (SocketException) { message = $"Port {port} is already in use on this host. Choose another port."; return false; }
        message = string.Empty;
        return true;
    }

    private int ParsePort()
    {
        var value = _portBox?.Text ?? _state.HostPort.ToString();
        return int.TryParse(value, out var port) ? port : -1;
    }

    private static string DefaultStoragePath() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WatchdogControl", "data");
    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("WatchdogControlSetup/0.1.1");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return client;
    }
    private static string ReadString(JsonElement node, string name) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;
    private static bool ReadBool(JsonElement node, string name) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
    private static int ReadInt(JsonElement node, string name) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : -1;
    private static string SafeSummary(string? value)
    {
        var line = (value ?? string.Empty).Replace('\r', ' ').Replace('\n', ' ').Trim();
        return line.Length > 240 ? line[..240] : line;
    }

    private void AddEyebrow(string text)
    {
        var label = new TextBlock { Text = text, Foreground = new SolidColorBrush(Color.FromRgb(36, 88, 211)), FontWeight = FontWeights.Bold, FontSize = 12, Margin = new Thickness(0, 0, 0, 12) };
        AutomationProperties.SetName(label, text);
        PageHost.Children.Add(label);
    }
    private void AddHeading(string text)
    {
        _pageHeading = new TextBlock
        {
            Text = text,
            FontSize = 30,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 14),
            LineHeight = 38,
            Focusable = true
        };
        AutomationProperties.SetName(_pageHeading, text);
        PageHost.Children.Add(_pageHeading);
    }
    private void AddBody(string text) => PageHost.Children.Add(new TextBlock { Text = text, FontSize = 14, Foreground = (Brush)FindResource("TextSecondary"), LineHeight = 22, Margin = new Thickness(0, 0, 0, 16) });
    private void AddLabel(string label, string description)
    {
        PageHost.Children.Add(new TextBlock { Text = label, FontSize = 14, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 12, 0, 4) });
        PageHost.Children.Add(new TextBlock { Text = description, FontSize = 12, Foreground = (Brush)FindResource("TextSecondary") });
    }
    private Border NewCard()
    {
        var border = new Border { Background = new SolidColorBrush(Color.FromRgb(249, 250, 253)), BorderBrush = new SolidColorBrush(Color.FromRgb(228, 233, 242)), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(14), Padding = new Thickness(18), Margin = new Thickness(0, 12, 0, 12), Child = new StackPanel() };
        return border;
    }
    private void AddCallout(string title, string message, string icon)
    {
        var card = NewCard();
        var stack = (StackPanel)card.Child!;
        stack.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.SemiBold, FontSize = 14, Margin = new Thickness(0, 0, 0, 7) });
        stack.Children.Add(new TextBlock { Text = message, Foreground = (Brush)FindResource("TextSecondary"), FontSize = 13, LineHeight = 20 });
        PageHost.Children.Add(card);
    }

    private void AddLinkCallout(string title, Uri address)
    {
        var card = NewCard();
        var stack = (StackPanel)card.Child!;
        stack.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.SemiBold, FontSize = 14, Margin = new Thickness(0, 0, 0, 7) });
        var text = new TextBlock { FontSize = 13, TextWrapping = TextWrapping.Wrap };
        var link = new Hyperlink(new Run(address.AbsoluteUri)) { NavigateUri = address };
        link.RequestNavigate += (_, args) =>
        {
            Process.Start(new ProcessStartInfo(args.Uri.AbsoluteUri) { UseShellExecute = true });
            args.Handled = true;
        };
        text.Inlines.Add(link);
        stack.Children.Add(text);
        PageHost.Children.Add(card);
    }

    private sealed record StepIndicator(Border Dot, TextBlock Title);

    private sealed record LanInterfaceOption(string Name, IPAddress Address, bool HasPrivateGateway)
    {
        public string DisplayName => HasPrivateGateway ? $"{Name} | {Address} | private gateway" : $"{Name} | {Address}";
    }
}

internal sealed class SetupState
{
    public int LastStep { get; set; }
    public int HostPort { get; set; } = 8443;
    public string StorageDirectory { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WatchdogControl", "data");
    public string ComposeDirectory { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WatchdogControl", "service");
    public string? ComposePath { get; set; }
    public string? DockerContext { get; set; }
    public string? DockerStatus { get; set; }
    public string? LanBindAddress { get; set; }
    public bool DockerReady { get; set; }
    public bool StartConfirmed { get; set; }
    public bool ManifestAvailable { get; set; }
    public string? ManifestUnavailableReason { get; set; }
    public string? ReleaseTag { get; set; }
    public string? SourceSha { get; set; }
    public string? ImageReference { get; set; }
    public string? ComposeSha256 { get; set; }
    public bool ServiceStarted { get; set; }
    public bool InstallationVerified { get; set; }
    public bool PairingCodeShown { get; set; }
    public bool ManageThisComputer { get; set; }
    public bool SystemServiceConsent { get; set; }
    public bool RequiresStorageSelection { get; set; }
    public bool StorageChoiceConfirmed { get; set; }
    public string? AgentStatus { get; set; }
    public string? LanUrl { get; set; }
    public string? CertificateFingerprint { get; set; }
    public string? PublicCertificatePath { get; set; }
    public string? LastOperationSummary { get; set; }
    public string? ProgressRecoveryWarning { get; set; }
}

internal sealed class SetupStateStore
{
    private static readonly string StatePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ding-Ding-Projects", "WatchdogControlSetup", "progress.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, MaxDepth = 8 };

    public async Task<SetupState> LoadAsync()
    {
        try { _ = File.GetAttributes(StatePath); }
        catch (FileNotFoundException) { return new SetupState(); }
        catch (DirectoryNotFoundException) { return new SetupState(); }
        catch (UnauthorizedAccessException) { return RecoveryRequired("The saved setup record cannot be read with the current account."); }
        catch (IOException) { return RecoveryRequired("The saved setup record could not be accessed because of a storage problem."); }
        try
        {
            await using var input = new FileStream(StatePath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (input.Length > 32 * 1024) return RecoveryRequired("The saved setup record exceeds the supported 32 KiB size limit.");
            var state = await JsonSerializer.DeserializeAsync<SetupState>(input, JsonOptions);
            if (state is null || string.IsNullOrWhiteSpace(state.StorageDirectory) || string.IsNullOrWhiteSpace(state.ComposeDirectory) ||
                !Path.IsPathFullyQualified(state.StorageDirectory) || !Path.IsPathFullyQualified(state.ComposeDirectory) || state.HostPort is < 1024 or > 65535)
                return RecoveryRequired("The saved setup record does not contain a valid data location, service location, or HTTPS port.");
            return state;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return RecoveryRequired("The saved setup record is unreadable because of a format, access, or storage problem.");
        }
    }

    public async Task<string> PreserveUnreadableProgressAsync()
    {
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", System.Globalization.CultureInfo.InvariantCulture);
        var preservedPath = StatePath + ".recovery-" + stamp + ".json";
        byte[] sourceHash;
        long sourceLength;
        await using (var source = new FileStream(StatePath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous | FileOptions.SequentialScan))
        {
            sourceLength = source.Length;
            await using (var copy = new FileStream(preservedPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                await source.CopyToAsync(copy);
                await copy.FlushAsync();
                copy.Flush(flushToDisk: true);
            }
            source.Position = 0;
            sourceHash = await SHA256.HashDataAsync(source);
        }
        await using var preserved = new FileStream(preservedPath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
        if (preserved.Length != sourceLength)
            throw new IOException("The preserved setup record size did not match the original.");
        var preservedHash = await SHA256.HashDataAsync(preserved);
        if (!CryptographicOperations.FixedTimeEquals(sourceHash, preservedHash))
            throw new IOException("The preserved setup record digest did not match the original.");
        return preservedPath;
    }

    public async Task SaveAsync(SetupState state)
    {
        var directory = Path.GetDirectoryName(StatePath)!;
        Directory.CreateDirectory(directory);
        var temp = StatePath + ".tmp";
        await using (var output = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            await JsonSerializer.SerializeAsync(output, state, JsonOptions);
        File.Move(temp, StatePath, true);
    }

    private static SetupState RecoveryRequired(string reason) => new() { ProgressRecoveryWarning = reason };
}

internal sealed record CommandResult(int ExitCode, string StandardOutput, string StandardError);

internal static class CommandRunner
{
    public static async Task<CommandResult> RunAsync(string fileName, IReadOnlyList<string> arguments, string? workingDirectory, IReadOnlyDictionary<string, string?>? environment, TimeSpan timeout, CancellationToken cancellationToken, Action<string>? progress, string redaction)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(timeout);
        var start = new ProcessStartInfo(fileName)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = workingDirectory is not null && Directory.Exists(workingDirectory) ? workingDirectory : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        if (environment is not null) foreach (var pair in environment) start.Environment[pair.Key] = pair.Value;
        using var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        try
        {
            if (!process.Start()) throw new InvalidOperationException("Docker command could not start.");
        }
        catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 2)
        {
            throw new InvalidOperationException("Docker CLI is not installed or is not on PATH.");
        }
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        var outTask = ReadAsync(process.StandardOutput, stdout, progress, redaction, deadline.Token);
        var errTask = ReadAsync(process.StandardError, stderr, progress, redaction, deadline.Token);
        try { await process.WaitForExitAsync(deadline.Token); }
        catch (OperationCanceledException)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            if (!cancellationToken.IsCancellationRequested) throw new TimeoutException($"The fixed Docker operation exceeded its {timeout.TotalSeconds:0}-second limit.");
            throw;
        }
        await Task.WhenAll(outTask, errTask);
        return new CommandResult(process.ExitCode, stdout.ToString(), stderr.ToString());
    }

    private static async Task ReadAsync(StreamReader reader, StringBuilder captured, Action<string>? progress, string redaction, CancellationToken cancellationToken)
    {
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            var safe = line.Length > 800 ? line[..800] : line;
            if (!string.IsNullOrEmpty(redaction)) safe = safe.Replace(redaction, "[redacted]", StringComparison.Ordinal);
            if (captured.Length < 16 * 1024) captured.AppendLine(safe);
            progress?.Invoke(safe);
        }
    }
}

internal static class BuildProvenance
{
    public static string ReadableLabel()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var version = assembly.GetName().Version?.ToString(3) ?? "unavailable";
        var metadata = assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Where(attribute => attribute.Value is not null)
            .ToDictionary(attribute => attribute.Key, attribute => attribute.Value!, StringComparer.OrdinalIgnoreCase);
        var sourceSha = metadata.GetValueOrDefault("WatchdogSourceSha");
        var sourceLabel = sourceSha is { Length: 40 } && Regex.IsMatch(sourceSha, "^[a-f0-9]{40}$", RegexOptions.CultureInvariant)
            ? $" · source {sourceSha[..12]}"
            : string.Empty;
        var buildTime = metadata.GetValueOrDefault("WatchdogBuildUtc");
        if (!DateTimeOffset.TryParse(buildTime, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var parsed))
            return $"Version {version}{sourceLabel} · build time unavailable";
        return $"Version {version}{sourceLabel} · built {parsed.ToLocalTime():yyyy-MM-dd HH:mm:ss zzz}";
    }
}
