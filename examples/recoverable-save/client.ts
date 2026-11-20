export type ProviderIdentity = Readonly<{id: string; scope: string; epoch: string}>;
export type RecoveryIntent = Readonly<{key: string; text: string}>;
export type RecoveryState = Readonly<{
  phase: "empty" | "unknown" | "retryable" | "applied" | "rejected" | "blocked";
  message: string;
  intent?: RecoveryIntent;
  receipt?: number;
}>;
export type RecoveryClient = Readonly<{
  read(): RecoveryState;
  save(text: string, signal: AbortSignal): Promise<RecoveryState>;
  recover(signal: AbortSignal): Promise<RecoveryState>;
  retry(signal: AbortSignal): Promise<RecoveryState>;
  acknowledge(): RecoveryState;
}>;
type Options = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  slot: string;
  identity: ProviderIdentity;
  baseUrl: string;
  fetch: typeof fetch;
  createKey(): string;
};
type Entry = {schema: 1; owner: ProviderIdentity; intent: RecoveryIntent};
const token = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export function createRecoveryClient(options: Options): RecoveryClient {
  const owner = Object.freeze({...options.identity});
  const {storage, slot, fetch: transport, createKey} = options;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  if (!token(owner.id) || !token(owner.scope) || !token(owner.epoch) || !slot) throw new TypeError("Invalid recovery identity or storage slot");
  let knownRaw: string | null | undefined;
  let terminalRaw: string | null = null;
  let current: RecoveryState = Object.freeze({phase: "empty", message: ""});
  let busy = false;
  const state = (phase: RecoveryState["phase"], message: string, intent?: RecoveryIntent, receipt?: number): RecoveryState =>
    current = Object.freeze({phase, message, ...(intent ? {intent} : {}), ...(receipt !== undefined ? {receipt} : {})});

  function read(): RecoveryState {
    try {
      const raw = storage.getItem(slot);
      if (raw === knownRaw) return current;
      knownRaw = raw;
      terminalRaw = null;
      if (raw === null) return state("empty", "");
      const entry: unknown = JSON.parse(raw);
      if (!object(entry) || entry.schema !== 1 || !object(entry.owner) || !object(entry.intent) ||
          !token(entry.intent.key) || typeof entry.intent.text !== "string" || !entry.intent.text.trim() || entry.intent.text.length > 200)
        return state("blocked", "Stored attempt is invalid; preserve it for review");
      if (entry.owner.id !== owner.id || entry.owner.scope !== owner.scope || entry.owner.epoch !== owner.epoch)
        return state("blocked", "Stored attempt belongs to another provider scope or epoch");
      return state("unknown", "Check the saved attempt", Object.freeze({key: entry.intent.key, text: entry.intent.text}));
    } catch {
      knownRaw = undefined;
      terminalRaw = null;
      return state("blocked", "Could not read the saved attempt");
    }
  }

  async function exchange(method: "GET" | "PUT", signal: AbortSignal): Promise<RecoveryState> {
    const before = read(), intent = before.intent;
    if (!intent || signal.aborted) return before;
    const raw = knownRaw;
    terminalRaw = null;
    const url = baseUrl + "/scopes/" + encodeURIComponent(owner.scope) + "/intents/" + encodeURIComponent(intent.key);
    try {
      const response = await transport(url, {method, signal, cache: "no-store", headers: {
        "Content-Type": "application/json", "X-Provider-Epoch": owner.epoch,
      }, ...(method === "PUT" ? {body: JSON.stringify(intent)} : {})});
      const value: unknown = await response.json();
      if (signal.aborted) return state("unknown", "Check the saved attempt", intent);
      if (storage.getItem(slot) !== raw) return read();
      if (response.status === 404 || response.status >= 500) return state("unknown", "Result unavailable; check again", intent);
      if (!object(value) || value.epoch !== owner.epoch || value.scope !== owner.scope || value.key !== intent.key)
        return state("blocked", "Provider identity or result does not match the saved attempt", intent);
      if (value.status === "absent" && method === "GET" && response.status === 200)
        return state("retryable", "Not applied; retry the saved attempt", intent);
      if (value.text !== intent.text) return state("blocked", "Provider payload conflicts with the saved attempt", intent);
      if (value.status === "applied" && response.status === 200 && typeof value.receipt === "number" && Number.isSafeInteger(value.receipt) && value.receipt > 0) {
        terminalRaw = raw ?? null;
        return state("applied", "Applied; finish this attempt", intent, value.receipt);
      }
      if (value.status === "rejected" && (response.status === 200 || response.status === 422) && typeof value.reason === "string" && value.reason) {
        terminalRaw = raw ?? null;
        return state("rejected", value.reason, intent);
      }
      return state("unknown", "Result unavailable; check again", intent);
    } catch {
      return state("unknown", "Result unavailable; check again", intent);
    }
  }

  async function save(text: string, signal: AbortSignal): Promise<RecoveryState> {
    const before = read();
    if (busy || signal.aborted || before.phase !== "empty") return before;
    busy = true;
    try {
      const value = text.trim();
      if (!value || value.length > 200) return state("empty", "Enter between 1 and 200 characters");
      const key = createKey();
      if (signal.aborted) return before;
      if (!token(key)) throw Error("Invalid key");
      const entry: Entry = {schema: 1, owner, intent: Object.freeze({key, text: value})};
      storage.setItem(slot, JSON.stringify(entry));
      read();
      return await exchange("PUT", signal);
    } catch {
      knownRaw = undefined;
      return state("blocked", "Could not store the save attempt");
    } finally { busy = false; }
  }

  async function recover(signal: AbortSignal): Promise<RecoveryState> {
    const before = read();
    if (busy || signal.aborted || !before.intent) return before;
    busy = true;
    try { return await exchange("GET", signal); }
    finally { busy = false; }
  }

  async function retry(signal: AbortSignal): Promise<RecoveryState> {
    const before = read();
    if (busy || signal.aborted || before.phase !== "retryable") return before;
    busy = true;
    try { return await exchange("PUT", signal); }
    finally { busy = false; }
  }

  function acknowledge(): RecoveryState {
    const before = read();
    if (busy || (before.phase !== "applied" && before.phase !== "rejected") || terminalRaw === null) return before;
    try {
      if (storage.getItem(slot) !== terminalRaw) return read();
      storage.removeItem(slot);
      knownRaw = undefined;
      terminalRaw = null;
      return read();
    } catch { return state("blocked", "Could not finish the saved attempt", before.intent); }
  }

  read();
  return Object.freeze({read, save, recover, retry, acknowledge});
}
