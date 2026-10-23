# Feature workflows

Every product workflow in this catalogue is **Planned** until a release and runtime check confirm it. This repository currently has no verified runnable product build. A guide describes the intended boundary; it is not a control or a release claim.

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

## Feature status

| Workflow | State | Evidence |
| --- | --- | --- |
| Host health | Planned | No product build or host data source is verified. |
| Services and processes | Planned | No bounded operation API or client view is verified. |
| Event logs | Planned | No endpoint, query limits, or redaction path is verified. |
| Storage and networking | Planned | No host collection or client rendering is verified. |
| Updates and firewall | Planned | No status source or mutation workflow is verified. |
| Typed operation catalog | Planned | API operation identifiers and schemas are not yet defined. |
| Restart and shutdown | Planned | Confirmation, authorization, audit, and runtime result flow are not implemented. |
| Authentication, pairing, and audit | Planned | Pairing, credentials, revocation, and audit storage are not implemented. |
| Deployment and recovery | Blocked | No published immutable image, host setup entrypoint, or runtime health proof is available. |

## HTTP API materials

There is no implemented HTTP API or published schema yet. Postman collections are not applicable until actual endpoints exist; inventing example routes would mislead readers. Add a category collection and a master collection once the API contract is defined.
