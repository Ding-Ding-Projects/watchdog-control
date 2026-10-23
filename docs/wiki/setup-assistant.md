# Automatic setup assistant

## Current state

The setup assistant exists in source and the exact root `build.bat` completed locally on 2026-10-23. The native installation, deployment, and LAN workflows have not been exercised on the supported Windows host. No published release file is verified yet.

## Guided setup

1. Confirm the normal product release, source revision, and immutable container-image digest.
2. Choose an active private LAN IPv4 interface, an unused HTTPS host port, and persistent data folder.
3. Confirm that the active container context is a local Windows engine. The assistant refuses a remote context because it creates local certificate and pairing material and a local host-agent enrollment file.
4. Confirm automatic prerequisite setup and service start. If a container engine is unavailable, the assistant provisions the current-user App Installer package when needed, verifies it, and uses the exact Docker Desktop package from the WinGet source.
5. Complete any Docker package-license, first-run, or native administrator prompt. Any required operating-system restart is manual.
6. The assistant then downloads the release-matched Compose file and host controls, pulls the immutable image, creates or reuses protected local TLS and pairing material, starts only its named Compose project, checks pinned-certificate HTTPS health on the selected LAN address, and verifies the final LAN URL from the host.
7. Confirm the certificate fingerprint on each client before the first owner signs in. Export the public certificate from the completion screen and import it through the client's normal trust controls. Installing the optional LocalSystem host agent is a separate, consent-gated action.

The service port is bound only to the selected active private LAN address. Setup does not change the host firewall or expose the service on every network interface.

## App Installer bootstrap

The assistant checks whether the current user already has the Microsoft App Installer package and a working `winget --version`. When the package exists but the command is not registered, it asks Windows to use the supported family-registration mechanism. When App Installer is absent, it reads the latest stable public Microsoft release and rejects a draft, prerelease, malformed tag, unexpected download URL, missing digest, or excessive file size.

Only the three named package-manager release assets are acquired: the MSIX bundle, dependency manifest, and dependency archive. Their release sizes and SHA-256 digests are checked before installation. Dependency names and versions are validated, only matching x64 packages are extracted to generated safe file names, and Windows package deployment validates the package signatures. The assistant verifies the installed package family, publisher, version, and WinGet command before proceeding.

Verified downloads are cached in the setup assistant's local application data while installation is in progress. They are removed after successful registration. If package deployment fails, the verified files remain available for a retry. Partial downloads are deleted and never used as package input.

## Docker Desktop and restart handling

After the owner confirms the destination, the assistant runs the supported prerequisite, image pull, service start, and verification steps automatically. The Docker package installation remains interactive. The assistant does not silently accept the package license, weaken operating-system package policy, force elevation, change the system PATH, or restart the host. Docker Desktop is started after installation so the user can complete its first-run screen. The assistant polls for a local engine and Compose plugin for up to three minutes.

If the operating system requires administrator approval to enable WSL or another prerequisite, the user handles the native prompt. If a restart is required, the user performs that action manually and starts the same portable setup file again. The assistant reloads its saved choices and offers **Review settings and retry**. It rechecks the live engine and active LAN addresses rather than trusting saved readiness, reuses the selected folders, and resumes the fixed setup sequence.

Microsoft currently documents per-user Docker Desktop installation as the recommended mode for ordinary use and says first-time WSL 2 enablement can require administrator privileges. See [Microsoft WinGet documentation](https://learn.microsoft.com/en-us/windows/package-manager/winget/) and [Docker Desktop Windows installation documentation](https://docs.docker.com/desktop/setup/install/windows-install/).

## Saved state and secret handling

The local progress record contains the last step, selected LAN address, port and folders, release identity, and result summary. It does not contain the owner password. The service certificate names only localhost, loopback, and the selected LAN address. Certificate keys and one-time pairing values are separate user-protected files. The setup assistant does not copy those values into its ordinary log or public source. Successful service start preserves existing volumes and does not alter unrelated Compose projects. If the selected LAN address changes, setup renews the certificate and recreates only the Watchdog Control service before verifying the new endpoint.

## Recovery cases

| Condition | Recovery |
| --- | --- |
| Unsupported architecture | Stop before package acquisition and use a supported x64 Windows host. |
| App Installer release cannot be verified | Stop; do not install unverified packages. Retry when official release metadata and assets are available. |
| Download is incomplete or fails its digest | Delete that partial file, preserve all existing service state, and retry. |
| Windows package deployment fails | Keep the verified cache for retry and show the Windows deployment result. |
| Docker license or first-run screen remains | Complete it in Docker Desktop and select **Review settings and retry** in the setup assistant. |
| WSL or native consent requires a restart | Complete the consent, restart manually if Windows requires it, then reopen and resume. |
| Local engine remains unavailable after the bounded wait | Leave existing files and services untouched; resolve first-run setup or restart requirements, then resume. |
| Docker context is remote | Select and verify a local context before running setup. |
| Image or health verification fails after service start | Preserve the running service for inspection. Select **Review settings and retry** or use the separate host controls; no automatic removal is attempted. |
| Optional host-agent UAC is cancelled | Keep the dashboard available and leave computer management marked pending. |

## Verification state

The exact root `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors. The package entrypoint has not run, so there is no verified package hash yet. The native wizard, package acquisition, App Installer registration, Docker Desktop install, resume after restart, service pull and start, LAN endpoint, and LocalSystem service path remain unverified until inspected on the supported Windows host. See [the deployment and recovery feature article](../features/deployment-recovery.md) and [the complete feature inventory](../features/README.md).
