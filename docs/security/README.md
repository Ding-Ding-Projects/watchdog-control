# Security

Watchdog Control controls real host state, so every management action must be authenticated,
authorized on the server, bounded, audited, and tied to an identified host.

## Required controls

- Reject unauthenticated and cross-origin mutations.
- Do not accept shell text, executable paths, or arbitrary command arguments.
- Use a fixed operation catalog and strict schemas.
- Keep credentials and certificate material outside source control and redact them from logs.
- Require renewed authentication and a second explicit confirmation for shutdown and restart.
- Report an interrupted power action as unknown until a fresh host status query resolves it.

Pairing, certificate trust, identity recovery, and the supported Windows version matrix are
not implemented yet.
