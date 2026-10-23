# Operations

## Current release state

There is no runnable product build or published container image yet. A setup guide will be
added after the Compose, host entrypoint, health checks, and tailored wizard exist.

## Container host

Deployment requires an authenticated Docker host, a published immutable image, a tracked
Compose file, an available host port, and a verified LAN route. None of those delivery checks
has passed yet.

## Recovery

No host operation has been executed by this project. If a later host action loses its
connection, query the host status before retrying and keep the outcome marked unknown until
the host confirms it.
