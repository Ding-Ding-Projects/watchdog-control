# Roadmap

## 1. Product workflows

- [ ] Inspect the built dashboard's host overview and supported management workflows.
- [ ] Verify typed service, process, event-log, storage, network, update, and firewall behavior on an authorized target.
- [ ] Verify shutdown and restart confirmation, audit records, and host-side operation results without initiating a local host power action.

## 2. One-click hosting and setup assistant

- [ ] Build the current concurrent progress-save fix through `build.bat`; the earlier 2026-10-23 result predates this change.
- [ ] Build and inspect the updated v0.1.2 single-file setup file; `compose.yaml` is already embedded and digest-checked in source.
- [x] Exercise the v0.1.1 one-click route with the ready local engine. It started only the Watchdog Control project, installed no software, and returned HTTPS health HTTP 200. The setup window then exited during concurrent progress persistence; a unique-temporary-file source fix is awaiting package verification.
- [ ] Verify guided recovery for unavailable Docker, ambiguous LAN interfaces, occupied ports, saved data locations, and interrupted setup.
- [ ] Capture and inspect genuine current screenshots for the welcome, host-settings, review, and completion states; keep sensitive pairing values out of captures. The earlier white capture is not current evidence.
- [ ] Verify the tailored one-file package on the supported Windows host and record any unavailable native evidence.
- [ ] Verify `host.bat` double-click default, `--detached`, `--logs`, and explicit `--stop` behavior.

## 3. Image, release, and live service

- [x] Publish and anonymously pull the immutable image for source `5d19bb463b624a60b38aae360f607572fa003b8a`, digest `sha256:8a652e9a5a5704a62abd7940131e5de84a0c2ba8019088f6f0637638b8808466`.
- [x] Publish and read back normal release `v0.1.1`. It targets source `1e39ae2647ab8959867f8050a340f0a3a1421cf4`, includes the corrected `default.env.example` name and `service.composeSha256`, and is neither draft nor prerelease.
- [ ] Publish and verify normal release `v0.1.2`, including the progress-save fix and every expected asset.
- [x] Verify the v0.1.1 embedded Compose checksum path through the real welcome-screen host action and verify the launched container's HTTPS health returned HTTP 200.
- [ ] Verify the v0.1.2 release checksum, bundled Compose bytes, downloadable image archive, and all release assets.
- [ ] Verify owner pairing, certificate import, and a real client connection from a second device through the intended private LAN URL.

## 4. Documentation and remaining acceptance

- [ ] Correct and reread the nine authored issue and Discussion comments found by the public-record audit; preserve the current review inventory and note any platform edit-history limit.
- [ ] Verify the deployed GitHub Pages home, articles, category routes, assets, and exact GitHub `homepage` value.
- [ ] Publish the prepared GitHub wiki pages when the wiki endpoint is available and read back every stored page and link.
- [ ] Refresh the README with inspected genuine captures from the final built dashboard and setup assistant.
- [ ] Complete the remaining product documentation, settings coverage, regex parity, accessibility, localization, appearance, security, and recovery acceptance items listed in the feature inventory.
- [ ] Run the requested automated tests after implementation and functional acceptance are complete.
