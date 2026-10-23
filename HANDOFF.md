# Handoff

## Current state

The public source repository `Ding-Ding-Projects/watchdog-control` has local `main` at `f4850abe2a63605d2f25ee26b293489a3f235a27`. Two published task branches are merged into local `main`. The GitHub default is still `ai/docs/20261023-public-documentation`, and the `main` ref has not been published. The working tree contains the current task's release-timing, release-download, operation-documentation, and status updates; those edits are not yet committed.

The source contains the authenticated dashboard and API, Windows host agent, fixed typed operation catalog, container deployment files, and a portable setup assistant. The assistant package was built from an earlier source revision. The final source still needs a fresh build and package.

## Verified facts

- The exact root `build.bat` completed earlier with 0 warnings and 0 errors.
- The exact root `build-installer.bat` produced a 68,076,800-byte single-file assistant from source `f4850abe2a63605d2f25ee26b293489a3f235a27`, SHA-256 `8E7D297FF042D4B3C047391DAA7DBAD078BE02B8EAA4E9906BA793EC1ABCFB03`. The packaging change now preserves an existing package in ignored build output; rebuild from final source is required.
- The assistant launched on the named hidden-desktop route. Three inspected window captures were solid white, and UI Automation could not attach. Visual review is incomplete.
- A prior documentation deployment succeeded for an earlier source revision. The repository homepage field is set to `https://ding-ding-projects.github.io/watchdog-control/`. The updated page and its release download card still need deployment and live verification.
- The release workflow now includes publication-time timing notes, full asset readback, and a follow-up documentation deployment driven by the verified release receipt. No release or container image has been published yet.
- The project operation source and documentation now enumerate eight typed actions, current-target validation, exact confirmations for destructive operations, account-bound one-use power challenges, and audit records. No live host operation has been run.
- No product service has been installed or started, and no host power action has been issued.
- No tests or lint have been run, as requested. The GitHub Projects CLI lacks `read:project`; project inspection stopped there.

## Remaining work

1. Review all current changes and ensure the public-language scan passes.
2. Run the required root build and package entrypoints, then record the final package size and hash.
3. Configure the trusted publication scan inputs and publish local `main`; set and verify it as the GitHub default.
4. Resolve any workflow findings, then verify the normal release, its immutable image digest, all nine assets, release timing, and generated documentation download data.
5. Verify the updated live documentation and exact homepage field. Preserve the blank assistant captures as an unresolved visual-review gap.
6. Use the released image and tracked Compose or setup route, preserve existing data, and verify service health and the actual private-LAN URL. Keep installation, LAN client access, host actions, and assistant visual acceptance separate.

Do not report an unrun runtime, release, installation, or LAN check as verified.
