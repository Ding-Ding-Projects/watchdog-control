# Roadmap

## 1. Product foundation

- [x] Create the public source repository.
- [x] Enable GitHub Discussions and open the implementation issue.
- [x] Define the host agent, authenticated API, pairing, and audit architecture in source.
- [ ] Verify the productive host overview and management workflows in the built dashboard.
- [x] Implement typed command actions and confirmed shutdown/restart; real host-action verification remains open.
- [ ] Verify the exact installer packaging entrypoint from the latest source state. The root `build.bat` completed on the current working source with 0 warnings and 0 errors. Rebuild and verify the assistant package after the current changes are committed.

## 2. container-hosted dashboard delivery

- [ ] Publish an immutable container image bound to source. A local linux/amd64 image built successfully as `watchdog-control:working-tree` with manifest-list digest `sha256:e5cf4481446e9c167d1da5807f5cfc3277a2340c00f44aeded3227cd44f60e05`; it used `VCS_REF=working-tree` while source edits were uncommitted, so registry publication and release provenance remain unverified.
- [ ] Export the image as a downloadable file and attach it to each normal release.
- [x] Add tracked Compose configuration and host.bat with detached and log modes; supported-host runtime verification remains open.
- [ ] Complete the tailored single-file setup assistant package and inspect its built interface. A portable executable was built from an earlier source revision and launched, but the hidden-desktop window captures were solid white, so visual review remains pending. Rebuild from the final source commit.
- [ ] Verify the actual LAN URL, authentication, and host operation flow.

## 3. documentation website and release records

- [ ] Complete and verify task-led documentation with working internal navigation. The source now adds a release-verified installer link and contains the full typed-operation inventory; settings coverage and full RegexBuddy parity remain unfinished.
- [ ] Publish the updated documentation website through GitHub Pages and reverify the exact repository homepage. An earlier deployment succeeded and the homepage is set; updated release content still needs live verification.
- [ ] Verify the release download card against the actual published release, its installer hash, and the selected language mode.
- [ ] Verify the updated publication-language workflow. The trusted source checkout and .NET container base references are pinned in the working tree. The local scan passed against 134 text files with zero findings and three reviewed technical-identifier observations; a successful workflow run against the preserved source remains pending.
- [ ] Prepare complete wiki content and publish it after wiki availability is verified.
- [ ] Refresh the README with genuine current screenshots from the built product.
- [ ] Complete source-bound build, security, runtime, and delivery evidence.
