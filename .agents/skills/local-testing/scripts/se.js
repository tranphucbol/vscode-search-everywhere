#!/usr/bin/env node
// Drives a development VS Code running this extension. Run without arguments for usage.
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const { writeSample, initGit, DEFAULT_BIG_MODULES } = require("./make-sample");

const REPO = path.resolve(__dirname, "../../../..");
const { chromium } = require(require.resolve("playwright-core", { paths: [REPO] }));

const USAGE = `usage: node se.js <command> [options]

  start [--big [N]] [--git] [--setting key=value]... [--workspace <dir>] [--no-compile] [--no-activate]
        compile, write the acme-shop sample, launch VS Code with the extension
        under development, open Search Everywhere once and wait for the first index
  restart [--no-compile] [--no-activate] [--workspace <dir>]
        recompile and relaunch the same instance, keeping its profile, settings, caches
        and workspace (needed after every source change: VS Code runs dist/);
        --workspace reopens the same profile on another folder (shared worktree cache)
  search "<query>" [--file]   open Search Everywhere (or Search in Current File), type, list rows
  type "<text>"               replace the text of the open quick pick, list rows
  key <key>...                press keys (Playwright names: Enter, Alt+ArrowRight, Meta+Enter)
  text "<text>"               type text into whatever has focus (an editor, a simple dialog)
  open <relative path>        open a workspace file through Quick Open
  command "<palette title>"   run a command palette entry, e.g. "Search everywhere: Reload"
  set key=value...            change user settings in the running instance
  state                       editors, cursor, quick pick, notifications, status bar
  log [--exthost] [--all]     the "Search everywhere" output channel (or the extension host log)
  shot [label]                save a screenshot and print its path
  stop [--keep]               close VS Code and delete the profile and sample

  --id <name>  run several instances side by side (default "lt", or $SE_ID)`;

const BASE_SETTINGS = {
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "window.commandCenter": false,
  "window.restoreWindows": "none",
  "chat.commandCenter.enabled": false,
  "chat.disableAIFeatures": true,
  "security.workspace.trust.enabled": false,
  "extensions.ignoreRecommendations": true,
  "extensions.autoCheckUpdates": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "editor.minimap.enabled": false,
  "git.enabled": false,
  // Native dialogs are outside the page; simple dialogs are quick inputs the driver can type into.
  "files.simpleDialog.enable": true,
  "window.dialogStyle": "custom",
  "files.enableTrash": false,
  "window.confirmBeforeClose": "never",
  "searchEverywhere.shouldInitOnStartup": true,
  "searchEverywhere.shouldWorkspaceDataBeCached": false,
  "searchEverywhere.shareCacheAcrossWorktrees": false,
};

const QUICK_INPUT = ".quick-input-widget";

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    const takesValue = ["id", "setting", "workspace", "big"].includes(name);
    if (!takesValue || next === undefined || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    if (name === "big" && !/^\d+$/.test(next)) {
      flags[name] = true;
      continue;
    }
    if (name === "setting") {
      (flags.setting = flags.setting || []).push(next);
    } else {
      flags[name] = next;
    }
    i++;
  }
  return { positional, flags };
}

function paths(id) {
  // VS Code puts its IPC socket in the user-data dir, and macOS caps socket paths at 103 bytes,
  // so the profile has to live under a short path such as /tmp.
  const root = path.join("/tmp", `se-${id}`);
  return {
    root,
    state: path.join(root, "state.json"),
    userDir: path.join(root, "user-data"),
    extensionsDir: path.join(root, "extensions"),
    settings: path.join(root, "user-data", "User", "settings.json"),
    sample: path.join(root, "acme-shop"),
    console: path.join(root, "code.log"),
    shots: path.join(os.tmpdir(), "se-shots"),
  };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState(p) {
  if (!fs.existsSync(p.state)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(p.state, "utf8"));
}

function requireState(p) {
  const state = readState(p);
  if (!state || !isAlive(state.pid)) {
    throw new Error(`no running instance for ${p.root}; run "node se.js start" first`);
  }
  return state;
}

function parseSetting(entry) {
  const index = entry.indexOf("=");
  if (index === -1) {
    throw new Error(`setting "${entry}" must look like key=value`);
  }
  const key = entry.slice(0, index);
  const raw = entry.slice(index + 1);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  return [key.includes(".") ? key : `searchEverywhere.${key}`, value];
}

function findExecutable() {
  if (process.env.VSCODE_EXECUTABLE) {
    return process.env.VSCODE_EXECUTABLE;
  }
  const app = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
  if (fs.existsSync(app)) {
    return app;
  }
  const testDir = path.join(REPO, ".vscode-test");
  const builds = fs.existsSync(testDir)
    ? fs
        .readdirSync(testDir)
        .filter((name) => name.startsWith("vscode-"))
        .map((name) => path.join(testDir, name, "Visual Studio Code.app", "Contents", "MacOS", "Code"))
        .filter((exe) => fs.existsSync(exe))
        .sort()
    : [];
  if (builds.length) {
    return builds[builds.length - 1];
  }
  throw new Error("VS Code not found: set VSCODE_EXECUTABLE or run npm test once to download a build");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cdpReady(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/json/version", timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function connect(state, { timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout;
  while (!(await cdpReady(state.port))) {
    if (Date.now() > deadline || !isAlive(state.pid)) {
      throw new Error(`VS Code did not open its debugging port; see ${paths(state.id).console}`);
    }
    await sleep(300);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`);
  let page;
  while (!page) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().includes("workbench"));
    if (!page) {
      if (Date.now() > deadline) {
        throw new Error("the VS Code workbench window did not appear");
      }
      await sleep(300);
    }
  }
  await page.waitForSelector(".monaco-workbench", { timeout: Math.max(deadline - Date.now(), 1000) });
  await page.bringToFront();
  return { browser, page };
}

function findLog(p, suffix) {
  const logsDir = path.join(p.userDir, "logs");
  if (!fs.existsSync(logsDir)) {
    return undefined;
  }
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(suffix)) {
        found.push(full);
      }
    }
  };
  walk(logsDir);
  return found.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).pop();
}

const outputLog = (p) => findLog(p, "-Search everywhere.log");
const SCAN_DONE = /Workspace scan completed.*$/gm;

function scanLines(p) {
  const file = outputLog(p);
  return file ? fs.readFileSync(file, "utf8").match(SCAN_DONE) || [] : [];
}

async function waitForScan(p, previousCount, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const lines = scanLines(p);
    if (lines.length > previousCount) {
      return lines[lines.length - 1];
    }
    if (Date.now() > deadline) {
      throw new Error(`indexing did not finish within ${timeout / 1000}s; check "node se.js log" and "log --exthost"`);
    }
    await sleep(500);
  }
}

async function quickInputOpen(page) {
  return page.evaluate((selector) => {
    const widget = document.querySelector(selector);
    return !!widget && widget.style.display !== "none" && widget.offsetHeight > 0;
  }, QUICK_INPUT);
}

async function readQuickInput(page) {
  return page.evaluate((selector) => {
    const widget = document.querySelector(selector);
    if (!widget || widget.style.display === "none" || widget.offsetHeight === 0) {
      return undefined;
    }
    // Rows are recycled, so hidden parts of a row can still hold an earlier item's text.
    const visible = (element) => element.getClientRects().length > 0;
    const text = (root, query) => {
      const element = [...root.querySelectorAll(query)].find(visible);
      return element ? element.textContent.trim() : "";
    };
    const input = widget.querySelector(".quick-input-box input");
    const progress = widget.querySelector(".monaco-progress-container");
    const titleButtons = [...widget.querySelectorAll(".quick-input-titlebar .action-label")]
      .map((button) => button.getAttribute("aria-label") || button.title)
      .filter(Boolean);
    const rows = [...widget.querySelectorAll(".quick-input-list .monaco-list-row")]
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
      .map((row) => {
        const iconClasses = [...row.querySelectorAll(".quick-input-list-icon, .codicon, .monaco-icon-label")]
          .filter((element) => !element.closest(".quick-input-list-entry-action-bar"))
          .flatMap((element) => [...element.classList]);
        const codicon = iconClasses.find((name) => /^codicon-/.test(name) && name !== "codicon-modifier");
        const themeIcon = iconClasses.includes("file-icon") &&
          iconClasses.find((name) => /-lang-file-icon$/.test(name));
        const icon = codicon || (themeIcon ? `file-icon-theme:${themeIcon.replace(/-lang-file-icon$/, "")}` : "");
        return {
          index: Number(row.dataset.index),
          label: text(row, ".quick-input-list-label .label-name") || text(row, ".label-name"),
          description: text(row, ".quick-input-list-label .label-description"),
          detail: text(row, ".quick-input-list-label-meta .label-name"),
          separator: text(row, ".quick-input-list-separator"),
          focused: row.classList.contains("focused"),
          icon: icon.replace(/^codicon-/, ""),
          buttons: [...row.querySelectorAll(".quick-input-list-entry-action-bar .action-label")]
            .map((button) => button.getAttribute("aria-label") || button.title)
            .filter(Boolean),
        };
      });
    return {
      title: text(widget, ".quick-input-title"),
      value: input ? input.value : "",
      placeholder: input ? input.getAttribute("placeholder") || "" : "",
      busy: !!progress && progress.classList.contains("active") && progress.offsetHeight > 0,
      message: text(widget, ".quick-input-message"),
      titleButtons,
      rows,
    };
  }, QUICK_INPUT);
}

async function settle(page, { minimum = 400, timeout = 15000 } = {}) {
  const started = Date.now();
  let previous;
  let stableSince = Date.now();
  for (;;) {
    const current = await readQuickInput(page);
    const signature = JSON.stringify(current && { busy: current.busy, rows: current.rows });
    if (signature !== previous) {
      previous = signature;
      stableSince = Date.now();
    }
    const elapsed = Date.now() - started;
    if (elapsed >= minimum && Date.now() - stableSince >= 450 && !(current && current.busy)) {
      return current;
    }
    if (elapsed > timeout) {
      return current;
    }
    await sleep(100);
  }
}

function printQuickInput(view) {
  if (!view) {
    console.log("quick pick: closed");
    return;
  }
  const header = [`quick pick: "${view.value}"`];
  if (view.title) {
    header.push(`title: ${view.title}`);
  }
  if (view.titleButtons.length) {
    header.push(`buttons: ${view.titleButtons.join(", ")}`);
  }
  console.log(header.join(" | "));
  if (view.message) {
    console.log(`message: ${view.message}`);
  }
  if (!view.rows.length) {
    console.log("  (no rows)");
    return;
  }
  for (const row of view.rows) {
    if (row.separator) {
      console.log(`  -- ${row.separator} --`);
    }
    const parts = [`${row.focused ? ">" : " "} ${String(row.index + 1).padStart(2)}. ${row.label}`];
    if (row.description) {
      parts.push(`  ${row.description}`);
    }
    if (row.icon) {
      parts.push(`  [${row.icon}]`);
    }
    console.log(parts.join(""));
    if (row.detail) {
      console.log(`        ${row.detail}`);
    }
    if (row.buttons.length && row.focused) {
      console.log(`        buttons: ${row.buttons.join(", ")}`);
    }
  }
  console.log("  (only rendered rows are listed; scroll with key PageDown for more)");
}

async function readWorkbench(page) {
  return page.evaluate(() => {
    const text = (element) => (element ? element.textContent.replace(/\s+/g, " ").trim() : "");
    const groups = [...document.querySelectorAll(".editor-group-container")].map((group) => ({
      active: group.classList.contains("active"),
      tabs: [...group.querySelectorAll(".tab")].map((tab) => ({
        name: text(tab.querySelector(".label-name")),
        title: tab.getAttribute("title") || tab.getAttribute("aria-label") || "",
        active: tab.classList.contains("active"),
      })),
    }));
    const statusItems = [...document.querySelectorAll(".statusbar-item")]
      .map((item) => ({ id: item.id, text: text(item) }))
      .filter((item) => item.text);
    const toasts = [...document.querySelectorAll(".notification-toast .notification-list-item")].map((item) =>
      text(item.querySelector(".notification-list-item-message"))
    );
    const dialogs = [...document.querySelectorAll(".monaco-dialog-box")].map((box) => ({
      message: text(box.querySelector(".dialog-message-text")),
      detail: text(box.querySelector(".dialog-message-detail")),
      buttons: [...box.querySelectorAll(".dialog-buttons .monaco-button")].map(text),
    }));
    return { groups, statusItems, toasts, dialogs };
  });
}

function printWorkbench(view) {
  const groups = view.groups.filter((group) => group.tabs.length);
  console.log(`editor groups: ${groups.length}`);
  groups.forEach((group, index) => {
    const tabs = group.tabs.map((tab) => (tab.active ? `[${tab.name}]` : tab.name)).join("  ");
    console.log(`  ${group.active ? ">" : " "} group ${index + 1}: ${tabs}`);
  });
  const selection = view.statusItems.find((item) => item.id === "status.editor.selection");
  console.log(`cursor: ${selection ? selection.text : "(no active text editor)"}`);
  view.dialogs.forEach((dialog) =>
    console.log(`dialog: ${dialog.message} ${dialog.detail} | buttons: ${dialog.buttons.join(", ")}`)
  );
  console.log(`toasts: ${view.toasts.length ? "" : "(none)"}`);
  view.toasts.forEach((toast) => console.log(`  - ${toast}`));
  const interesting = view.statusItems.filter((item) => item.id !== "status.editor.selection");
  console.log(`status bar: ${interesting.map((item) => item.text).join(" | ")}`);
}

async function openQuickInput(page, key, { attempts = 1 } = {}) {
  if (await quickInputOpen(page)) {
    await page.keyboard.press("Escape");
    await sleep(200);
  }
  for (let attempt = 1; ; attempt++) {
    await page.keyboard.press(key);
    try {
      await page.waitForFunction(
        (selector) => !!document.activeElement && !!document.activeElement.closest(selector),
        QUICK_INPUT,
        { timeout: attempt < attempts ? 3000 : 10000 }
      );
      break;
    } catch (error) {
      if (attempt >= attempts) {
        throw new Error(`${key} did not open a quick pick; is the window still loading?`);
      }
    }
  }
  // The extension fills the input (selection, previous query) just after the picker shows;
  // typing before that loses the first characters.
  await sleep(400);
}

async function replaceText(page, value) {
  await page.keyboard.press("Meta+A");
  if (value) {
    await page.keyboard.type(value, { delay: 30 });
  } else {
    await page.keyboard.press("Backspace");
  }
}

function compile() {
  try {
    execFileSync("npm", ["run", "compile"], { cwd: REPO, stdio: "pipe" });
  } catch (error) {
    process.stdout.write(error.stdout || "");
    throw new Error("npm run compile failed");
  }
  console.log("compiled dist/");
}

async function launch(p, workspace) {
  const executable = findExecutable();
  const port = await freePort();
  const out = fs.openSync(p.console, "a");
  const env = { ...process.env, VSCODE_SKIP_PRELAUNCH: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      workspace,
      `--extensionDevelopmentPath=${REPO}`,
      `--user-data-dir=${p.userDir}`,
      `--extensions-dir=${p.extensionsDir}`,
      `--remote-debugging-port=${port}`,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-telemetry",
      "--new-window",
    ],
    { detached: true, stdio: ["ignore", out, out], env }
  );
  child.unref();
  const state = { id: p.id, pid: child.pid, port, workspace, executable, startedAt: new Date().toISOString() };
  fs.writeFileSync(p.state, JSON.stringify(state, null, 2));
  console.log(`VS Code: ${executable} (pid ${child.pid}, debugging port ${port})`);

  const { browser, page } = await connect(state);
  try {
    const cdp = await browser.newBrowserCDPSession();
    const target = await page.context().newCDPSession(page);
    const { targetInfo } = await target.send("Target.getTargetInfo");
    const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId: targetInfo.targetId });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1280, height: 800 } });
  } catch {
    // Window sizing is cosmetic; some builds do not expose the Browser domain.
  }
  console.log("workbench ready");
  return page;
}

async function activate(p, page, flags) {
  if (flags["no-activate"]) {
    console.log(
      "not waiting for the index: the extension activates once startup finishes and indexes then only with shouldInitOnStartup"
    );
    return;
  }
  // Opening the quick pick indexes even with shouldInitOnStartup off, so every start ends ready.
  // Keybindings are ignored until the workbench finishes restoring, so keep pressing.
  await openQuickInput(page, "Alt+Meta+P", { attempts: 20 });
  const deadline = Date.now() + 180000;
  let activatedAt;
  for (;;) {
    const file = outputLog(p);
    const log = file ? fs.readFileSync(file, "utf8") : "";
    const scans = log.match(SCAN_DONE) || [];
    if (scans.length) {
      console.log(`index ready: ${scans[scans.length - 1]}`);
      break;
    }
    if (/has been activated/.test(log)) {
      activatedAt = activatedAt || Date.now();
      // A cached index loads without a rebuild, so no scan line is ever written.
      if (!/type: Rebuild/.test(log) && Date.now() - activatedAt > 5000) {
        console.log("index ready: loaded from cache (no rebuild ran)");
        break;
      }
    }
    if (Date.now() > deadline) {
      throw new Error('indexing did not finish within 180s; check "node se.js log" and "log --exthost"');
    }
    await sleep(500);
  }
  await page.keyboard.press("Escape");
}

async function stopProcess(state) {
  if (!state || !isAlive(state.pid)) {
    return false;
  }
  // Quitting through the workbench lets VS Code flush workspaceState, where the cached index
  // lives; a signal kills the extension host before it persists.
  try {
    const { page } = await connect(state, { timeout: 5000 });
    await page.keyboard.press("Meta+Q");
    const quitDeadline = Date.now() + 15000;
    while (isAlive(state.pid) && Date.now() < quitDeadline) {
      await sleep(200);
    }
  } catch {
    // Fall through to signals when the window no longer answers.
  }
  if (!isAlive(state.pid)) {
    return true;
  }
  console.log("VS Code did not quit (an unsaved file or a dialog?); killing it");
  try {
    process.kill(-state.pid, "SIGTERM");
  } catch {
    process.kill(state.pid, "SIGTERM");
  }
  const deadline = Date.now() + 10000;
  while (isAlive(state.pid) && Date.now() < deadline) {
    await sleep(200);
  }
  if (isAlive(state.pid)) {
    process.kill(state.pid, "SIGKILL");
  }
  return true;
}

const commands = {
  async start(p, { flags }) {
    const existing = readState(p);
    if (existing && isAlive(existing.pid)) {
      throw new Error(`instance "${existing.id}" is already running (pid ${existing.pid}); run "node se.js stop" first`);
    }
    fs.rmSync(p.root, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(p.settings), { recursive: true });
    if (!flags["no-compile"]) {
      compile();
    }

    let workspace = flags.workspace && path.resolve(flags.workspace);
    if (!workspace) {
      const modules = flags.big === undefined ? 0 : flags.big === true ? DEFAULT_BIG_MODULES : Number(flags.big);
      const count = writeSample(p.sample, { modules });
      workspace = p.sample;
      console.log(`sample: ${workspace} (${count} files)`);
      if (flags.git) {
        console.log(`git repository; worktree: ${initGit(p.sample)}`);
      }
    }

    const settings = { ...BASE_SETTINGS, ...Object.fromEntries((flags.setting || []).map(parseSetting)) };
    fs.writeFileSync(p.settings, JSON.stringify(settings, null, 2));
    await activate(p, await launch(p, workspace), flags);
  },

  async restart(p, { flags }) {
    const state = readState(p);
    if (!state) {
      throw new Error(`no instance "${p.id}" to restart; run "node se.js start" first`);
    }
    await stopProcess(state);
    console.log(`stopped pid ${state.pid}; profile, settings and workspace kept`);
    if (!flags["no-compile"]) {
      compile();
    }
    const workspace = typeof flags.workspace === "string" ? path.resolve(flags.workspace) : state.workspace;
    await activate(p, await launch(p, workspace), flags);
  },

  async search(p, { positional, flags }) {
    const state = requireState(p);
    const { page } = await connect(state);
    await openQuickInput(page, flags.file ? "Alt+Meta+O" : "Alt+Meta+P");
    if (positional.length) {
      await replaceText(page, positional.join(" "));
    }
    printQuickInput(await settle(page, { minimum: 600 }));
  },

  async type(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    if (!(await quickInputOpen(page))) {
      throw new Error('no quick pick is open; use "search" first');
    }
    await replaceText(page, positional.join(" "));
    printQuickInput(await settle(page, { minimum: 600 }));
  },

  async text(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    await page.keyboard.type(positional.join(" "), { delay: 10 });
    await sleep(300);
    const view = await readQuickInput(page);
    if (view) {
      printQuickInput(await settle(page));
    } else {
      printWorkbench(await readWorkbench(page));
    }
  },

  async key(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    for (const key of positional) {
      await page.keyboard.press(key);
      await sleep(250);
    }
    const view = await settle(page, { minimum: 700 });
    if (view) {
      printQuickInput(view);
    } else {
      printWorkbench(await readWorkbench(page));
    }
  },

  async open(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    await openQuickInput(page, "Meta+P");
    await replaceText(page, positional.join(" "));
    await settle(page, { minimum: 700 });
    await page.keyboard.press("Enter");
    await sleep(800);
    printWorkbench(await readWorkbench(page));
  },

  async command(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    const before = scanLines(p).length;
    await openQuickInput(page, "Meta+Shift+P");
    const title = positional.join(" ");
    await replaceText(page, `>${title}`);
    const view = await settle(page, { minimum: 700 });
    // The palette matches fuzzily, so the first row is not always the command asked for.
    const rows = view ? view.rows : [];
    const target = rows.find((row) => row.label.toLowerCase() === title.toLowerCase());
    if (!target) {
      printQuickInput(view);
      throw new Error(`no command palette entry is titled exactly "${title}"`);
    }
    const focused = rows.find((row) => row.focused) || rows[0];
    for (let step = focused.index; step < target.index; step++) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
    if (!/search everywhere: reload/i.test(positional.join(" "))) {
      await sleep(1000);
      printWorkbench(await readWorkbench(page));
      return;
    }
    // Indexing a small sample takes about a second, so sample the UI while it runs.
    const seen = new Set();
    const scan = waitForScan(p, before, 180000).then((line) => ({ line }));
    let result;
    while (!result) {
      const view = await readWorkbench(page);
      view.toasts.forEach((toast) => seen.add(`toast: ${toast}`));
      view.statusItems
        .filter((item) => /index/i.test(item.text))
        .forEach((item) => seen.add(`status bar: ${item.text}`));
      result = await Promise.race([scan, sleep(100).then(() => undefined)]);
    }
    console.log("seen while indexing:");
    [...seen].forEach((entry) => console.log(`  - ${entry}`));
    console.log(`index ready: ${result.line}`);
    printWorkbench(await readWorkbench(page));
  },

  async set(p, { positional }) {
    requireState(p);
    const settings = JSON.parse(fs.readFileSync(p.settings, "utf8"));
    for (const entry of positional) {
      const [key, value] = parseSetting(entry);
      settings[key] = value;
      console.log(`${key} = ${JSON.stringify(value)}`);
    }
    fs.writeFileSync(p.settings, JSON.stringify(settings, null, 2));
    await sleep(1500);
  },

  async state(p) {
    const state = requireState(p);
    console.log(`instance: ${state.id} (pid ${state.pid}) workspace: ${state.workspace}`);
    const scans = scanLines(p);
    console.log(`last index: ${scans.length ? scans[scans.length - 1] : "(not indexed yet)"}`);
    const { page } = await connect(state);
    printWorkbench(await readWorkbench(page));
    printQuickInput(await readQuickInput(page));
  },

  async log(p, { flags }) {
    requireState(p);
    const file = flags.exthost ? findLog(p, "exthost.log") : outputLog(p);
    if (!file) {
      throw new Error("log file not found yet");
    }
    const lines = fs.readFileSync(file, "utf8").split("\n");
    console.log(`# ${file}`);
    console.log((flags.all ? lines : lines.slice(-80)).join("\n"));
  },

  async shot(p, { positional }) {
    const state = requireState(p);
    const { page } = await connect(state);
    fs.mkdirSync(p.shots, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const file = path.join(p.shots, `${state.id}-${positional[0] || "shot"}-${stamp}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  },

  async stop(p, { flags }) {
    const state = readState(p);
    if (await stopProcess(state)) {
      console.log(`stopped pid ${state.pid}`);
    } else {
      console.log("no running instance");
    }
    if (!flags.keep) {
      fs.rmSync(p.root, { recursive: true, force: true });
      console.log(`removed ${p.root}`);
    }
  },
};

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || !commands[name]) {
    console.log(USAGE);
    process.exit(name ? 1 : 0);
  }
  const args = parseArgs(rest);
  const id = typeof args.flags.id === "string" ? args.flags.id : process.env.SE_ID || "lt";
  const p = { ...paths(id), id };
  await commands[name](p, args);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
);
