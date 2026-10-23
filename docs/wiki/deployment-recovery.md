# Deployment and recovery

**Current state: Partial.** Normal release `v0.1.1` is published with `compose.yaml`, a matching Compose checksum in the release manifest, the immutable image archive, the portable setup file, host controls, and checksums. Its local one-click GUI flow started the service and returned HTTPS health HTTP 200. The setup window then exited during a concurrent progress-save collision, while the service stayed healthy. Source now gives each progress write a unique temporary file. The rebuilt `v0.1.2` package, current GUI screenshots, and access from a second LAN device remain pending.

The portable setup file embeds `compose.yaml` and verifies its SHA-256 against the selected release manifest. The welcome screen has a one-click hosting action for a ready local engine, available release, selected private LAN address, valid host port, and saved data folder. The setup application runs without installation. Quick hosting downloads the verified product image and writes this service's configuration and protected local files; it does not install the setup application, Docker Desktop, another runtime, or the optional Windows host agent. The full wizard still guides prerequisite setup and recovery. Double-clicking `host.bat` selects detached start by default after eight seconds; `--detached`, `--logs`, and `--stop` are also available.

Preserve existing data and configuration during updates. A port mapping is not proof of client LAN reachability; verify the full HTTPS URL from an intended LAN client after health succeeds on the host.

## Next chapters

- [System architecture](architecture.md)
- [Security and identity](security.md)
- [Restart and shutdown](power-actions.md)
