# Controller, temporary access, and notifications in one image

The container image includes the authenticated controller and dashboard, a Node.js lifecycle supervisor, and `cloudflared`. Temporary public access and Discord notifications are opt-in. The Windows host management agent remains a separate installation on the Windows computer it manages. The Linux image does not provide Windows CMD; shell capability must be reported from the actual installed platform and tools.

## Start the controller

Keep using the immutable published image digest in `WATCHDOG_IMAGE`, the existing persistent data directory, TLS certificate/password files, pairing file, and enrollment file. Additionally set `WATCHDOG_TLS_CA_HOST_FILE` to the matching **public certificate** in DER or PEM format. It must cover `127.0.0.1`. The container converts that public certificate into a temporary PEM file without reading or exporting the private key.

```powershell
docker compose pull watchdog
docker compose up -d watchdog
docker compose ps watchdog
```

The image runs as the existing non-root application user. That user must be able to read the mounted files and write the persistent data directory. No Docker socket, host process namespace, privileged container mode, or host security-setting change is required. The mapped HTTPS port remains bound to the selected private LAN address.

## Choose one tunnel owner

For a container-owned temporary URL, set `WATCHDOG_TUNNEL_ENABLED=true` in the local `.env`, then recreate the service through Compose. Leave it `false` when the desktop setup assistant owns the tunnel. Running both produces two independent temporary URLs and duplicate notifications, so choose one owner.

The supervisor verifies local HTTPS health JSON, same-origin dashboard assets, and rejection of unauthenticated management requests. It applies the same checks to the temporary public URL before publishing it. It does not disable certificate or hostname verification. The controller's existing account authentication stays mandatory.

Read the current verified URL and phase from `docker compose logs watchdog` or the `hosting-status.json` file in the persistent data directory. Logs contain only bounded status fields and the verified public URL. A failed check clears the public URL immediately; a prior log entry is historical, not current reachability proof.

Quick Tunnels are intended for testing and development, have no uptime guarantee, and change hostname when recreated. They do not support Server-Sent Events. See the [official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). A healthy URL is never replaced merely because an assumed expiry interval passed.

## Enable Discord address notifications

Create a protected local file containing your webhook URL through your own credential-management route. Do not put its value in `.env`, commands, source, logs, or image layers. Set only its file **path** as `WATCHDOG_DISCORD_WEBHOOK_HOST_FILE`. Then explicitly add the notification override:

```powershell
docker compose -f compose.yaml -f container/compose.notifications.yaml pull watchdog
docker compose -f compose.yaml -f container/compose.notifications.yaml up -d watchdog
```

The override enables container-owned temporary access and mounts the webhook at `/run/secrets/watchdog_discord_webhook`. The notifier reads it only when sending. It accepts only the expected HTTPS Discord webhook address, disables mentions, rejects redirects, and sends only the verified temporary URL with a sign-in reminder. It never sends owner-pairing codes or webhook values. The base Compose configuration mounts no webhook file and sends no notifications.

To disable notifications, recreate the service using only `compose.yaml`. Set `WATCHDOG_TUNNEL_ENABLED=false` too when disabling temporary access. Existing controller data remains in its persistent directory.

## Recovery and stop behavior

The supervisor owns only the controller and tunnel children it launched. It attempts at most three controller restarts and six tunnel restarts per supervisor lifetime, with bounded exponential backoff. Three failed health observations trigger recovery of a still-running but unhealthy child. A new tunnel gets an initial verification window before replacement. Exhausted tunnel recovery leaves the local controller available with an attention status. Notification attempts are capped at three per URL; a successful delivery is not repeated when the same URL temporarily disconnects.

On container stop, the supervisor sends termination only to its owned children, waits up to five seconds, then uses forced termination for an owned child that has not exited. The Compose `restart: unless-stopped` setting remains unchanged. A container restart begins a new bounded supervisor lifetime; the local bounds are not a promise that Docker will stop restarting an unhealthy deployment.

## Versions, sources, and verification

The image retains the existing digest-pinned .NET build/runtime bases. Linux Node.js `24.22.1` and `cloudflared` `2026.10.7` are downloaded over HTTPS and checked against fixed SHA-256 values before extraction or installation. `container/tools.json` records the reviewed AMD64/ARM64 inventory. Node digests were read from the [official checksum manifest](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt); tunnel digests were read from the [official release assets](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7). The existing release workflow publishes `linux/amd64`; ARM64 download pins do not claim an ARM64 release exists.

Focused local checks cover opt-in defaults, credential source boundaries, certificate identity rejection, status-field filtering, notification delivery bounds, recovery limits, and packaging invariants. Source and unit checks are not container execution proof. Docker is unavailable on the current verification host, so image build, Compose pull/start, non-root mounted-file access, local/public endpoint verification, notification delivery, and container shutdown remain **unverified** until run on a supported Docker host. Publication and immutable-image availability are separate pending checks.
