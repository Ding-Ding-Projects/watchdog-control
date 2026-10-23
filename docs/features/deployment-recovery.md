# Deployment and recovery

**Source state: implemented.** The Compose file, host entrypoint, Windows setup assistant, health flow, and recovery state exist in source. The root build succeeded locally on 2026-10-23. A public image, release, running service, and verified LAN URL remain pending.

## Deploy the named service

1. Confirm the published product release and its immutable image digest.
2. On the hosting Windows computer, run the portable setup assistant or use `host.bat` after Docker Engine and Compose are ready.
3. Confirm the local container context and select an active private LAN IPv4 address, an unused HTTPS port, and a persistent data folder.
4. Review the release tag and source revision before confirming setup.
5. Wait for image pull, configuration validation, service start, HTTPS health, and the local LAN URL check.
6. Verify the certificate fingerprint on each client before entering owner credentials.

The assistant and `host.bat` operate on the named `watchdog-control` Compose project. The published service port binds only to the selected private LAN address. They do not change the host firewall, remove other Compose projects, prune images or volumes, or delete existing service data. The assistant generates local TLS and pairing files and can optionally install the Windows host agent with separate consent.

## Automatic prerequisite setup and resume

When the local engine is absent, the assistant provisions Microsoft's stable App Installer package for the current user if WinGet is unavailable, verifies the published hashes and package identity, and launches the interactive Docker Desktop installation. Docker's license and first-run prompts remain user-controlled. Any required native elevation or computer restart is handled by the user. After a restart, reopen the portable assistant and select **Review settings and retry**. It reads the saved progress, checks the current engine and active LAN addresses, and continues from the saved destination without trusting a stale health result.

The complete procedure and failure table are in [Automatic setup assistant](setup-assistant.md).

## Configuration and permissions

The published Compose setup requires an image digest, host port, selected private LAN address, persistent data path, and local paths for TLS certificate, TLS password, pairing code, and optional host-agent enrollment code. Secret values are stored in host-only files, not committed source or public release metadata. The assistant never stores the owner password. The optional LocalSystem host agent requires an explicit choice and a native administrator prompt.

## Failure and security considerations

An image that only exists on one computer is not distributable. A port mapping alone does not prove LAN reachability. The assistant verifies health with its generated certificate, then tests only the selected host LAN address and checks certificate hostname and fingerprint. That check from the hosting computer does not prove client-to-host reachability; a separate client check remains necessary. The certificate includes only localhost, loopback, and the selected LAN address.

A failed health check after service start leaves the service running for inspection. Select **Review settings and retry** or use `host.bat --logs` and `host.bat --stop` when the operator explicitly chooses those actions. Cancellation does not remove a started service or stop unrelated containers.

## Current verification

The root product build is verified locally. No published image, release attachment, Compose pull, service health response, client-side LAN access, certificate import, or host-agent installation has been verified. Keep each as pending until its actual evidence exists.
