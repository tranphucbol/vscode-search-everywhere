import { assert } from "chai";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { gitService } from "../../gitService";

describe("gitService", () => {
  const projectRoot = path.resolve(__dirname, "../../../");

  describe("getRepoFingerprint", () => {
    it("should return a 16-character hexadecimal fingerprint for current repo", async () => {
      const fingerprint = await gitService.getRepoFingerprint(projectRoot);
      assert.isDefined(fingerprint);
      assert.isString(fingerprint);
      assert.equal(fingerprint!.length, 16);
    });

    it("should return undefined gracefully for a non-existent or non-git directory", async () => {
      const nonGitDir = path.resolve(projectRoot, "node_modules");
      const nonExistent = "/tmp/does-not-exist-" + Date.now();
      const result = await gitService.getRepoFingerprint(nonExistent);
      assert.isUndefined(result);
    });
  });

  describe("getModifiedOrUntrackedFiles", () => {
    it("should return an array of file paths for current git repository", async () => {
      const modifiedFiles = await gitService.getModifiedOrUntrackedFiles(projectRoot);
      assert.isArray(modifiedFiles);
    });

    it("should return an empty array for an invalid path without throwing", async () => {
      const nonExistent = "/tmp/does-not-exist-" + Date.now();
      const result = await gitService.getModifiedOrUntrackedFiles(nonExistent);
      assert.deepEqual(result, []);
    });
  });

  describe("template delta", () => {
    let repoRoot: string;
    let firstCommit: string;

    const git = (...args: string[]) =>
      child_process
        .execFileSync(
          "git",
          ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
          { cwd: repoRoot }
        )
        .toString()
        .trim();
    const write = (relativePath: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(repoRoot, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, relativePath), content);
    };

    beforeEach(() => {
      repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "se-git-"));
      git("init", "-q");
      write("src/kept.ts", "export const kept = 1;");
      write("src/removed.ts", "export const removed = 1;");
      write("src/renamed.ts", "export const renamed = 1;");
      git("add", "-A");
      git("commit", "-q", "-m", "first");
      firstCommit = git("rev-parse", "HEAD");
    });

    afterEach(() => {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    });

    it("should list paths changed between a commit and HEAD", async () => {
      write("src/added.ts", "export const added = 1;");
      write("src/kept.ts", "export const kept = 2;");
      git("rm", "-q", "src/removed.ts");
      git("mv", "src/renamed.ts", "src/moved.ts");
      git("add", "-A");
      git("commit", "-q", "-m", "second");

      const paths = await gitService.getChangedPathsBetween(repoRoot, firstCommit);

      assert.deepEqual(paths!.sort(), [
        "src/added.ts",
        "src/kept.ts",
        "src/moved.ts",
        "src/removed.ts",
        "src/renamed.ts",
      ]);
      assert.equal(await gitService.getHeadCommit(repoRoot), git("rev-parse", "HEAD"));
    });

    it("should return undefined when the commit is unknown", async () => {
      const paths = await gitService.getChangedPathsBetween(
        repoRoot,
        "0123456789abcdef0123456789abcdef01234567"
      );

      assert.isUndefined(paths);
    });

    it("should include deleted files in the working tree paths", async () => {
      fs.unlinkSync(path.join(repoRoot, "src/removed.ts"));
      write("src/kept.ts", "export const kept = 2;");
      write("src/untracked.ts", "export const untracked = 1;");

      const paths = await gitService.getWorkingTreePaths(repoRoot);

      assert.deepEqual(paths.sort(), ["src/kept.ts", "src/removed.ts", "src/untracked.ts"]);
    });
  });
});
