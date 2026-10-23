# Roadmap

## 1. Product foundation

- [x] Create the public source repository.
- [x] Enable GitHub Discussions and open the implementation issue.
- [x] Define the host agent, authenticated API, pairing, and audit architecture in source.
- [ ] Verify the productive host overview and management workflows in the built dashboard.
- [x] Implement typed command actions and confirmed shutdown/restart; real host-action verification remains open.
- [ ] Verify the exact installer packaging entrypoint from the latest source state. The root `build.bat` completed with 0 warnings and 0 errors, and `build-installer.bat` produced a 68,076,793-byte single-file assistant from source `eee14898d840d4d0e5335cdff389727c179d3542`, SHA-256 `674277DC5A315596ED6D965042A1581CABEFEF2DE569E4A1F9F5414F6DBEB8D7`. A genuine hidden-desktop capture of its main window was solid white, so visual acceptance remains open.

## 2. container-hosted dashboard delivery

- [ ] Publish an immutable container image bound to source. The build-and-publish workflow uploaded the image for source `eee14898d840d4d0e5335cdff389727c179d3542`, but run `39995857749` failed at the package-visibility API step with HTTP 404 before its anonymous pull and release steps. The workflow now relies on the following anonymous pull as the public-access proof instead of calling the unsupported visibility endpoint; rerun and readback remain pending.
- [ ] Export the image as a downloadable file and attach it to each normal release.
- [x] Add tracked Compose configuration and host.bat with detached and log modes; supported-host runtime verification remains open.
- [ ] Complete the tailored single-file setup assistant package and inspect its built interface. The portable executable was rebuilt from source `eee14898d840d4d0e5335cdff389727c179d3542` and launched on the named hidden desktop, but its genuine 1180 × 780 window capture was solid white, so visual review remains pending.
- [ ] Verify the actual LAN URL, authentication, and host operation flow.

## 3. documentation website and release records

- [ ] Complete and verify task-led documentation with working internal navigation. The source now adds a release-verified installer link and contains the full typed-operation inventory; settings coverage and full RegexBuddy parity remain unfinished.
- [ ] Publish the updated documentation website through GitHub Pages and reverify the exact repository homepage. Deployment run `39995857859` succeeded for source `eee14898d840d4d0e5335cdff389727c179d3542`; live route, content, and asset verification remain pending.
- [ ] Verify the release download card against the actual published release, its installer hash, and the selected language mode.
- [x] Verify the publication-language workflow against preserved source. Run `39995857746` succeeded for `eee14898d840d4d0e5335cdff389727c179d3542` after checking out the pinned trusted policy source and scanning its event history.
- [ ] Prepare complete wiki content and publish it after wiki availability is verified.
- [ ] Refresh the README with genuine current screenshots from the built product.
- [ ] Complete source-bound build, security, runtime, and delivery evidence.
