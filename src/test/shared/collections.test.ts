import { assert } from "chai";
import { collections } from "../../shared/collections";
import { Action, ActionType } from "../../shared/types";
import { getAction } from "../util/mockFactory";

describe("Collections", () => {
  describe("getLastFromArray", () => {
    it("should return last element from array fulfilling given predicate", () => {
      const lastAction = getAction(ActionType.Rebuild, "test action 3", 3);
      const actual = collections.getLastFromArray(
        [
          getAction(ActionType.Rebuild, "test action 1", 1),
          getAction(ActionType.Remove, "test action 2", 2),
          lastAction,
        ],
        (action: Action) => action.type === ActionType.Rebuild
      );

      assert.deepEqual(actual, lastAction);
    });

    it("should return undefined if given predicated is not fulfilled", () => {
      const last = collections.getLastFromArray(
        [
          getAction(ActionType.Rebuild, "test action 1", 1),
          getAction(ActionType.Remove, "test action 2", 2),
          getAction(ActionType.Rebuild, "test action 3", 3),
        ],
        (action: Action) => action.type === ActionType.Update
      );

      assert.equal(last, undefined);
    });
  });

  describe("groupBy", () => {
    it("should return map containing grouped array", () => {
      const actions = [
        getAction(ActionType.Rebuild, "test action 1", 1),
        getAction(ActionType.Remove, "test action 2", 2),
        getAction(ActionType.Rebuild, "test action 3", 3),
      ];

      const actual = collections.groupBy(
        actions,
        (action: Action) => action.type
      );

      const expected = new Map<string, Action[]>();
      expected.set(ActionType.Rebuild, [actions[0], actions[2]]);
      expected.set(ActionType.Remove, [actions[1]]);

      assert.deepEqual(actual, expected);
    });
  });
});
