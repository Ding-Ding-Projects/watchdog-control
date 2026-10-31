# Slop Machine remote control

The dashboard can drive the `codex` command-line tool on a paired Windows computer. From the
**Slop Machine** page an owner can check the tool, assist a device-code sign-in, start and stop
remote control, create a phone pairing code, and sign the tool out.

## Workflow

1. Open **Slop Machine** and select the computer.
2. **Run status check.** The agent reports whether the tool was found, its version, whether it is
   signed in, whether device-code sign-in and remote control are available, and the remote control
   state.
3. **Start sign-in.** The agent starts device-code sign-in on the computer. The dashboard shows the
   sign-in page, the one-time code, and a countdown ring. Open the page on any device and enter the
   code. The computer keeps waiting for up to 15 minutes.
4. **Start remote control.** The agent runs `codex remote-control start`.
5. **Create pairing code.** The agent runs `codex remote-control pair --json` and the dashboard shows
   the manual pairing code. In the ChatGPT phone app, open Remote, choose **Enter code manually**,
   and confirm the account on the phone.
6. **Sign out** removes the saved sign-in on that computer after the exact typed phrase
   `SIGN OUT REMOTE AGENT ON <computer name>`.

## Operations

| Operation | Command run on the computer | Confirmation |
| --- | --- | --- |
| `codex.status` | `--version`, `login status`, `login --help`, `remote-control --help`, and `remote-control status` when offered | None |
| `codex.login.start` | `login --device-auth` (or `--device-code`, whichever the installed version offers) | None |
| `codex.login.cancel` | Ends the waiting sign-in process | None |
| `codex.logout` | `logout` | Exact typed phrase |
| `codex.remote.start` | `remote-control start` | None |
| `codex.remote.stop` | `remote-control stop` | None |
| `codex.remote.pair` | `remote-control pair --json` | None |

Arguments are fixed in the agent. The controller rejects a target value for these operations and
accepts at most three queued or running remote agent actions per computer.

## Which account runs the tool

By default the agent starts the tool as the Windows user signed in at the computer's console, so the
sign-in and any sessions belong to that user. The agent service account can be selected instead.
An administrator configures this in `codex.json` in the protected agent data folder
(`%ProgramData%\Ding-Ding-Projects\WatchdogControl`):

```json
{
  "enabled": true,
  "runAs": "interactive-user",
  "executablePath": null,
  "codexHome": null
}
```

- `runAs` is `interactive-user` or `service`.
- `executablePath` is an optional full path whose file name is `codex`, `codex.exe`, or `codex.cmd`.
  When it is empty, the agent searches the selected account's `PATH`, its npm folder, and its WinGet
  links folder.
- `codexHome` optionally sets `CODEX_HOME` for the tool.
- An invalid file turns the integration off until it is corrected.

## One-time codes

Sign-in and pairing codes are kept only in controller memory until they expire, at most 20 minutes.
The operation record, the audit log, exports, and the controller data file contain a redacted
placeholder instead. Restarting the controller clears any code still on screen. The **Open sign-in
page** link is only offered for `https` addresses on `openai.com` or `chatgpt.com`.

## Verification state

- A local end-to-end check against a development controller covered status, device-code sign-in,
  remote start, pairing, the typed sign-out phrase, rejected targets, rejected unknown actions, and
  confirmed that codes never reach the data file, audit log, or dashboard feed.
- Running the tool on a real Windows host, including the signed-in user launch path, has not been
  verified yet.
