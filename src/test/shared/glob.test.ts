import { assert } from "chai";
import { matchesGlob } from "../../shared/glob";

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
});
