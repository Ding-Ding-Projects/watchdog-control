# Restart and shutdown

**State: Planned.** No restart or shutdown operation is implemented or available.

## Intended behavior

The product plan requires a clear target and consequence, renewed authentication, a second explicit confirmation, an audit record, and a separately observed outcome.

## Configuration and permissions

Supported hosts, authorization roles, cancellation behavior, and the underlying operation mechanism remain undecided. This documentation site never dispatches a power action.

## Failure and security considerations

If the response is interrupted, show the outcome as unknown and query fresh host state before considering a retry. Never silently repeat a high-impact action.

## Verification and next steps

There is no product runtime to verify. See [security and identity](identity-audit.md), [typed operations](operation-catalog.md), and [recovery](deployment-recovery.md).
