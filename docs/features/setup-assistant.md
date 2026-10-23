# Automatic setup assistant

**The normal `v0.1.1` release is published.** Its portable setup file is 68,084,205 bytes with SHA-256 `f8154f0d6978c1b95175fab12ecfaa3bed378c94338205459f9bf4a36e2d3114`; it embeds `compose.yaml`. The local `v0.1.1` file was launched without installation and its welcome-screen host action pulled the verified image, wrote its service files, started the named Compose project, and passed HTTPS health on the selected LAN address. The container remained healthy after the setup window hit a concurrent progress-save failure. The source now gives each state write a unique temporary file; the fix, updated `v0.1.2` package, and rebuilt interface still need verification. Current screenshots are pending because the earlier capture was blank.

## One-click hosting from the welcome screen

The welcome screen includes **Host Watchdog Control on this computer**. Clicking it is the explicit start confirmation and begins the bounded setup and health-check workflow without opening each guided step. The setup file is portable and single-file, so it can be launched directly from a download folder or removable storage without installing the setup application.

This quick route uses an already-ready local Docker Engine and Compose plugin. It downloads the verified Watchdog Control image and writes this service's configuration and protected local files. It does not install the assistant, Docker Desktop, another runtime, the optional host agent, or other host prerequisites. Before enabling the action, the assistant checks that a verified normal release manifest is available, the selected private LAN interface is unambiguous, the HTTPS port is valid and available when first starting, and the saved data folder does not require recovery confirmation. The welcome screen shows the destination URL and data folder. If a check is not satisfied, the action stays disabled and explains the next setup step.

The assistant contains `compose.yaml` as an embedded resource. It verifies the embedded file's SHA-256 against `service.composeSha256` in the selected release manifest before writing the host copy and starting the named project. The quick route still pulls the immutable image and writes service configuration and protected local files. A previously started service remains available to the retry path; quick hosting never removes unrelated projects or existing data.

The assistant compares the planned `compose.yaml`, `.env`, `host.bat`, and `scripts/host.ps1` bytes with files already in the service folder. Exact matches are reused. If any differ, a confirmation lists only the affected files; the assistant writes and verifies byte-for-byte backups before replacing those files. Choosing No leaves the differing files untouched. A file that changes during setup is preserved and blocks replacement. Failed writes roll back files changed in that operation when their contents still match the staged version, and retain verified backups for recovery.

## Guided setup

## Start or resume setup

1. Review the latest normal product release. The assistant verifies its release manifest, source tag, immutable image digest, embedded Compose checksum, and expected download metadata before continuing.
2. Choose an active private LAN IPv4 interface, an unused HTTPS host port, and a persistent data folder. The review step shows the HTTPS URL for that exact address. The assistant saves these choices locally so setup can resume after first-run prompts or a manually completed restart.
3. Review the current Docker context. The setup requires a local Windows engine because it creates the certificate, pairing files, data folder, and optional host-agent enrollment material on this computer.
4. On the review step, confirm the target computer and select **Install and verify automatically**. The assistant then installs missing supported prerequisites, pulls the release image, starts the service, and runs its health checks. Installing the optional machine-wide host agent requires separate consent.
5. Complete any package license, first-run, or native administrator prompt shown by the supported installers. If the operating system requires a restart, perform it manually and reopen the same assistant. Choose **Review settings and retry** to resume from saved progress.
6. The assistant verifies the embedded Compose file, pulls the immutable image, creates or reuses protected local TLS and pairing material, starts only its named project, checks pinned-certificate HTTPS health on the selected LAN address, and verifies the final LAN URL from the host.
7. At completion, check the pinned-certificate HTTPS health result from the selected LAN address, the final selected LAN URL, release tag, source revision, image digest, and certificate fingerprint. Export the public certificate and trust it on each client before entering the first owner credentials.

The setup application never starts a computer restart, changes sign-in or power settings, changes the host firewall, exposes the service on every interface, removes another Compose project, deletes existing service data, or accepts arbitrary shell text. The published service port is bound only to the selected active private LAN address.

## How missing container prerequisites are handled

When no local Docker Engine and Compose plugin are ready, the assistant checks the current user's App Installer registration. It first asks Windows to register the built-in package through Microsoft's documented registration command. If the package is not present, the assistant reads the latest stable release from Microsoft's public Windows Package Manager release feed, rejects drafts and prereleases, and requires the exact bundle, dependency manifest, and dependency archive with bounded sizes and SHA-256 digests from the release metadata.

The assistant downloads those assets over HTTPS into its application-specific local cache, verifies their digests, extracts only the x64 packages named by the dependency manifest, and installs the App Installer bundle for the current user with Windows package deployment. Windows validates the package signatures. The assistant then verifies the package family, Microsoft publisher identity, installed version, and `winget --version` result before starting the exact Docker Desktop package from the `winget` source.

The Docker package installation remains interactive. The assistant does not silently accept the Docker package's license, force administrator elevation, change PATH, or restart the computer. Docker Desktop starts after installation so its first-run or license screen can be completed by the user. Microsoft's current Windows guidance recommends per-user installation for ordinary use; that mode does not require administrator rights, while enabling WSL 2 for the first time can require administrator approval. See [Microsoft's WinGet installation guidance](https://learn.microsoft.com/en-us/windows/package-manager/winget/) and [Docker Desktop's Windows installation guidance](https://docs.docker.com/desktop/setup/install/windows-install/).

After the local engine is reachable, the assistant rechecks the active context and proceeds only when its endpoint is a local Windows named pipe. A remote or non-Windows context is not accepted.

## Saved setup state and privacy

The progress record holds setup choices, release identity, and the last completed step in the current Windows user's local profile. It does not hold the owner password. Pairing and certificate material are stored separately with user-only file permissions; the assistant does not write credentials or request bodies to its progress log. Successfully provisioned App Installer downloads are removed from the temporary cache. A failed provisioning attempt may retain verified downloads for a retry.

The optional Windows host agent is downloaded from the same normal product release and checked against its published digest. Installing its machine-wide service requires a separate checkbox and native administrator prompt. If that prompt is cancelled or unavailable, the dashboard setup can still complete and the agent remains clearly pending.

## Failure and recovery

| Condition | Assistant behavior |
| --- | --- |
| Unsupported 32-bit host | Stops before package installation and reports that the x64 setup route is unsupported. |
| WinGet package metadata is draft, prerelease, malformed, oversized, or missing a SHA-256 digest | Stops before installing the package manager or Docker Desktop. |
| Download length or digest does not match the published release metadata | Deletes the incomplete file, reports the mismatch, and leaves the service unchanged. |
| Windows package deployment fails | Reports the Windows result, keeps verified download files for a retry, and does not claim WinGet is ready. |
| Docker license, first-run setup, native consent, or WSL readiness is pending | Leaves the setup incomplete. Complete the prompt or required restart manually, reopen the assistant, and resume. |
| Docker Engine or Compose does not become ready within three minutes | Reports an incomplete prerequisite. The assistant leaves installed files and existing containers in place. |
| Selected Docker context is remote | Refuses to run this local-host setup against it. Select and verify a local Windows context. |
| Release, embedded Compose checksum, image pull, Compose validation, selected-address health, or final LAN URL check fails | Reports the actual step and keeps the existing data. A service that has already started is not automatically removed. |
| Existing Compose, environment, or host-control file differs from the verified setup version | Lists the differing files and asks before replacement. A confirmed replacement requires a verified local backup first; declining or a backup failure leaves existing files unchanged. |
| An existing file changes during setup or rollback cannot finish | Stops the file update, preserves verified backups, and reports the affected file for review. |
| Native consent to install the optional host agent is cancelled | Keeps the dashboard running and marks computer management pending. |

After an incomplete run, **Review settings and retry** returns to the saved target choices. Retrying checks the current local engine and active LAN interfaces again. A changed LAN address clears the prior destination confirmation. When the selected address changes, the assistant creates a certificate for that address, recreates only the Watchdog Control service so it loads the new certificate, and verifies the pinned certificate and hostname before showing the URL. It does not rely on readiness recorded before a restart.

## Concurrent progress saves

Setup progress is written through a unique, create-new temporary file per save, then atomically moved over the destination. This avoids writers contending for one shared `progress.json.tmp` path. Reads allow replacement while an older reader is still open. A focused concurrency test covers simultaneous saves, complete JSON, and temporary-file cleanup; it must be run after implementation and GUI acceptance.

## Build and verification state

The setup application is packaged as the portable `WatchdogControlSetup.exe` file by `build-installer.bat`; its project targets a self-contained, compressed, single-file `win-x64` build. The embedded Compose resource is included in that same executable, so launching the setup application needs no adjacent runtime folder or separate Compose download. Packaging requires the setup source to be committed first and embeds that exact source revision and build time in assembly metadata. The root `build-installer.bat` entrypoint verifies that only the executable is present in its publish folder, checks the packaged file size, and writes a SHA-256 sidecar. The `v0.1.1` package passed the real quick-host path on a computer with a ready local engine; this did not verify Docker installation, restart-resume, certificate import, host-agent installation, or client-device reachability. The `v0.1.2` package, fixed progress-save path, rebuilt interface, and current screenshots remain pending.

Continue with [deployment and recovery](deployment-recovery.md), [security and identity](identity-audit.md), or the [complete wiki setup chapter](../wiki/setup-assistant.md).
