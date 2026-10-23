# Feature workflows

The product source contains the dashboard, authenticated API, host agent, fixed operation catalog, and tailored WPF setup assistant. The exact root `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors. The exact root `build-installer.bat` also completed from source revision `f4850abe2a63605d2f25ee26b293489a3f235a27`; rebuild it from the final source before release. Local builds do not prove publication, an installed service, remote LAN access, or a host operation.

## Host information

- [Host health and freshness](host-health.md)
- [Services and processes](services-processes.md)
- [Event logs](event-logs.md)
- [Storage and network state](storage-network.md)
- [Updates and firewall state](updates-firewall.md)

## Safe operations

- [Typed operation catalog](operation-catalog.md)
- [Restart and shutdown](power-actions.md)
- [Authentication, pairing, and audit](identity-audit.md)
- [Deployment and recovery](deployment-recovery.md)
- [Automatic setup assistant](setup-assistant.md)

## Feature status

| Workflow | Source state | Current evidence |
| --- | --- | --- |
| Host health | Implemented in source | Root build succeeded; live host collection remains unverified. |
| Services and processes | Implemented in source | Typed views and host-agent paths exist; runtime actions remain unverified. |
| Event logs | Implemented in source | Bounded collection and dashboard records exist; runtime query remains unverified. |
| Storage and networking | Implemented in source | Host records and views exist; LAN installation and live values remain unverified. |
| Updates and firewall | Read-only source workflow | Status is collected and shown; remote mutation is intentionally unavailable. |
| Typed operation catalog | Implemented in source | Eight typed operations, current target validation, exact destructive-action confirmations, one-time power challenges, and audit writes are present; live enforcement remains unverified. |
| Restart and shutdown | Implemented in source | The API issues a short-lived challenge and exact confirmation; no host power operation was run during this work. |
| Authentication, pairing, and audit | Implemented in source | Pairing, sessions, revocation, and audit records exist; installed security behavior remains unverified. |
| Deployment and recovery | Implemented in source | Compose, host entrypoint, health flow, and setup source exist; release availability is reported on the documentation home and LAN runtime remains pending. |
| Automatic setup assistant | Current source build passed; package and runtime pending | `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors after adding the bundled Compose, quick-host action, and preservation-safe setup-file writes. The previous 68,076,800-byte package came from revision `f4850abe2a63605d2f25ee26b293489a3f235a27` and does not contain these changes. Build and inspect the current single-file package before release. |
| Controller HTTP API | Implemented in source | The complete Postman category/master collections cover 17 routes; no live request has been exercised. |

## HTTP API materials

The project has an HTTP API. Its routes are defined in `src/Watchdog.Web/Program.cs`, with request and response records in `src/Watchdog.Web/Contracts.cs`. The [API category guide and collection](../api/README.md) document authentication, pairing, host-agent enrollment, typed operations, and power confirmation. The master collection is [available for import](../../postman/watchdog-control.postman_collection.json). Do not use an example collection as runtime proof.

## Product acceptance still open

- Release and image availability are reported from verified release metadata on the documentation home.
- A host-side image pull through the tracked Compose file is still pending.
- The quick-host action requires a ready local Docker Engine; its real built workflow has not been driven yet.
- Existing differing setup files are not replaced without confirmation and verified local backups; the built replacement and recovery path have not been exercised yet.
- A remote container-hosted web app, health check, and LAN URL have not been verified.
- The real built dashboard and wizard have not been driven on the supported Windows host, and no current screenshots are available.
- The documentation site still has incomplete settings coverage and does not meet full RegexBuddy parity.
- Power, service, and process operations have not been exercised against a disposable or remote host.
