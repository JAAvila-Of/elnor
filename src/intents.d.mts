// Types of the intent journal in intents.mjs.

declare const durableBrand: unique symbol;

interface DurableTypes<I, R, E> {
  readonly input: I;
  readonly result: R;
  readonly reason: E;
}

/** The outcome the provider decided for an intent. `late` is true when another page or tab admitted it. */
export type DurableOutcome<R, E> =
  | {status: 'applied'; result: R; late: boolean}
  | {status: 'rejected'; reason: E; late: boolean}
  | {status: 'unavailable'; late: boolean};

/** The inert value a durable operation returns; only a durable member sends it. */
export interface DurableRequest<I, R, E> {
  readonly operation: string;
  readonly input: I;
  readonly [durableBrand]: DurableTypes<I, R, E>;
}

export interface DurableOperation<I, R, E> {
  (input: I): DurableRequest<I, R, E>;
  readonly [durableBrand]: DurableTypes<I, R, E>;
}

export type TransportAnswer =
  | {kind: 'applied'; epoch: string; result: unknown}
  | {kind: 'rejected'; epoch: string; reason: unknown}
  | {kind: 'unavailable'; epoch: string}
  | {kind: 'epoch'; epoch: string}
  | {kind: 'key-conflict'}
  | {kind: 'scope-refused'}
  | {kind: 'mismatch'}
  | {kind: 'retry'};

export interface IntentTransport {
  send(request: {operation: string; key: string; scope: string; epoch: string | null; input: unknown; signal: AbortSignal}): Promise<TransportAnswer>;
}

export interface HttpIntentTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Extra headers for every request, such as the host's session headers. */
  headers?: () => Record<string, string>;
}

/** Sends each intent as PUT {baseUrl}/{operation}/{key} with the scope and epoch headers. */
export function httpIntentTransport(options: HttpIntentTransportOptions): IntentTransport;

/** A terminal record that no member has consumed. */
export interface UnconsumedOutcome {
  readonly id: string;
  journal: string;
  owner: string;
  member: string;
  operation: string;
  input: unknown;
  outcome: DurableOutcome<unknown, unknown>;
  acknowledge(): Promise<void>;
}

/** A record that cannot be sent safely. Until it is discarded, its owner admits no new intent. */
export interface BlockedRecord {
  readonly id: string;
  journal: string;
  owner: string;
  member: string;
  operation: string;
  reason: 'key-conflict' | 'epoch' | 'mismatch' | 'version' | 'unknown-operation' | 'corrupt';
  /** The stored text of the record. */
  export(): string;
  discard(): Promise<void>;
}

/**
 * Where a journal keeps its records: the text of each scope's journal under
 * one key. A write or a removal resolves once it is committed, and `subscribe`
 * hears the keys that other tabs changed.
 */
export interface IntentStore {
  read(key: string): Promise<string | null>;
  write(key: string, text: string): Promise<void>;
  remove(key: string): Promise<void>;
  subscribe(listener: (key: string) => void): () => void;
}

export interface IndexedDbIntentStoreOptions {
  /** The database name. Defaults to `elnor-intents`. */
  name?: string;
  /** Defaults to `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
  /** Defaults to `new BroadcastChannel('elnor-intents')`. */
  channel?: () => BroadcastChannel;
}

/** The IndexedDB intent store, coherent across tabs. Throws a TypeError when IndexedDB is not available. */
export function indexedDbIntentStore(options?: IndexedDbIntentStoreOptions): IntentStore;

export interface IntentJournalOptions {
  /** Defaults to `indexedDbIntentStore()`. */
  store?: IntentStore;
  /** The account the intents belong to. A journal only reads and sends intents of its scope. */
  scope: string;
  /** Defaults to `navigator.locks`. */
  locks?: LockManager;
  /** Defaults to `crypto.randomUUID()`. */
  createKey?: () => string;
  /** Backoff after a failure, doubling from `firstMs` up to `maxMs`. Defaults to 1000 and 60000. */
  retry?: {firstMs: number; maxMs: number};
}

export interface IntentJournal {
  operation<I, R, E>(name: string, config: {version: number; transport: IntentTransport}): DurableOperation<I, R, E>;
  /** Reconciles every stored intent of the scope, again when the browser reports a connection. */
  start(): void;
  /** Aborts the requests in flight and sends nothing more until `start`. */
  stop(): void;
  /** Resolves to the terminal records that no member consumed: `await journal.outcomes()`. */
  outcomes(): Promise<ReadonlyArray<UnconsumedOutcome>>;
  /** Resolves to the records that cannot be sent: `await journal.blocked()`. */
  blocked(): Promise<ReadonlyArray<BlockedRecord>>;
  /** Called when the provider refuses the scope for the current session; the journal sends nothing until `start`. */
  onPaused(listener: (reason: 'scope-refused') => void): () => void;
}

/** Throws a TypeError when the Web Locks API is not available, or when no store is given and IndexedDB is not available. */
export function createIntentJournal(options: IntentJournalOptions): IntentJournal;
