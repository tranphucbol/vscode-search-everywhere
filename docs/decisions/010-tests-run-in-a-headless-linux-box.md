# 010: Tests run in a headless Linux box

Status: Accepted

## Decision

Agents and plan sessions run the suite and the local-testing driver in a Docker container that
draws on a virtual display: `npm run test:headless` for `npm test`, and
`SE start --headless` for the local-testing driver, after which every `SE` command of that instance
runs in the container through `docker exec`. The host's own `npm test` and `SE start` stay for a
person who wants to watch and for what only macOS shows.

The box (`scripts/headless/`):

- **Debian on the host's architecture** (`node:22-bookworm`, so arm64 on Apple silicon) with
  VS Code's Electron libraries, fonts and `en_US.UTF-8` in UTC.
- **Xvfb, with openbox.** `Xvfb :99` is a real X server; openbox gives the window focus as a
  desktop would, which keybindings and the quick pick need.
- **Root, so `--no-sandbox`.** Chromium's sandbox refuses root; the container is the sandbox.
  `src/test/runTest.ts` and `se.js` add the flag when they run as root, and `se.js` adds
  `--password-store=basic` on Linux, where no keyring is running.
- **The checkout mounted at `/work`; `node_modules` and `.vscode-test` in volumes of that
  checkout** (`se-box-<checkout hash>-*`). The box runs `npm ci` into its volume when
  `package-lock.json` changed and downloads the Linux VS Code once; the host's macOS
  `node_modules` (`fsevents`) and VS Code are never touched. A git worktree's common `.git` is
  mounted at its host path, so git works in the box.
- **Host folders at their host paths.** `SE start --headless --workspace <dir>` mounts the folder at
  the same path; screenshots land in the host's `$TMPDIR/se-shots`, mounted into the box.
- **Keys stay macOS keys.** The driver presses `Control` where a command says `Meta` when it runs
  on Linux, as VS Code binds the same commands there.

## Rationale

`npm test` and the local-testing driver open a VS Code window on the host: it takes focus, its
keystrokes go to whichever window is in front, and two sessions at once fight over the screen.
TableCraft hit the same problem with its Electron live tests and solved it with this box
(its decision 063); a container with its own X server isolates every run.

Linux under Xvfb is how CI already runs the suite (`xvfb-run -a npm test` on `ubuntu-latest`). A
macOS VM would keep the native chrome but costs a licence per host and minutes per boot.

## Consequences

- **Evidence is Linux evidence.** Fonts, the title bar and keybinding labels (`Ctrl+Alt+P` rather
  than `⌥⌘P`) differ from macOS; a check about macOS behaviour still runs on the host.
- **`dist/` is shared with the host.** The box compiles into the mounted checkout, so a host
  instance of the driver running from the same `dist/` sees the box's build.
- **The first run in a checkout takes about a minute** to install Linux `node_modules` and download
  VS Code; later runs reuse the volumes (`npm run test:headless` about 10 s on a warm box).
  `docker volume rm` of the checkout's `se-box-*` volumes resets them.
- **Docker is required**, and Docker Desktop's file sharing must include the checkout and
  `$TMPDIR` (it does by default).
