# Roadmap

## 1. Product foundation

- [x] Create the public source repository.
- [x] Enable GitHub Discussions and open the implementation issue.
- [x] Define the host agent, authenticated API, pairing, and audit architecture in source.
- [ ] Verify the productive host overview and management workflows in the built dashboard.
- [x] Implement typed command actions and confirmed shutdown/restart; real host-action verification remains open.
- [ ] Verify the exact installer packaging entrypoint from the latest source state. The exact root build entrypoint passed on 2026-10-23 with 0 warnings and 0 errors.

## 2. container-hosted dashboard delivery

- [ ] Publish an immutable container image bound to source.
- [ ] Export the image as a downloadable file and attach it to each normal release.
- [x] Add tracked Compose configuration and host.bat with detached and log modes; supported-host runtime verification remains open.
- [ ] Complete the tailored single-file setup assistant package and inspect its built interface. Root build passed; package and built-interface inspection remain pending.
- [ ] Verify the actual LAN URL, authentication, and host operation flow.

## 3. documentation website and release records

- [ ] Complete and verify task-led documentation with working internal navigation.
- [ ] Publish the documentation website through GitHub Pages and set the exact repository homepage.
- [ ] Prepare complete wiki content and publish it after wiki availability is verified.
- [ ] Refresh the README with genuine current screenshots from the built product.
- [ ] Complete source-bound build, security, runtime, and delivery evidence.
