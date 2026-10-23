# Handoff

## Current state

The public repository `Ding-Ding-Projects/watchdog-control` is on `main`. Its last verified source before the current changes was `5d19bb463b624a60b38aae360f607572fa003b8a`.

The immutable container image for that source is available at `ghcr.io/ding-ding-projects/watchdog-control@sha256:8a652e9a5a5704a62abd7940131e5de84a0c2ba8019088f6f0637638b8808466`; the release workflow completed an anonymous pull. Normal release `v0.1.0` targets the same source and publishes `default.env.example`. The earlier verifier expected `.env.example`, so that prior run stopped on a verifier filename mismatch. The release manifest also lacks `service.composeSha256`, which the updated assistant needs to verify its embedded Compose file. A new normal release `v0.1.1` is required for that contract; the earlier release remains immutable.

Current source changes prepare the corrected asset name, add a Compose SHA-256 to the release manifest, embed `compose.yaml` in the setup assistant, add a one-click local hosting action, and make double-clicking `host.bat` default to starting the service after an eight-second menu timeout. The new assistant path requires an already-ready local Docker Engine and does not install Docker or the optional host agent.

The current root `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors for the latest source. The updated single-file assistant has not yet been built or inspected. No product container has been started. The earlier setup assistant capture was blank and remains historical, not current UI evidence.

## Verified release evidence

- Release workflow run `39997342016` built the Windows delivery, published the immutable image, verified an anonymous image pull, and created normal release `v0.1.0` for source `5d19bb463b624a60b38aae360f607572fa003b8a`.
- Published image digest: `sha256:8a652e9a5a5704a62abd7940131e5de84a0c2ba8019088f6f0637638b8808466`.
- The earlier full release verifier stopped because it expected `.env.example`; readback of the published asset list confirms the actual `default.env.example` name. The published `v0.1.0` manifest has no `service.composeSha256`, so it cannot satisfy the updated assistant's embedded-Compose check. Full `v0.1.1` release readback remains pending.
- Documentation deployment run `39997341634` succeeded for `5d19bb4`, but the live home, internal routes, assets, download link, and stored homepage still need readback.
- Publication-language run `39997341659` succeeded for source `5d19bb4`.
- Issue #1 and rolling Discussion #2 track the current work: https://github.com/Ding-Ding-Projects/watchdog-control/issues/1 and https://github.com/Ding-Ding-Projects/watchdog-control/discussions/2.

## Next work

1. Finish source and documentation review, then scan public-bound files for private vocabulary.
2. Preserve the reviewed changes on `main` and verify the GitHub ref before building.
3. Run the exact root build and packaging entrypoints, then inspect the real built assistant on the named hidden desktop. Capture genuine current screenshots with no pairing code or other sensitive values visible.
4. Verify quick-host behavior, `host.bat` modes, release asset names, Compose digest matching, and the new `v0.1.1` release from GitHub readback.
5. Verify deployed GitHub Pages routes and release download, then perform the authorized real container startup, authentication, health, and client-side LAN checks while preserving unrelated host state.
6. Run automated tests last, after implementation and functional acceptance. Keep every not-yet-run test explicitly pending.

## Boundaries

The local host power state is never changed. Product shutdown and restart verification must use a separate authorized target. Preserve unrelated containers, volumes, data, credentials, and user configuration. A source build, release publication, server-side health response, LAN mapping, and client-side reachability are distinct evidence claims.
