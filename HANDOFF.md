# Handoff

## Current state

The public source repository `Ding-Ding-Projects/watchdog-control` has source `eee14898d840d4d0e5335cdff389727c179d3542` on local and GitHub `main`. The default branch is `main`, and the repository homepage is `https://ding-ding-projects.github.io/watchdog-control/`.

The committed source pins the .NET SDK and ASP.NET runtime images by digest and makes the publication-language workflow check out the pinned trusted policy from `Ding-Ding-Projects/agent-global-memory`. The current task has an uncommitted release-workflow correction: it removes a package-visibility API call that returned HTTP 404 and leaves the following credential-free pull as the public-access proof.

The product source includes an authenticated host dashboard and API, Windows host agent, typed operation catalog, tracked Compose setup, and tailored setup assistant. The product's GitHub release, published image, current-site verification, local service installation, Compose start, and LAN acceptance remain incomplete.

## Verified facts

- The exact root `build.bat` completed on the current working source with 0 warnings and 0 errors. No tests or lint were run.
- Docker Engine client and server both report version `29.9.2`.
- A local `linux/amd64` image build succeeded with the digest-pinned .NET images. It was loaded as `watchdog-control:working-tree` with manifest-list digest `sha256:e5cf4481446e9c167d1da5807f5cfc3277a2340c00f44aeded3227cd44f60e05`. It used `VCS_REF=working-tree` while changes were uncommitted, so it is not source-bound release evidence. No container was started.
- The previous build-and-publish run `39991432834` failed because the selected Debian ASP.NET image tag was unavailable. The Dockerfile now selects the verified `10.0.13-noble` image pinned by digest.
- The previous publication-language run `39991433190` failed because its trusted-source checkout targeted the consumer repository. The current working-tree fix names `Ding-Ding-Projects/agent-global-memory` and the pinned policy revision.
- The trusted local publication-language scan passed against the staged candidate: 134 text files, zero findings, and three reviewed technical-identifier observations. This verifies the current staged tree only; the workflow still needs to scan the preserved source and its history.
- The repository secret `PUBLICATION_LANGUAGE_DATA` and variable `PUBLICATION_SCAN_POLICY_SHA` are present. The policy pin is `75de4e59fcfe16e62cd193d77816879ddaec9068`. Organization-level token fallback presence is not independently verified; the next workflow run will establish whether the checkout credential works.
- The publication-language workflow run `39995857746` succeeded for source `eee14898d840d4d0e5335cdff389727c179d3542`, including trusted-source checkout and event-history scanning.
- The documentation deployment run `39995857859` succeeded for source `eee14898d840d4d0e5335cdff389727c179d3542`. The currently served content, internal routes, and assets have not been inspected.
- The image build and upload succeeded in run `39995857749`, but the package-visibility step returned HTTP 404. Anonymous pull, downloadable image archive, and release creation were skipped. The current workflow correction removes that undocumented mutation and relies on the anonymous pull step to verify public access. Rerun and readback remain pending; no normal release or verified public image exists.
- The exact root `build-installer.bat` produced `release/WatchdogControlSetup.exe` from source `eee14898d840d4d0e5335cdff389727c179d3542`: 68,076,793 bytes, SHA-256 `674277DC5A315596ED6D965042A1581CABEFEF2DE569E4A1F9F5414F6DBEB8D7`. It is a single self-contained file. The named hidden-desktop launch succeeded, but the genuine 1180 × 780 main-window capture was solid white; visual acceptance remains open.
- Source preservation, workflow results, and package visibility failure were posted to Issue #1 and Discussion #2. The correction and current evidence still need to be recorded there after the next workflow run.
- The hosted wiki endpoint was unavailable during earlier verification. Prepared wiki content remains in the source; hosted publication is not verified.
- Prior assistant captures were solid white. Visual acceptance remains incomplete. No product service has been installed or started, no Compose deployment has been run, and no host power action has been issued.
- GitHub Projects inspection is unavailable because the current CLI token lacks `read:project`. No tests or lint have been run.

## Remaining work

1. Review the release-workflow correction and project records, run the trusted local publication-language scan, then preserve the reviewed source on `main` and verify the GitHub ref.
2. Read back the new build-and-publish run. Require its anonymous pull to succeed before treating the registry image as public; then verify the normal release, immutable image digest, and downloadable image archive.
3. Verify the live documentation home, article, category, and wiki routes, assets, and exact repository homepage value.
4. Inspect a nonblank built setup assistant interface from the exact package, keeping installation and visual acceptance separate.
5. Use the published image and tracked Compose setup to verify a real pull, startup, health, authentication, and reachable private-LAN URL while preserving existing data and unrelated services.
6. Keep the earlier blank assistant captures as an unresolved visual-review gap until genuine current-source captures can be inspected.

Do not report local builds as publication, package installation, live documentation, LAN access, or host-operation verification.
