# Native hosting and temporary access

The current setup assistant supports native Windows hosting without Docker, with Compose retained as an explicit alternative. It stages the bundled controller and tools into a persistent versioned runtime, verifies HTTPS health and anonymous-access rejection, and can supervise a temporary Cloudflare address.

Protected Discord configuration can notify a verified new address. Current-user sign-in startup starts the monitor and selected service without changing operating-system sign-in or accepting elevation. Sixteen focused hosting checks and independent source review passed; packaged GUI, native runtime, public tunnel, startup and notification delivery remain pending at this checkpoint.

Read the complete [native hosting workflow](../features/native-hosting.md) for configuration, recovery, privacy and delivery state. [Terminal design issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3) remains a separate unfinished handoff.
