# Architecture

Watchdog Control is planned as a browser dashboard, an authenticated API, and a narrowly
scoped Windows host agent. The API will accept documented operation identifiers and validated
parameters. The agent will execute only fixed host operations and return bounded results.

The final component boundaries, pairing protocol, credential storage, TLS setup, and
recovery behavior remain undecided and must be documented before implementation is treated as
ready.
