type StandardIssue = {
  readonly message: string;
  readonly path?: readonly (PropertyKey | {readonly key: PropertyKey})[];
};

type Success<Output> = {readonly value: Output; readonly issues?: undefined};
type Failure = {readonly issues: readonly StandardIssue[]};
type StandardSchema = {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (input: unknown) => Success<unknown> | Failure | Promise<Success<unknown> | Failure>;
    readonly types?: {readonly input: unknown; readonly output: unknown};
  };
};

type FormResult<Output> =
  | Success<Output>
  | (Failure & {readonly value?: undefined});
type SchemaOutput<Schema extends StandardSchema> = Extract<
  Awaited<ReturnType<Schema['~standard']['validate']>>,
  Success<unknown>
>['value'];
type SchemaInput<Schema extends StandardSchema> = Schema['~standard'] extends {
  readonly types?: {readonly input: infer Input};
} ? Input : never;
type InputPath<Value, Depth extends 0[] = []> =
  Depth['length'] extends 4 ? never
    : Value extends readonly (infer Item)[]
      ? readonly [number] | readonly [number, ...InputPath<Item, [...Depth, 0]>]
    : Value extends object ? {
      [Key in Extract<keyof Value, string>]:
        | readonly [Key]
        | readonly [Key, ...InputPath<Value[Key], [...Depth, 0]>];
    }[Extract<keyof Value, string>]
    : never;

const noIssues: readonly StandardIssue[] = Object.freeze([]);

function issueKeys(issue: StandardIssue) {
  return issue.path?.map(segment => typeof segment === 'object' ? segment.key : segment);
}

function matchesPath(keys: readonly PropertyKey[] | undefined, path: readonly (string | number)[]) {
  return keys?.length === path.length && path.every((key, index) => keys[index] === key);
}

export function bindFormSchema<Schema extends StandardSchema, Field extends Extract<keyof SchemaOutput<Schema>, string>>(
  schema: Schema,
  fields: readonly Field[]
) {
  return bindFieldMessages<Schema, Field>(schema, fields.map(field => [field, [field]]));
}

export function bindFormPaths<
  Schema extends StandardSchema,
  const Paths extends Readonly<Record<string, InputPath<SchemaInput<NoInfer<Schema>>>>>
>(schema: Schema, paths: Paths) {
  type Field = Extract<keyof Paths, string>;
  const fields = Object.keys(paths) as Field[];
  return bindFieldMessages<Schema, Field>(schema, fields.map(field => [field, [...paths[field]]]));
}

function bindFieldMessages<Schema extends StandardSchema, Field extends string>(
  schema: Schema,
  bindings: readonly (readonly [Field, readonly (string | number)[]])[]
) {
  type Output = SchemaOutput<Schema>;
  type FieldErrors = Readonly<Record<Field, string>>;
  const empty = Object.freeze(Object.fromEntries(bindings.map(([field]) => [field, '']))) as FieldErrors;

  function validate(input: unknown): FormResult<Output> {
    const result = schema['~standard'].validate(input);
    if ('then' in result) {
      void Promise.resolve(result).catch(() => {});
      throw new TypeError('Form schema must validate synchronously');
    }
    // A failing implementation can retain its intermediate value.
    if (result.issues) return {issues: result.issues};
    return {value: result.value as Output};
  }

  function fieldErrors(result?: FormResult<Output>): FieldErrors {
    if (!result?.issues?.length) return empty;
    const issues = result.issues.map(issue => ({
      keys: issueKeys(issue),
      message: issue.message
    }));
    return Object.freeze(Object.fromEntries(bindings.map(([field, path]) => {
      const issue = issues.find(({keys}) => matchesPath(keys, path));
      return [field, issue?.message ?? ''];
    }))) as FieldErrors;
  }

  function unboundIssues(result?: FormResult<Output>): readonly StandardIssue[] {
    if (!result?.issues?.length) return noIssues;
    const issues = result.issues.filter(issue => {
      const keys = issueKeys(issue);
      return !bindings.some(([, path]) => matchesPath(keys, path));
    });
    return issues.length ? Object.freeze(issues) : noIssues;
  }

  return {validate, fieldErrors, unboundIssues};
}
