type FieldResult<Value> = {value: Value; message?: undefined} | {value?: undefined; message: string};
type InputMode = 'draft' | 'wire';
type Field<Value> = (input: unknown, mode: InputMode) => FieldResult<Value>;
export type TaskInputIssue = {message: string; path?: readonly string[]};
type Result<Value> = {value: Value; issues?: undefined} | {value?: undefined; issues: readonly TaskInputIssue[]};

function objectSchema<Fields extends Record<string, Field<unknown>>>(fields: Fields) {
  type Output = {
    [Key in keyof Fields]: NonNullable<ReturnType<Fields[Key]>['value']>;
  };

  function validate(input: unknown, mode: InputMode): Result<Output> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return {issues: [{message: 'Enter a task draft.'}]};
    }

    const source = input as Record<string, unknown>;
    const values: [string, unknown][] = [];
    const issues: TaskInputIssue[] = [];
    for (const [key, field] of Object.entries(fields)) {
      const result = field(Object.hasOwn(source, key) ? source[key] : undefined, mode);
      if (result.message !== undefined) {
        issues.push({message: result.message, path: [key]});
      } else {
        values.push([key, result.value]);
      }
    }
    if (issues.length) return {issues};
    return {value: Object.fromEntries(values) as Output};
  }

  return {
    '~standard': {version: 1 as const, vendor: 'elnor-task-desk', validate: (input: unknown) => validate(input, 'draft')},
    validateWire: (input: unknown) => validate(input, 'wire'),
  };
}

export function taskTitleMinimumProblem(title: string): string {
  return title.trim().length < 3 ? 'Use at least 3 characters for the title.' : '';
}

function text(label: string, max: number, problem?: (value: string) => string): Field<string> {
  return (input, mode) => {
    if (typeof input !== 'string') return {message: `${label} must be text.`};
    const value = mode === 'draft' ? input.trim() : input;
    if (value.length > max) return {message: `${label} must have at most ${max} characters.`};
    const message = mode === 'draft' ? problem?.(value) : undefined;
    return message ? {message} : {value};
  };
}

const priorities = ['normal', 'high'] as const;

function priority(input: unknown): FieldResult<(typeof priorities)[number]> {
  const value = priorities.find(option => option === input);
  return value ? {value} : {message: `Priority must be ${priorities.join(' or ')}.`};
}

export const taskInputSchema = objectSchema({
  title: text('Title', 200, taskTitleMinimumProblem),
  assignee: text('Assignee', 120),
  description: text('Description', 10000),
  priority
});

export const validateTaskInput = taskInputSchema['~standard'].validate;
// Wire fields are checked as submitted. The ledger owns durable business-rule rejections.
export const validateTaskWireFields = taskInputSchema.validateWire;
export type TaskInput = NonNullable<ReturnType<typeof validateTaskInput>['value']>;
