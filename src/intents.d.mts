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

export interface IntentJournalOptions {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
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
  outcomes(): ReadonlyArray<UnconsumedOutcome>;
  blocked(): ReadonlyArray<BlockedRecord>;
  /** Called when the provider refuses the scope for the current session; the journal sends nothing until `start`. */
  onPaused(listener: (reason: 'scope-refused') => void): () => void;
}

/** Throws a TypeError when the Web Locks API is not available. */
export function createIntentJournal(options: IntentJournalOptions): IntentJournal;
