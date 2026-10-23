# Deployment and recovery

**State: Blocked.** No published immutable image, usable host setup entrypoint, or verified LAN endpoint is available in the baseline.

## Intended behavior

Deployment is expected to use a published versioned image, tracked Compose configuration, and a host entrypoint that checks service health and reports a reachable URL. Those deliverables have not been verified.

## Configuration and permissions

No service port, storage path, environment schema, update route, or host-specific configuration is confirmed. Preserve existing host data and configuration when a future deployment is introduced.

## Failure and security considerations

An image that is local but unpublished is not distributable. A port mapping alone does not prove LAN reachability. Failed startup and health checks must be reported as failures with the actual exit result.

## Verification and next steps

The exact blockers are listed in the project handoff. Continue with [operations](../operations/README.md), [security](../security/README.md), and the [architecture guide](../architecture/README.md).
