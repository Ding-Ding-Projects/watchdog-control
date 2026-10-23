# Roadmap

## 1. Product workflows

- [ ] Inspect the built dashboard's host overview and supported management workflows.
- [ ] Verify typed service, process, event-log, storage, network, update, and firewall behavior on an authorized target.
- [ ] Verify shutdown and restart confirmation, audit records, and host-side operation results without initiating a local host power action.

## 2. One-click hosting and setup assistant

- [x] Build the current source through `build.bat`; completed on 2026-10-23 with 0 warnings and 0 errors.
- [ ] Build and inspect the updated single-file setup assistant after it embeds `compose.yaml`, verifies the release Compose digest, and exposes the one-click host action.
- [ ] Exercise the one-click route with a ready local Docker Engine, verify it does not install Docker or the optional host agent, and confirm that only the Watchdog Control Compose project starts.
- [ ] Verify guided recovery for unavailable Docker, ambiguous LAN interfaces, occupied ports, saved data locations, and interrupted setup.
- [ ] Capture and inspect current built-interface screenshots for the welcome, host-settings, review, and completion states; keep sensitive pairing values out of captures.
- [ ] Verify the tailored one-file package on the supported Windows host and record any unavailable native evidence.
- [ ] Verify `host.bat` double-click default, `--detached`, `--logs`, and explicit `--stop` behavior.

## 3. Image, release, and live service

- [x] Publish and anonymously pull the immutable image for source `5d19bb463b624a60b38aae360f607572fa003b8a`, digest `sha256:8a652e9a5a5704a62abd7940131e5de84a0c2ba8019088f6f0637638b8808466`.
- [ ] Publish and fully verify normal release `v0.1.1`. The published `v0.1.0` release is normal and includes `default.env.example`; the earlier verifier incorrectly expected `.env.example`. Its manifest lacks `service.composeSha256`, which the embedded-Compose assistant now requires.
- [ ] Verify the Compose checksum in the release manifest, matching bundled Compose bytes in the assistant, downloadable image archive, and all release assets.
- [ ] Start the published image through the tracked Compose setup, verify container health, certificate-pinned HTTPS, owner pairing, and a real client connection through the intended private LAN URL.

## 4. Documentation and remaining acceptance

- [ ] Verify the deployed GitHub Pages home, articles, category routes, assets, and exact GitHub `homepage` value.
- [ ] Publish the prepared GitHub wiki pages when the wiki endpoint is available and read back every stored page and link.
- [ ] Refresh the README with inspected genuine captures from the final built dashboard and setup assistant.
- [ ] Complete the remaining product documentation, settings coverage, regex parity, accessibility, localization, appearance, security, and recovery acceptance items listed in the feature inventory.
- [ ] Run the requested automated tests after implementation and functional acceptance are complete.
