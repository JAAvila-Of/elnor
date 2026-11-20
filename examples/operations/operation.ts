export type OperationState = Readonly<{
  status: "idle" | "pending" | "success" | "error";
  error: unknown;
}>;

export type OperationResult<Value> =
  | Readonly<{kind: "success"; value: Value}>
  | Readonly<{kind: "error"; error: unknown}>
  | Readonly<{kind: "ignored" | "cancelled" | "superseded" | "disposed"}>;

type Work<Input, Value> = (input: Input, signal: AbortSignal) => Promise<Value>;
type Cancel = Readonly<{cancel(): void}>;

export type Operation<Input, Value> = Readonly<{
  run(input: Input, work: Work<Input, Value>): Promise<OperationResult<Value>>;
  dispose(): void;
}>;
export type ConfiguredOperation<Input, Value> = Readonly<{
  run(input: Input): Promise<OperationResult<Value>>;
  dispose(): void;
}>;
export type CancellableOperation<Input, Value> = Operation<Input, Value> & Cancel;
export type LatestOperation<Input, Value> = CancellableOperation<Input, Value>;

type Policy = {policy: "latest"} | {policy: "single-flight"; cancellable?: boolean};
type Options<Input, Value> = {
  publish(state: OperationState): void | undefined;
  success?(value: Value, input: Input): void | undefined;
};
type ConfiguredOptions<Input, Value> = Options<NoInfer<Input>, NoInfer<Value>> & {work: Work<Input, Value>};
type Flight = {controller: AbortController; reason?: "cancelled" | "superseded" | "disposed"};

export function idleOperationState(): OperationState {
  return Object.freeze({status: "idle", error: undefined});
}

export function createOperation<Input, Value>(options: ConfiguredOptions<Input, Value> & {policy: "latest"}): ConfiguredOperation<Input, Value> & Cancel;
export function createOperation<Input, Value>(options: ConfiguredOptions<Input, Value> & {policy: "single-flight"; cancellable: true}): ConfiguredOperation<Input, Value> & Cancel;
export function createOperation<Input, Value>(options: ConfiguredOptions<Input, Value> & {policy: "single-flight"; cancellable?: boolean}): ConfiguredOperation<Input, Value>;
export function createOperation<Input, Value>(options: Options<Input, Value> & {policy: "latest"; work?: never}): LatestOperation<Input, Value>;
export function createOperation<Input, Value>(options: Options<Input, Value> & {policy: "single-flight"; cancellable: true; work?: never}): CancellableOperation<Input, Value>;
export function createOperation<Input, Value>(options: Options<Input, Value> & {policy: "single-flight"; cancellable?: boolean; work?: never}): Operation<Input, Value>;
// TypeScript reports the last overload's mismatch. Check the shared options
// here so a bad callback is reported on the callback under either policy.
export function createOperation<Input, Value>(
  options: Options<NoInfer<Input>, NoInfer<Value>> & Policy & ({work: Work<Input, Value>} | {work?: never})
): Pick<Operation<Input, Value>, "dispose">;
export function createOperation<Input, Value>(
  options: Options<Input, Value> & Policy & {work?: Work<Input, Value>}
): Operation<Input, Value> | CancellableOperation<Input, Value>
  | ConfiguredOperation<Input, Value> | (ConfiguredOperation<Input, Value> & Cancel) {
  const policy = options.policy;
  if (policy !== "latest" && policy !== "single-flight") throw new TypeError("Unsupported operation policy");
  const cancellable = policy === "latest" || options.cancellable === true;
  let configuredWork = options.work;
  let publish: Options<Input, Value>["publish"] | null = options.publish;
  let success = options.success;
  let current: Flight | null = null;
  let disposed = false;
  let revision = 0;
  const owns = (flight: Flight) => !disposed && current === flight && !flight.controller.signal.aborted;
  const retired = (flight: Flight): OperationResult<Value> => ({kind: flight.reason ?? "superseded"});
  const update = (status: OperationState["status"], error: unknown = undefined) => publish?.(Object.freeze({status, error}));

  async function run(input: Input, work?: Work<Input, Value>): Promise<OperationResult<Value>> {
    if (disposed) return {kind: "disposed"};
    if (policy === "single-flight" && current !== null) return {kind: "ignored"};
    const previous = current;
    const flight: Flight = {controller: new AbortController()};
    current = flight;
    revision++;
    if (previous) {
      previous.reason = "superseded";
      previous.controller.abort();
    }
    if (!owns(flight)) return retired(flight);
    try {
      update("pending");
    } catch (error) {
      if (current === flight) {
        current = null;
        flight.reason = "cancelled";
        flight.controller.abort();
      }
      throw error;
    }
    if (!owns(flight)) return retired(flight);
    let value: Value;
    try {
      const execute = configuredWork ?? work;
      if (!execute) throw new TypeError("Operation work is required");
      value = await execute(input, flight.controller.signal);
    } catch (error) {
      if (!owns(flight)) return retired(flight);
      current = null;
      try { update("error", error); }
      catch (publicationError) { throw new AggregateError([error, publicationError], "Operation and publication failed"); }
      return {kind: "error", error};
    }
    if (!owns(flight)) return retired(flight);
    const failures: unknown[] = [];
    try { success?.(value, input); }
    catch (error) { failures.push(error); }
    if (owns(flight)) {
      current = null;
      try { update("success"); }
      catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Operation callbacks failed");
    return {kind: "success", value};
  }

  function cancel(): void {
    if (disposed) return;
    const version = ++revision;
    const flight = current;
    current = null;
    if (flight) {
      flight.reason = "cancelled";
      flight.controller.abort();
    }
    if (!disposed && version === revision) update("idle");
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    revision++;
    const flight = current;
    current = null;
    configuredWork = undefined;
    publish = null;
    success = undefined;
    if (flight) {
      flight.reason = "disposed";
      flight.controller.abort();
    }
  }

  return Object.freeze(cancellable ? {run, dispose, cancel} : {run, dispose});
}
