# Handoff

## Current state

The public source repository `Ding-Ding-Projects/watchdog-control` is on local `main` at `29a57386d268a2edeba8d9af3d894abb45477c21`, matching the GitHub `main` ref at the last readback. GitHub lists `main` as its default branch and the repository homepage as `https://ding-ding-projects.github.io/watchdog-control/`.

The current task has two source changes in the working tree: the Dockerfile now pins the .NET SDK and ASP.NET runtime images by digest, and the publication-language workflow checks out the pinned trusted policy from `Ding-Ding-Projects/agent-global-memory` with the existing protected-token fallback chain. These changes have not yet been committed.

The product source includes an authenticated host dashboard and API, Windows host agent, typed operation catalog, tracked Compose setup, and tailored setup assistant. The product's GitHub release, published image, current-site verification, local service installation, Compose start, and LAN acceptance remain incomplete.

## Verified facts

- The exact root `build.bat` completed on the current working source with 0 warnings and 0 errors. No tests or lint were run.
- Docker Engine client and server both report version `29.9.2`.
- A local `linux/amd64` image build succeeded with the digest-pinned .NET images. It was loaded as `watchdog-control:working-tree` with manifest-list digest `sha256:e5cf4481446e9c167d1da5807f5cfc3277a2340c00f44aeded3227cd44f60e05`. It used `VCS_REF=working-tree` while changes were uncommitted, so it is not source-bound release evidence. No container was started.
- The previous build-and-publish run `39991432834` failed because the selected Debian ASP.NET image tag was unavailable. The Dockerfile now selects the verified `10.0.13-noble` image pinned by digest.
- The previous publication-language run `39991433190` failed because its trusted-source checkout targeted the consumer repository. The current working-tree fix names `Ding-Ding-Projects/agent-global-memory` and the pinned policy revision.
- The trusted local publication-language scan passed against the staged candidate: 134 text files, zero findings, and three reviewed technical-identifier observations. This verifies the current staged tree only; the workflow still needs to scan the preserved source and its history.
- The repository secret `PUBLICATION_LANGUAGE_DATA` and variable `PUBLICATION_SCAN_POLICY_SHA` are present. The policy pin is `75de4e59fcfe16e62cd193d77816879ddaec9068`. Organization-level token fallback presence is not independently verified; the next workflow run will establish whether the checkout credential works.
- The exact root build and image-build results, and the two workflow fixes, were posted to Issue #1 and Discussion #2. No normal release or published container image exists.
- The documentation deployment run `39991432788` succeeded for source `29a57386d268a2edeba8d9af3d894abb45477c21`. The homepage value matches the expected URL, but the currently served content, internal routes, and assets have not been inspected.
- The hosted wiki endpoint was unavailable during earlier verification. Prepared wiki content remains in the source; hosted publication is not verified.
- Prior assistant captures were solid white. Visual acceptance remains incomplete. No product service has been installed or started, no Compose deployment has been run, and no host power action has been issued.
- GitHub Projects inspection is unavailable because the current CLI token lacks `read:project`. No tests or lint have been run.

## Remaining work

1. Review the full source and documentation diff, stage the task-owned files, and run the trusted local publication-language scan.
2. Preserve the reviewed source on `main` and verify the GitHub ref.
3. Run the exact root `build-installer.bat` from the preserved source, inspect the Squirrel package and portable assistant, and retain separate package and runtime evidence.
4. Inspect the new workflow runs, fix any source-bound workflow failures, and verify a normal release with the immutable container image and downloadable image archive.
5. Verify the live documentation home, article, category, and wiki routes, assets, and exact repository homepage value.
6. Use the published image and tracked Compose setup to verify a real pull, startup, health, authentication, and reachable private-LAN URL while preserving existing data and unrelated services.
7. Keep the earlier blank assistant captures as an unresolved visual-review gap until genuine current-source captures can be inspected.

Do not report local builds as publication, package installation, live documentation, LAN access, or host-operation verification.
