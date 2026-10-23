# Build and release dependency inventory

This inventory describes the exact jobs in `release.yml`, `pages.yml`, and
`publication-language.yml`. These workflows build, package, publish, or scan source;
they do not run tests or lint.

## `release.yml` Windows build job

| Dependency | Required version or route | Bootstrap and evidence |
| --- | --- | --- |
| Windows host and PowerShell | `windows-2025`, Windows PowerShell 5.1 | GitHub-hosted runner; the root batch entrypoints invoke the supported PowerShell scripts. |
| .NET SDK | `10.0.402`, x64, exact URL and SHA-512 in `build-tools.json` | `build.bat` downloads into the ignored `.tools` directory when missing and verifies the pinned archive before use. |
| Project SDK inputs | `global.json`, locked project files, `packages.lock.json` | `build-installer.bat` calls the root build entrypoint, which restores in locked mode. |
| GitHub artifact upload | `actions/upload-artifact` pinned by full action commit | Collects only the Windows agent and portable setup assistant, even after a failed build. |

## `release.yml` image job

| Dependency | Required version or route | Bootstrap and evidence |
| --- | --- | --- |
| Ubuntu host | `ubuntu-24.04` | GitHub-hosted runner. |
| Node.js | Major version 22 | Pinned `actions/setup-node` action. Used only for checked-in release tooling. |
| GitHub CLI | `2.103.0`, Linux x64 archive SHA-256 in `build-tools.json` | `scripts/bootstrap-gh-cli.mjs` checks the existing version, downloads from the official release when needed, verifies the pinned digest, and installs into the job-local directory. |
| Docker Buildx | Pinned `docker/setup-buildx-action` | Creates the isolated BuildKit builder required for `linux/amd64`. |
| GitHub Container Registry login | Workflow token with `packages: write` | Pinned login action. The package visibility operation uses `RELEASE_TOKEN`, then `ORG_TOKEN`, then the workflow token, without printing token values. |
| Docker image build and push | Pinned `docker/build-push-action` | Builds from the exact checked-out source. Main publishes a version tag and SHA tag, then exports the immutable digest as a release input. Other refs build locally without publishing. |
| SHA-256 and archive tools | Ubuntu core utilities and Docker CLI | Checks archive hashes, saves the digest-pinned image, and verifies anonymous registry retrieval before release preparation. |
| GitHub artifact upload | `actions/upload-artifact` pinned by full action commit | Collects the image tar and provenance text even when an earlier image step fails. |

## `release.yml` normal release job

| Dependency | Required version or route | Bootstrap and evidence |
| --- | --- | --- |
| Node.js | Major version 22 | Pinned setup action for manifest assembly and release readback. |
| GitHub CLI | `2.103.0`, verified against the public release asset digest | Same job-local bootstrap script as the image job. Release and asset operations use `RELEASE_TOKEN`, then `ORG_TOKEN`, then the workflow token. |
| GitHub artifact download | Pinned `actions/download-artifact` | Retrieves only outputs from the same run and source SHA. |
| GitHub release, immutable tag, downloadable assets | GitHub CLI | Creates a normal release only from `main`, then reads back tag ancestry, release classification, asset inventory, and downloaded bytes. |
| Safe output collection | Pinned `actions/upload-artifact` | Uploads release inputs and the verification receipt with `if: always()` and a bounded retention period. |

## Documentation and publication scans

`pages.yml` uses Ubuntu 24.04 plus commit-pinned checkout, Pages artifact, and deployment
actions. `publication-language.yml` uses Ubuntu 24.04, a pinned Node 22 setup action,
commit-pinned checkout, and the protected `PUBLICATION_LANGUAGE_DATA` input. It runs only the
authorized publication-language scan, not tests or lint. Missing inputs fail closed.
