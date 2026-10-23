# Handoff

## Current state

The public source repository `Ding-Ding-Projects/watchdog-control` has a local `main` integration branch and two published task refs. GitHub still reports `ai/docs/20261023-public-documentation` as the default, and no `main` ref is published. Discussions are enabled and issue #1 tracks the requested product. Source is present for the controller, host agent, dashboard, container deployment, and a portable setup assistant. The exact root build entrypoint completed locally with 0 warnings and 0 errors. The setup assistant package has not been built.

## Verified facts

- The repository visibility is public.
- The GitHub Discussions setting is enabled.
- The local publication-language scan passed for 129 text files with zero findings. Three exact
  command lines use reviewed, SHA-256-bound technical-identifier exceptions.
- The current task source is staged locally. No new commit, GitHub `main` ref, release, or image
  publication exists for this task yet.
- The local Windows host has no Docker CLI in the current environment.
- Listed LAN container hosts did not provide a usable authenticated SSH route during this
  turn. No container was launched and no existing workload was changed.
- The GitHub Project CLI cannot list Projects because the current authentication lacks the
  read:project scope. Project work stopped at that limit.
- The private session status page is published separately from this public repository.
- The setup assistant obtains and verifies supported prerequisites, checks the release,
  prepares the selected private LAN binding, pulls the immutable image, starts only this
  service, and checks HTTPS health plus the selected LAN URL. Native administrator consent,
  package terms, first-run setup, and any required computer restart remain owner actions.
- The assistant package has not been built or read back. Product release publication, image
  availability, documentation deployment, About-homepage readback, and real LAN installation
  remain unverified.

## Remaining work

Preserve the reviewed source in a local commit, reconcile the intended public `main` destination,
then use the exact root `build-installer.bat` entrypoint and inspect its single-file output without
running an installation. Record package size and digest from the actual output. Do not run tests
or lint. Keep release publication and live installation pending until their required inputs and
supported container host are available.

## Next safe action

Build and review the source baseline locally. Keep host deployment pending until an approved
authenticated container-host route is available.
