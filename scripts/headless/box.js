#!/usr/bin/env node
// Runs a command in the headless Linux box (decision 010): a Docker container with a virtual
// display, so VS Code never opens on the developer's screen. Without arguments it runs `npm test`.
//
//   node scripts/headless/box.js
//   node scripts/headless/box.js npm run compile
const crypto = require("crypto");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "../..");
const IMAGE = "vscode-search-everywhere-box:local";
const WORKDIR = "/work";

function checkoutKey() {
  return crypto.createHash("sha1").update(REPO).digest("hex").slice(0, 10);
}

function docker(args, options = {}) {
  const result = spawnSync("docker", args, { stdio: "inherit", ...options });
  if (result.error) {
    throw new Error(`docker could not run: ${result.error.message}; is Docker running?`);
  }
  return result;
}

function buildImage() {
  const result = docker(["build", "--quiet", "--tag", IMAGE, __dirname], { stdio: ["ignore", "ignore", "inherit"] });
  if (result.status !== 0) {
    throw new Error("docker build of the headless box failed");
  }
}

/**
 * The repository's own `.git` when it lies outside the checkout, as it does for a git worktree,
 * whose `.git` file names it by absolute host path; mounted at that path, git works in the box.
 */
function gitCommonDir() {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: REPO,
    encoding: "utf8",
  });
  const dir = result.status === 0 ? result.stdout.trim() : "";
  return dir && !dir.startsWith(`${REPO}${path.sep}`) ? dir : undefined;
}

/**
 * `docker run` arguments up to and including the image. Linux node_modules and the downloaded
 * VS Code live in volumes of this checkout, so the host's macOS ones are never touched and two
 * checkouts never share them.
 */
function runArgs({ name, detach = false, mounts = [], env = {} } = {}) {
  const volume = (suffix) => `se-box-${checkoutKey()}-${suffix}`;
  const gitDir = gitCommonDir();
  if (gitDir) {
    mounts = [[gitDir, gitDir], ...mounts];
  }
  return [
    "run",
    detach ? "--detach" : "--rm",
    ...(name ? ["--name", name] : []),
    "--init",
    "--shm-size",
    "1g",
    "--label",
    `se-box.checkout=${REPO}`,
    "--volume",
    `${REPO}:${WORKDIR}`,
    "--volume",
    `${volume("node-modules")}:${WORKDIR}/node_modules`,
    "--volume",
    `${volume("vscode-test")}:${WORKDIR}/.vscode-test`,
    ...mounts.flatMap(([host, box]) => ["--volume", `${host}:${box}`]),
    ...Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    IMAGE,
  ];
}

function main() {
  const command = process.argv.length > 2 ? process.argv.slice(2) : ["npm", "test"];
  buildImage();
  const { status } = docker([...runArgs(), ...command]);
  process.exit(status === null ? 1 : status);
}

module.exports = { REPO, WORKDIR, checkoutKey, docker, buildImage, runArgs };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
