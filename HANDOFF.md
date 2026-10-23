# Handoff

## Current state

The public repository `Ding-Ding-Projects/watchdog-control` is on local and hosted `main` at `453c0a64aded8d96961af4b5618df4bb053f2414` before the current uncommitted changes. Normal release `v0.1.1` targets `1e39ae2647ab8959867f8050a340f0a3a1421cf4` and is neither draft nor prerelease.

The release asset `WatchdogControlSetup.exe` is 68,084,205 bytes with SHA-256 `f8154f0d6978c1b95175fab12ecfaa3bed378c94338205459f9bf4a36e2d3114`. It includes the bundled `compose.yaml` integrity check. On the current host, it launched without installation and its welcome-screen action pulled the verified image, wrote the service configuration, started only the Watchdog Control Compose project, and returned HTTPS health HTTP 200. The container remained healthy after the setup window exited on a concurrent write to `progress.json.tmp`.

The current source gives every progress save a unique temporary file before atomically replacing the destination. The version is set to `0.1.2`. A focused 32-writer concurrency check has been added but not run. The current source, new single-file package, post-fix GUI launch, and usable built-interface capture remain unverified. An earlier white capture was rejected and is not current evidence.

## Current evidence

- Normal release `v0.1.1` exists for source `1e39ae2647ab8959867f8050a340f0a3a1421cf4` with the expected setup file, Compose, host controls, image archive, manifest, and checksums.
- The released setup file completed the one-click host operation through its real welcome-screen button without installing software on a computer with an already-ready local engine.
- The service passed its local HTTPS health check with HTTP 200 and Docker reported the container healthy.
- The setup window crashed after hosting while concurrent progress writers contended for a shared temporary path. The source fix is present locally and still needs a rebuilt package and runtime confirmation.
- A read-only audit of current public records covered the open issue, its 17 comments, the progress Discussion and its 20 comments/replies, both releases, and the deployed documentation home with five same-origin assets. It found 16 wording findings across nine authored comments. Those comment bodies still need correction and exact readback before the public-record review can close.
- Cross-device LAN access, owner pairing, client certificate trust, agent enrollment, typed host operations, and native prerequisite installation remain unverified.
- Public documentation contains the v0.1.1 runtime result and labels the new fix and package as pending. The current screenshot and hosted documentation readback remain pending.
- Automated tests have not run; they remain reserved for after implementation and functional acceptance.

## Next actions

1. Finish the source and documentation review and run the publication-language scan.
2. Preserve the reviewed source and documentation on `main`, then run the exact root `build-installer.bat` entrypoint.
3. Launch the resulting single-file setup tool on a fresh named hidden desktop, inspect the actual window, and capture only genuine, readable pixels without authentication values.
4. Verify that saved progress loads and the setup window stays open after the already-running service is recognized. Do not start another container when the existing service is healthy.
5. Complete the requested local acceptance, then run the 32-writer concurrency check last. Update the final records from actual outputs.
6. Correct the nine authored public comments found by the read-only audit, reread their stored bodies, and record any platform edit-history limit.
7. push the final `main` state, verify `git ls-remote`, then read back the normal v0.1.2 release, assets, immutable image, and deployed documentation routes.

The current service remains running. No computer shutdown or restart was initiated. Preserve unrelated containers, volumes, files, authentication, and user configuration. Use only GitHub CLI for forge work and do not rewrite history.
