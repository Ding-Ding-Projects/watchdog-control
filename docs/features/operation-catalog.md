# Typed operation catalog

**State: Planned.** The final API operation identifiers and parameter schemas are not yet available.

## Intended behavior

Each operation should have a stable identifier, strict input schema, bounded execution, host and account authorization, and an explicit result state. The catalog should explain when an operation changes host state.

## Configuration and permissions

Supported operations, parameter bounds, role assignments, timeouts, and versioning are not implemented. The public interface must reject arbitrary shell text, executable selection, and caller-selected paths.

## Failure and security considerations

Validation must occur on the server even when the client checks input. Errors must not disclose internal paths, credentials, or request bodies. A lost response is not evidence that an operation failed or succeeded.

## Verification and next steps

No API or runtime verification exists. See [architecture](../architecture/README.md), [services and processes](services-processes.md), and [restart and shutdown](power-actions.md).
