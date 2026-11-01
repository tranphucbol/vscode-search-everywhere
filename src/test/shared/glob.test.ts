import { assert } from "chai";
import { expandBraces, matchesGlob, mergeGlobs } from "../../shared/glob";

describe("Glob", () => {
  describe("matchesGlob", () => {
    it("should match ** across directories", () => {
      assert.equal(matchesGlob("/a/b/c/mock_user.go", "**/mock_*.go"), true);
      assert.equal(matchesGlob("mock_user.go", "**/mock_*.go"), true);
      assert.equal(matchesGlob("src/mocks/deep/user.go", "**/mocks/**"), true);
      assert.equal(matchesGlob("src/user.go", "**/mocks/**"), false);
    });

    it("should match brace alternatives", () => {
      const glob = "**/*.{json,yaml,yml}";
      assert.equal(matchesGlob("config/app.yaml", glob), true);
      assert.equal(matchesGlob("package.json", glob), true);
      assert.equal(matchesGlob("src/app.ts", glob), false);
      assert.equal(
        matchesGlob("src/a.spec.tsx", "**/*.{test,spec}.{ts,tsx}"),
        true
      );
    });

    it("should not let * cross a slash", () => {
      assert.equal(matchesGlob("src/user.go", "*.go"), false);
      assert.equal(matchesGlob("user.go", "*.go"), true);
      assert.equal(matchesGlob("src/zz_generated.deep.go", "src/zz_*"), true);
    });

    it("should match ? as one character", () => {
      assert.equal(matchesGlob("v1.go", "v?.go"), true);
      assert.equal(matchesGlob("v10.go", "v?.go"), false);
      assert.equal(matchesGlob("a/b.go", "a?b.go"), false);
    });

    it("should match any glob of an array and ignore empty globs", () => {
      assert.equal(matchesGlob("a.sum", ["", "**/*.sum"]), true);
      assert.equal(matchesGlob("a.go", ""), false);
    });
  });

  describe("expandBraces", () => {
    it("should expand every brace group, nested ones included", () => {
      assert.deepEqual(expandBraces("**/*.go"), ["**/*.go"]);
      assert.deepEqual(expandBraces("src/*.{ts,{js,jsx}}"), [
        "src/*.ts",
        "src/*.js",
        "src/*.jsx",
      ]);
      assert.deepEqual(expandBraces("**/*.{test,spec}.{ts,tsx}"), [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
      ]);
    });

    it("should keep a glob with an unclosed brace as it is", () => {
      assert.deepEqual(expandBraces("**/*.{ts"), ["**/*.{ts"]);
    });
  });

  describe("mergeGlobs", () => {
    it("should keep a single glob unchanged", () => {
      assert.equal(mergeGlobs(["**/*.{js,ts}", ""]), "**/*.{js,ts}");
      assert.equal(mergeGlobs([]), "");
    });

    it("should merge globs into one flat brace group matching the same files", () => {
      const globs = ["**/*.{ts,tsx}", "**/*.{yaml,ts}", "**/{.env,.env.*,Dockerfile}"];
      const merged = mergeGlobs(globs);

      assert.equal(
        merged,
        "{**/*.ts,**/*.tsx,**/*.yaml,**/.env,**/.env.*,**/Dockerfile}"
      );
      ["src/a.ts", "deploy/values.yaml", ".env.local", "docker/Dockerfile", "a.md"].forEach(
        (path) => assert.equal(matchesGlob(path, merged), matchesGlob(path, globs), path)
      );
    });
  });
});
