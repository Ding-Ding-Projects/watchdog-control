# Controller HTTP API

## What it provides

The controller exposes a LAN-only HTTPS API for initial owner pairing, authenticated sessions, host-agent enrollment, host records, a fixed typed operation catalog, two-step power actions, operation results, and audit history. The API does not accept arbitrary shell text, caller-selected executables, or caller-selected file paths.

## Try the documented requests

Import the [complete API collection](https://ding-ding-projects.github.io/watchdog-control/api/watchdog-control.postman_collection.json). Set `baseUrl` to the HTTPS LAN address from the setup assistant. Verify and trust the certificate fingerprint before entering credentials. The collection uses the Postman cookie jar for owner sessions and bearer authorization for enrolled agents. Keep all one-time codes and credentials in a local private environment.

Read the [HTTP API wiki chapter](../wiki/api-reference.md) for route and authentication details. The collection is an example of the source-defined HTTP contract. It does not execute automatically and is not evidence that the current build accepted a request.

## Authorization and failure behavior

- Owner setup and login require HTTPS outside development. Pairing codes are single-use; login and pairing are rate-limited.
- Controller API requests are limited to loopback and private LAN address ranges.
- Owner session cookies are HttpOnly, Secure in production, SameSite Strict, and expire after eight hours. State-changing owner requests must carry a matching `Origin`.
- Agent enrollment and subsequent agent requests use separate bearer credentials. Revoked or unknown agents receive `401`.
- The server validates the host against a recent inventory snapshot before queueing an operation. Unsupported kinds and stale or absent targets are rejected.
- Restart and shutdown use a short-lived challenge bound to the requesting owner, target host, and exact confirmation phrase. The agent reports the eventual operation result; a dropped connection leaves the result unknown until queried.

## Current evidence

`build.bat` and `build-installer.bat` completed locally. No controller was installed or contacted, no agent was enrolled, and no host action was sent. Runtime security and LAN reachability remain unverified. See the [API collection documentation](../api/README.md) and [release state](deployment-recovery.md).
