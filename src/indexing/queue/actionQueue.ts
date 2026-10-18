import {
  onDidProcessingEventEmitter,
  onWillExecuteActionEventEmitter,
  onWillProcessingEventEmitter,
} from "../../shared/events";
import { Action, ActionType } from "../../shared/types";
import { collections } from "../../shared/collections";

function add(action: Action): void {
  assignId(action);
  addToQueue(action);
}

function assignId(action: Action): void {
  const actionId = getActionId();
  action.id = actionId;
  setActionId(actionId + 1);
}

function addToQueue(action: Action): void {
  actionQueue.queue.push(action);
}

async function processIfIsNotBusy(): Promise<void> {
  !actionQueue.getIsBusy() && (await actionQueue.process());
}

async function process() {
  onWillProcessingEventEmitter.fire();
  setIsBusy(true);

  await processEachAction();

  setIsBusy(false);
  setPreviousAction(undefined);
  onDidProcessingEventEmitter.fire();
}

async function processEachAction() {
  while (actionQueue.queue.length) {
    reduce();
    const action = getNextActionFromQueue();
    setPreviousAction(action);
    action && onWillExecuteActionEventEmitter.fire(action);
    action && (await action.fn());
  }
}

function setIsBusy(value: boolean): void {
  isBusy = value;
}

function getIsBusy() {
  return isBusy;
}

function getNextActionFromQueue(): Action | undefined {
  return actionQueue.queue.shift();
}

function reduce(): void {
  reduceRebuilds();
  reduceUpdates();
  reduceRemoves();
}

function reduceRebuilds(): void {
  reduceByActionType(ActionType.Rebuild);
}

function reduceUpdates(): void {
  reduceByActionType(ActionType.Update);
}

function reduceRemoves(): void {
  reduceByActionType(ActionType.Remove);
}

function reduceByActionType(actionType: ActionType) {
  const actions = getActionsFromQueueByType(actionType);
  actionType === ActionType.Rebuild
    ? reduceRebuildAction(actionType, actions)
    : reduceUpdateRemoveAction(actionType, actions);
}

function reduceRebuildAction(actionType: ActionType, actions: Action[]) {
  if (isPreviousActionRebuildType()) {
    actionQueue.queue = [];
  } else if (ifActionArrayContainsRebuildType(actions)) {
    const last = collections.getLastFromArray(
      actionQueue.queue,
      (action: Action) => action.type === actionType
    );
    actionQueue.queue = [last];
  }
}

function isPreviousActionRebuildType(): boolean {
  const previousAction = actionQueue.getPreviousAction();
  return !!previousAction && previousAction.type === ActionType.Rebuild;
}

function ifActionArrayContainsRebuildType(actions: Action[]): boolean {
  return actions.some((action) => action.type === ActionType.Rebuild);
}

function reduceUpdateRemoveAction(actionType: ActionType, actions: Action[]) {
  const groupedActions = collections.groupBy(
    actions,
    (action: Action) => action.uri!.path
  );

  groupedActions.forEach(reduceByFsPath.bind(null, actionType));
}

function reduceByFsPath(
  actionType: ActionType,
  _actionsByFsPath: Action[],
  fsPath: string
) {
  const lastAction: Action = collections.getLastFromArray(
    actionQueue.queue,
    (action: Action) =>
      action.type === actionType && action.uri!.path === fsPath
  );

  actionQueue.queue = actionQueue.queue.filter(
    shouldActionRemainInQueue.bind(null, actionType, fsPath, lastAction)
  );
}

function shouldActionRemainInQueue(
  actionType: ActionType,
  fsPath: string,
  lastAction: Action,
  action: Action
) {
  return (
    action.type !== actionType ||
    action.uri!.path !== fsPath ||
    action.id === lastAction.id
  );
}

function getActionsFromQueueByType(actionType: ActionType): Action[] {
  return actionQueue.queue.filter(
    (action: Action) => action.type === actionType
  );
}

function setPreviousAction(action: Action | undefined): void {
  previousAction = action;
}

function getPreviousAction() {
  return previousAction;
}

async function register(action: Action): Promise<void> {
  actionQueue.add(action);
  await processIfIsNotBusy();
}

function getActionId() {
  return actionId;
}

function setActionId(newActionId: number): void {
  actionId = newActionId;
}

let actionId = 0;
let isBusy = false;
let previousAction: Action | undefined = undefined;

export const actionQueue = {
  queue: [] as Action[],
  getIsBusy,
  getPreviousAction,
  add,
  process,
  register,
};
