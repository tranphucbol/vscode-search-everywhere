import { assert, expect } from "chai";
import * as sinon from "sinon";
import { asyncUtils } from "../../shared/async";

describe("Async", () => {
  describe("sleep", () => {
    it("should be fulfilled", async () => {
      const clock = sinon.useFakeTimers();
      let fulfilled = false;
      const sleepPromise = asyncUtils.sleep(1000);

      sleepPromise.then(() => {
        fulfilled = true;
      });

      // https://stackoverflow.com/questions/51526312/testing-setinterval-with-sinon-faketimers-not-working
      await Promise.resolve();
      clock.tick(999);
      expect(fulfilled).to.be.false;
      clock.tick(2);
      await Promise.resolve();
      expect(fulfilled).to.be.true;

      clock.restore();
    });
  });

  describe("sleepAndExecute", () => {
    it("should given fn be invoked after give", async () => {
      const stub = sinon.stub();
      const clock = sinon.useFakeTimers();
      asyncUtils.sleepAndExecute(1000, stub);

      // https://stackoverflow.com/questions/51526312/testing-setinterval-with-sinon-faketimers-not-working
      await Promise.resolve();
      clock.tick(999);
      assert.equal(stub.calledOnce, false);
      clock.tick(2);
      assert.equal(stub.calledOnce, true);

      clock.restore();
    });
  });

  describe("debounce", () => {
    it("should delay function execution until wait period elapses", (done) => {
      let callCount = 0;
      const debounced = asyncUtils.debounce(() => {
        callCount++;
      }, 50);

      debounced();
      debounced();
      debounced();

      assert.equal(callCount, 0);

      setTimeout(() => {
        assert.equal(callCount, 1);
        done();
      }, 80);
    });

    it("should pass latest arguments to debounced function", (done) => {
      let receivedArg = "";
      const debounced = asyncUtils.debounce((val: string) => {
        receivedArg = val;
      }, 30);

      debounced("first");
      debounced("second");
      debounced("third");

      setTimeout(() => {
        assert.equal(receivedArg, "third");
        done();
      }, 60);
    });
  });
});
