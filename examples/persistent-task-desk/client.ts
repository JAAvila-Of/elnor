import type {Task, TaskInput} from "../task-desk/types.js";
import {validateTaskInput, validateTaskWireFields} from "../task-desk/task-input-schema.js";
export type VersionedTask = Task & {revision: number};
export type Command = {kind: "replace"; taskId: string; expectedRevision: number; task: Task} | {kind: "create"; task: Task} | {kind: "delete"; taskId: string; expectedRevision: number};
type Tombstone = Readonly<{id: string; revision: number}>;
export type TaskSnapshot = Readonly<{
  tasks: readonly Readonly<VersionedTask>[];
  tombstones: readonly Tombstone[];
}>;
type Attempt = Readonly<{key: string; command: Command}>;
type Identity = Readonly<{id: string; scope: string; epoch: string}>;
export type WriteIssue = Readonly<{path: readonly [keyof TaskInput]; message: string}>;
export type DeskState = Readonly<{
  phase: "empty" | "unknown" | "retryable" | "applied" | "rejected" | "conflict" | "missing" | "blocked";
  message: string; tombstones?: readonly Tombstone[]; tasks: VersionedTask[]; loaded: boolean; attempt?: Attempt;
  issues?: readonly WriteIssue[];
  receiptReview?: "needs-refresh" | "ready";
}>;
type DiscardResult = DeskState & {discardedAttemptKey?: string};
type SubmittedAttempt = Readonly<{submittedAttemptKey?: string}>;
export type DeskClient = Readonly<{
  read(): DeskState;
  refresh(signal: AbortSignal): Promise<DeskState>;
  save(task: Task, expectedRevision: number, signal: AbortSignal): Promise<DeskState & SubmittedAttempt>;
  create(input: TaskInput, signal: AbortSignal): Promise<DeskState & SubmittedAttempt>;
  remove(taskId: string, expectedRevision: number, signal: AbortSignal): Promise<DeskState & SubmittedAttempt>;
  recover(signal: AbortSignal): Promise<DeskState>;
  retry(signal: AbortSignal): Promise<DeskState>;
  acknowledge(): DeskState;
  discardUnavailable(signal: AbortSignal, key?: string): DiscardResult;
}>;
export type DeskViewState = DiscardResult & SubmittedAttempt & {admission?: "busy" | "occupied"};
export type DeskViewClient = Omit<DeskClient, "recover" | "retry" | "acknowledge" | "discardUnavailable"> & {
  recover(signal: AbortSignal, key?: string): Promise<DeskState>;
  retry(signal: AbortSignal, key?: string): Promise<DeskState>;
  acknowledge(signal: AbortSignal, key?: string): DeskState | Promise<DeskState>;
  discardUnavailable(signal: AbortSignal, key?: string): DiscardResult | Promise<DiscardResult>;
  observe?(publish: (state: DeskState) => void): () => void;
};
type Options = {storage: Pick<Storage,"getItem"|"setItem"|"removeItem">; slot: string; identity: Identity; baseUrl: string; fetch: typeof fetch; createKey(): string};
const obj = (v: unknown): v is Record<string,unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const token = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
function task(v: unknown): v is Task {
  return obj(v) && token(v.id) && (v.status === "open" || v.status === "in-progress" || v.status === "done") &&
    validateTaskWireFields(v).issues === undefined;
}
function command(v: unknown): v is Command {
  if (!obj(v)) return false;
  if (v.kind === "delete") return Object.keys(v).length === 3 && token(v.taskId) && revision(v.expectedRevision) && v.expectedRevision < Number.MAX_SAFE_INTEGER;
  if (!task(v.task) || Object.keys(v.task).length !== 6) return false;
  if (v.kind === "create") return Object.keys(v).length === 2 && v.task.status === "open";
  return Object.keys(v).length === 4 && v.kind === "replace" && v.taskId === v.task.id && revision(v.expectedRevision) && v.expectedRevision < Number.MAX_SAFE_INTEGER;
}
function sameTask(a: Readonly<Task>, b: Readonly<Task>): boolean {
  return a.id === b.id && a.title === b.title && a.assignee === b.assignee &&
    a.description === b.description && a.priority === b.priority && a.status === b.status;
}
function same(a: Command, b: Command): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "delete" || b.kind === "delete") return a.kind === "delete" && b.kind === "delete" && a.taskId === b.taskId && a.expectedRevision === b.expectedRevision;
  if (a.kind === "replace" && b.kind === "replace" && (a.taskId !== b.taskId || a.expectedRevision !== b.expectedRevision)) return false;
  return sameTask(a.task, b.task);
}
function freezeCommand(value: Command): Command {
  return value.kind === "delete" ? Object.freeze({...value}) : Object.freeze({...value, task:Object.freeze({...value.task})});
}
function applied(value: Record<string,unknown>, intent: Command): boolean {
  return value.revision === (intent.kind === "create" ? 1 : intent.expectedRevision + 1) && (intent.kind !== "delete" || value.deleted === true);
}

export function decodeTaskSnapshot(value: unknown): TaskSnapshot {
  if (!obj(value) || !Array.isArray(value.tasks) ||
      !value.tasks.every(v => task(v) && obj(v) && revision(v.revision)) ||
      new Set(value.tasks.map(v => v.id)).size !== value.tasks.length) throw Error("Invalid snapshot");
  const removed: unknown = value.tombstones ?? [];
  if (!Array.isArray(removed) || !removed.every(v => obj(v) && token(v.id) && revision(v.revision) && v.revision >= 2) ||
      new Set(removed.map(v => v.id)).size !== removed.length) throw Error("Invalid tombstones");
  const tasks: VersionedTask[] = value.tasks;
  const tombstones: Tombstone[] = removed;
  const ids = new Set(tasks.map(task => task.id));
  if (tombstones.some(item => ids.has(item.id))) throw Error("Invalid snapshot");
  return Object.freeze({
    tasks: Object.freeze(tasks.map(task => Object.freeze({...task}))),
    tombstones: Object.freeze(tombstones.map(item => Object.freeze({...item})))
  });
}

export function preservesTaskHistory(previous: TaskSnapshot, next: TaskSnapshot): boolean {
  const tasks = new Map(next.tasks.map(task => [task.id, task]));
  const tombstones = new Map(next.tombstones.map(item => [item.id, item.revision]));
  if (next.tombstones.some(item => tasks.has(item.id))) return false;

  for (const old of previous.tasks) {
    const task = tasks.get(old.id);
    if (!task) {
      if ((tombstones.get(old.id) ?? 0) <= old.revision) return false;
    } else if (task.revision < old.revision || (task.revision === old.revision && !sameTask(old, task))) {
      return false;
    }
  }
  return previous.tombstones.every(old => (tombstones.get(old.id) ?? 0) >= old.revision);
}

function readWriteIssues(value: unknown): readonly WriteIssue[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return undefined;
  const issues: WriteIssue[] = [];
  for (const issue of value) {
    if (!obj(issue) || typeof issue.message !== "string" || !issue.message.trim() ||
        !Array.isArray(issue.path) || issue.path.length !== 1) return undefined;
    const [field] = issue.path;
    if (field !== "title" && field !== "assignee" && field !== "description" && field !== "priority") return undefined;
    if (issues.some(previous => previous.path[0] === field)) return undefined;
    issues.push(Object.freeze({path: Object.freeze([field] as const), message: issue.message}));
  }
  return Object.freeze(issues);
}

export function createDeskClient(options: Options): DeskClient {
  const owner = Object.freeze({...options.identity}), {storage,slot,fetch: transport,createKey} = options;
  if (!token(owner.id) || !token(owner.scope) || !token(owner.epoch) || !slot) throw TypeError("Invalid journal owner");
  const base = options.baseUrl.replace(/\/$/,"") + "/scopes/" + encodeURIComponent(owner.scope);
  let rawKnown: string | null | undefined, terminal: string | null = null, busy = false;
  const changedHistory = "Provider history changed. Reopen the original provider to check the saved attempt.";
  const unavailable = "The provider no longer has the receipt. The saved attempt's outcome cannot be confirmed.";
  let current: DeskState = Object.freeze({phase:"empty",message:"Load tasks to begin",tasks:Object.freeze([]) as unknown as VersionedTask[],tombstones:Object.freeze([]),loaded:false});
  function state(patch: Partial<DeskState>): DeskState {
    const next = {...current, ...patch};
    if (next.phase !== "rejected" || next.issues === undefined) delete next.issues;
    if (patch.phase && !patch.receiptReview) delete next.receiptReview;
    return current = Object.freeze(next);
  }
  function read(): DeskState {
    try {
      const raw = storage.getItem(slot);
      if (raw === rawKnown) return current;
      rawKnown = raw; terminal = null;
      if (raw === null) return state({phase:"empty",message:"",attempt:undefined});
      let entry: unknown;
      try { entry = JSON.parse(raw); }
      catch { return state({phase:"blocked",message:"Saved attempt is unreadable. Its stored data is still here.",attempt:undefined}); }
      if (!obj(entry) || entry.schema !== 1 || !obj(entry.owner) ||
          !token(entry.owner.id) || !token(entry.owner.scope) || !token(entry.owner.epoch)) {
        return state({phase:"blocked",message:"Saved attempt has an unsupported format. Its stored data is still here.",attempt:undefined});
      }
      if (entry.owner.id !== owner.id || entry.owner.scope !== owner.scope) {
        return state({phase:"blocked",message:"Saved attempt belongs to another provider or workspace.",attempt:undefined});
      }
      if (entry.owner.epoch !== owner.epoch) return state({phase:"blocked",message:changedHistory,attempt:undefined});
      if (!obj(entry.attempt) || !token(entry.attempt.key) || !command(entry.attempt.command)) {
        return state({phase:"blocked",message:"Saved attempt is invalid. Its stored data is still here.",attempt:undefined});
      }
      return state({phase:"unknown",message:"Check the saved edit",attempt:Object.freeze({key:entry.attempt.key,command:freezeCommand(entry.attempt.command)})});
    } catch {rawKnown=undefined;terminal=null;return state({phase:"blocked",message:"Could not read the saved edit",attempt:undefined});}
  }
  async function request(url: string, signal: AbortSignal, body?: Command) {
    return transport(url,{method:body?"PUT":"GET",signal,cache:"no-store",headers:{"Content-Type":"application/json","X-Provider-Epoch":owner.epoch},...(body?{body:JSON.stringify(body)}:{})});
  }
  async function refresh(signal: AbortSignal): Promise<DeskState> {
    const before = read();
    if (busy || signal.aborted) return before;
    const raw = rawKnown;
    if (before.receiptReview) state({receiptReview: "needs-refresh"});
    busy=true;
    try {
      const response = await request(base+"/tasks",signal), value: unknown = await response.json();
      if (signal.aborted) return current;
      if (before.receiptReview) {
        read();
        if (rawKnown !== raw) return current;
      }
      if (response.status === 412) return state({phase:"blocked",message:changedHistory,loaded:false});
      if (response.status !== 200 || !obj(value) || value.scope !== owner.scope || value.epoch !== owner.epoch)
        throw Error("Invalid snapshot");
      const snapshot = decodeTaskSnapshot(value);
      if (!preservesTaskHistory({tasks: current.tasks, tombstones: current.tombstones ?? []}, snapshot)) {
        throw Error("Snapshot regressed");
      }
      const refreshed = {tasks: snapshot.tasks as VersionedTask[], tombstones: snapshot.tombstones, loaded: true};
      if (before.receiptReview && current.receiptReview) {
        return state({...refreshed, receiptReview: "ready", message: unavailable});
      }
      return state({...refreshed, message: current.phase === "blocked" ? current.message : "Tasks refreshed; drafts are unchanged"});
    } catch {
      if (read().receiptReview) {
        return state({message: unavailable + " Could not refresh tasks. Try refreshing again before discarding."});
      }
      return state({message:current.phase === "blocked" ? current.message : "Could not refresh tasks; existing data and drafts are preserved"});
    }
    finally {busy=false;}
  }
  async function exchange(method: "GET"|"PUT", signal: AbortSignal, submittedRaw?: string): Promise<DeskState> {
    const before=read(), attempt=before.attempt, raw=rawKnown;
    if (!attempt || signal.aborted) return before;
    if (submittedRaw !== undefined && raw !== submittedRaw) return before;
    terminal=null;
    try {
      const response=await request(base+"/commands/"+encodeURIComponent(attempt.key),signal,method==="PUT"?attempt.command:undefined);
      const value: unknown=await response.json();
      if (storage.getItem(slot)!==raw) return read();
      if (signal.aborted || response.status===404 || response.status>=500) return state({phase:"unknown",message:"Result unavailable; check again"});
      if (response.status === 412) return state({phase:"blocked",message:changedHistory,loaded:false});
      if (!obj(value) || value.epoch!==owner.epoch || value.scope!==owner.scope || value.key!==attempt.key)
        return state({phase:"blocked",message:"Provider identity or result mismatch"});
      if (response.status === 410 && value.status === "receipt-unavailable") {
        return state({
          phase: "blocked",
          receiptReview: "needs-refresh",
          message: unavailable
        });
      }
      if (method==="GET" && response.status===200 && value.status==="absent") return state({phase:"retryable",message:"Not applied; retry the saved edit"});
      if (!command(value.intent) || !same(value.intent,attempt.command)) return state({phase:"blocked",message:"Saved command conflicts with provider result"});
      const status=value.status;
      if (status==="applied" && response.status===200 && applied(value,attempt.command) ||
          status==="rejected" && (response.status===200 || response.status===422) && typeof value.reason==="string" && !!value.reason ||
          status==="conflict" && (response.status===200 || response.status===409) && revision(value.currentRevision) ||
          status==="missing" && (response.status===200 || response.status===409)) {
        if (status==="applied" && attempt.command.kind==="delete") {
          const id=attempt.command.taskId, confirmed=value.revision as number;
          if (current.tasks.some(v=>v.id===id && v.revision>=confirmed)) return state({phase:"blocked",message:"Deletion conflicts with newer confirmed data"});
          const known=(current.tombstones??[]).find(v=>v.id===id)?.revision??0;
          const tombstones=[...(current.tombstones??[]).filter(v=>v.id!==id),Object.freeze({id,revision:Math.max(known,confirmed)})];
          state({tasks:Object.freeze(current.tasks.filter(v=>v.id!==id)) as unknown as VersionedTask[],tombstones:Object.freeze(tombstones)});
        }
        terminal=raw??null;
        if (status === "rejected") {
          const issues = attempt.command.kind === "delete" ? undefined : readWriteIssues(value.issues);
          return state({phase: "rejected", message: String(value.reason), issues});
        }
        return state({phase:status as "applied"|"conflict"|"missing",message:status==="applied"?(attempt.command.kind==="delete"?"Task deleted; refresh tasks, then finish":attempt.command.kind==="create"?"Task created; refresh tasks, then finish":"Edit applied; refresh tasks, then finish"):status==="conflict"?"Revision conflict; keep the draft and review current data":"Task no longer exists; keep the draft"});
      }
      return state({phase:status==="key-conflict"?"blocked":"unknown",message:"Result cannot confirm this edit"});
    } catch {return state({phase:"unknown",message:"Result unavailable; check again"});}
  }
  async function submit(build: () => Command, signal: AbortSignal): Promise<DeskState & SubmittedAttempt> {
    const before=read();if(busy || signal.aborted || before.phase!=="empty" || !before.loaded)return before;
    busy=true;
    try {
      const frozen=freezeCommand(build());
      if (!command(frozen) || (frozen.kind !== "delete" && validateTaskInput(frozen.task).issues)) {
        return state({message: "Check title, fields and revision before saving"});
      }
      const key=createKey();if(!token(key))throw Error("Invalid key");if(signal.aborted)return current;
      const raw = JSON.stringify({schema:1,owner,attempt:{key,command:frozen}});
      storage.setItem(slot,raw);
      await exchange("PUT",signal,raw);
      // Another tab can replace the saved attempt while the request is open.
      const result = read();
      return rawKnown === raw && result.attempt?.key === key
        ? Object.freeze({...result,submittedAttemptKey:key})
        : result;
    } catch {rawKnown=undefined;return state({phase:"blocked",message:"Could not store the command; no new write is admitted"});}
    finally {busy=false;}
  }
  const save = (value: Task, expectedRevision: number, signal: AbortSignal) => submit(()=>({kind:"replace",taskId:value.id,expectedRevision,task:value}),signal);
  const create = (input: TaskInput, signal: AbortSignal) => submit(()=>({kind:"create",task:{...input,id:"TASK-"+createKey(),status:"open"}}),signal);
  const remove = (taskId: string, expectedRevision: number, signal: AbortSignal) => submit(()=>({kind:"delete",taskId,expectedRevision}),signal);
  async function run(method: "GET"|"PUT", signal: AbortSignal): Promise<DeskState> {
    const before=read();if(busy || signal.aborted || !before.attempt || before.phase==="blocked" || method==="PUT" && before.phase!=="retryable")return before;
    busy=true;try{return await exchange(method,signal);}finally{busy=false;}
  }
  function acknowledge(): DeskState {
    const before=read();if(busy || terminal===null || !["applied","rejected","conflict","missing"].includes(before.phase))return before;
    try{if(storage.getItem(slot)!==terminal)return read();storage.removeItem(slot);rawKnown=undefined;terminal=null;return read();}
    catch{return state({phase:"blocked",message:"Could not finish the edit"});}
  }
  function discardUnavailable(signal: AbortSignal, key?: string): DiscardResult {
    const before = read(), raw = rawKnown;
    if (busy || signal.aborted || !key || before.attempt?.key !== key || before.receiptReview !== "ready") return before;
    try {
      if (storage.getItem(slot) !== raw) return read();
      storage.removeItem(slot);
      const after = read();
      if (after.phase !== "empty") return after;
      return {...state({message: "Saved attempt discarded. No changes were sent."}), discardedAttemptKey: key};
    } catch {
      return state({message: unavailable + " Could not discard the saved attempt. Try again."});
    }
  }
  read();return Object.freeze({read,refresh,save,create,remove,recover:(s:AbortSignal)=>run("GET",s),retry:(s:AbortSignal)=>run("PUT",s),acknowledge,discardUnavailable});
}
