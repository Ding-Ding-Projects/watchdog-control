# Deployment and recovery

**Current state: Partial.** An immutable image and normal release `v0.1.0` are published. The earlier verifier expected `.env.example`, while the release correctly publishes `default.env.example`; its manifest also lacks `service.composeSha256`, which the embedded-Compose check now requires. The tracked Compose configuration and host entrypoint are available. Release `v0.1.1`, a running service, and verified client LAN access remain pending.

The portable setup assistant embeds `compose.yaml` and verifies its SHA-256 against the selected release manifest. The welcome screen has a one-click hosting action for a ready local Docker Engine, available release, selected private LAN address, valid host port, and saved data folder. The assistant runs without installation. Quick hosting downloads the verified product image and writes this service's configuration and protected local files; it does not install Docker Desktop, another runtime, or the optional Windows host agent. The full wizard still guides prerequisite setup and recovery. Double-clicking `host.bat` selects detached start by default after eight seconds; `--detached`, `--logs`, and `--stop` are also available.

Preserve existing data and configuration during updates. A port mapping is not proof of client LAN reachability; verify the full HTTPS URL from an intended LAN client after health succeeds on the host.

## Next chapters

- [System architecture](architecture.md)
- [Security and identity](security.md)
- [Restart and shutdown](power-actions.md)
