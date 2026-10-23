# Deployment and recovery

**Release `v0.1.1` and its embedded Compose integrity check are verified.** The portable single-file setup file launched on the current host and its one-click GUI action started the published service without installing the setup application or additional host software. HTTPS health returned HTTP 200 on the selected LAN address. The setup window then hit a confirmed concurrent progress-save failure while the container remained healthy. The source fix gives each save a unique temporary file. Its rebuilt package and current screenshots remain pending.

## Deploy the named service

1. Confirm the published product release and its immutable image digest.
2. On the hosting Windows computer, double-click the portable setup assistant or use `host.bat` after Docker Engine and Compose are ready. The assistant is a self-contained single file and does not need installation.
3. Confirm the local container context and select an active private LAN IPv4 address, an unused HTTPS port, and a persistent data folder.
4. Review the release tag and source revision before confirming setup.
5. Wait for image pull, configuration validation, service start, HTTPS health, and the local LAN URL check.
6. Verify the certificate fingerprint on each client before entering owner credentials.

The setup assistant and `host.bat` operate on the named `watchdog-control` Compose project. The portable file embeds `compose.yaml` and verifies its SHA-256 against the selected release manifest. Its welcome-screen **Host Watchdog Control on this computer** action starts the service with one click when a local engine, valid release, selected private LAN interface, usable port, and saved data location are ready. This quick path runs without installing the setup application, Docker Desktop, another runtime, the optional host agent, or other host prerequisites. It downloads the verified image and writes this service's configuration and protected local files. The guided setup remains available for prerequisite installation and detailed recovery.

Double-clicking `host.bat` presents a keyboard menu. If no choice is made within eight seconds, it starts or updates the service and returns after health checks. `host.bat --detached` starts and verifies in the background, `host.bat --logs` opens the interactive log view, and `host.bat --stop` is the separate explicit stop action.

## Automatic prerequisite setup and resume

When the local engine is absent, the assistant provisions Microsoft's stable App Installer package for the current user if WinGet is unavailable, verifies the published hashes and package identity, and launches the interactive Docker Desktop installation. Docker's license and first-run prompts remain user-controlled. Any required native elevation or computer restart is handled by the user. After a restart, reopen the portable assistant and select **Review settings and retry**. It reads the saved progress, checks the current engine and active LAN addresses, and continues from the saved destination without trusting a stale health result.

The complete procedure and failure table are in [Automatic setup assistant](setup-assistant.md).

## Configuration and permissions

The published Compose setup requires an image digest, host port, selected private LAN address, persistent data path, and local paths for TLS certificate, TLS password, pairing code, and optional host-agent enrollment code. Secret values are stored in host-only files, not committed source or public release metadata. The assistant never stores the owner password. The optional LocalSystem host agent requires an explicit choice and a native administrator prompt.

## Failure and security considerations

An image that only exists on one computer is not distributable. A port mapping alone does not prove LAN reachability. The assistant verifies health with its generated certificate, then tests only the selected host LAN address and checks certificate hostname and fingerprint. That check from the hosting computer does not prove client-to-host reachability; a separate client check remains necessary. The certificate includes only localhost, loopback, and the selected LAN address.

A failed health check after service start leaves the service running for inspection. Select **Review settings and retry** or use `host.bat --logs` and `host.bat --stop` when the operator explicitly chooses those actions. Cancellation does not remove a started service or stop unrelated containers.

## Current verification

Normal release `v0.1.1` is published with `compose.yaml`, `WatchdogControlSetup.exe`, `host.bat`, `host.ps1`, the immutable image archive, the release manifest, and checksums. The prior v0.1.0 filename mismatch remains historical; v0.1.0 correctly contains `default.env.example`. The v0.1.1 local setup file completed its GUI quick-host flow, downloaded and started the released image, and returned HTTPS health HTTP 200 at the chosen host address. The setup window then exited unexpectedly during concurrent progress persistence; source now uses unique temporary files per write. The v0.1.2 package, cross-device client reachability, certificate import, host-agent installation, and GUI screenshots remain pending.
