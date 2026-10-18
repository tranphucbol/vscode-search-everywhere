import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { warmup } from "../../symbols/warmup";
import { getTestSetups } from "./warmup.testSetup";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Warmup", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  beforeEach(() => setups.beforeEach());
  afterEach(() => setups.afterEach());

  describe("warmupLanguageServers", () => {
    const notCancelled = () => false;
    const uri = (path: string) => vscode.Uri.file(`/./fake/${path}`);
    const callsFor = (stub: sinon.SinonStub, target: vscode.Uri) =>
      stub.getCalls().filter((call) => call.args[1] === target).length;

    it("should warm up one sample per language", async () => {
      const uris = [
        uri("a.go"),
        uri("b.go"),
        uri("c.go"),
        uri("User.java"),
        uri("app.ts"),
        uri("view.tsx"),
        uri("config.json"),
      ];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup([
        "go",
        "java",
        "ts",
        "tsx",
      ]);
      await warmup.warmupLanguageServers(uris, notCancelled);

      const opened = openTextDocumentStub
        .getCalls()
        .map((call) => call.args[0].path);
      assert.sameMembers(opened, [
        uris[1].path,
        uris[3].path,
        uris[5].path,
      ]);
    });

    it("should wait longer for Java than for other languages", async () => {
      const goSample = uri("b.go");
      const javaSample = uri("B.java");
      const uris = [uri("a.go"), goSample, uri("A.java"), javaSample];
      const { executeCommandStub } = setups.warmup.setupForWarmup([]);
      await warmup.warmupLanguageServers(uris, notCancelled);

      // one call per poll
      assert.equal(callsFor(executeCommandStub, goSample), 30);
      assert.equal(callsFor(executeCommandStub, javaSample), 240);
    });

    it("should report languages whose warm-up timed out", async () => {
      const uris = [uri("a.go"), uri("b.go"), uri("app.ts"), uri("util.ts")];
      setups.warmup.setupForWarmup(["ts"]);
      const timedOut = await warmup.warmupLanguageServers(uris, notCancelled);

      assert.sameMembers(Array.from(timedOut), ["go"]);
    });

    it("should stop waiting once the scan is cancelled", async () => {
      const goSample = uri("b.go");
      const { executeCommandStub } = setups.warmup.setupForWarmup([]);
      await warmup.warmupLanguageServers([uri("a.go"), goSample], () => true);

      assert.equal(callsFor(executeCommandStub, goSample), 0);
    });

    it("should not sample names-only files", async () => {
      const uris = [
        uri("config.json"),
        uri("other.json"),
        uri("app.ts"),
        uri("util.ts"),
      ];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup(["ts"]);
      const timedOut = await warmup.warmupLanguageServers(uris, notCancelled);

      const opened = openTextDocumentStub
        .getCalls()
        .map((call) => call.args[0].path);
      assert.deepEqual(opened, [uris[3].path]);
      assert.equal(timedOut.size, 0);
    });

    it("should not wait for a language no extension provides", async () => {
      const protoSample = uri("b.proto");
      const uris = [uri("a.proto"), protoSample, uri("app.ts"), uri("util.ts")];
      const { executeCommandStub } = setups.warmup.setupForWarmup(
        ["ts"],
        "**/*.json",
        ["proto"]
      );
      const timedOut = await warmup.warmupLanguageServers(uris, notCancelled);

      assert.equal(callsFor(executeCommandStub, protoSample), 0);
      assert.equal(timedOut.size, 0);
    });

    it("should not warm up a language again once it is ready", async () => {
      const uris = [uri("app.ts"), uri("util.ts")];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup(["ts"]);
      await warmup.warmupLanguageServers(uris, notCancelled);
      await warmup.warmupLanguageServers(uris, notCancelled);

      assert.equal(openTextDocumentStub.callCount, 1);
    });
  });
});
