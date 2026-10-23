# System architecture

**State: Planned.** The intended architecture has three parts: a browser dashboard, an authenticated API, and a narrowly scoped host agent.

The API validates typed operations and permissions. The host agent performs only fixed operations. Arbitrary command text, executable selection, and caller-selected paths are outside the intended interface.

Pairing, TLS, API schemas, deployment topology, and operating-system support remain undecided. The current repository does not contain a runnable product implementation.

## Next chapters

- [Security and identity](security.md)
- [Typed operation catalog](operation-catalog.md)
- [Deployment and recovery](deployment-recovery.md)
