export type SaveIntent = Readonly<{key: string; text: string}>;
export type SaveReceipt = Readonly<{key: string; text: string}>;
export type SaveAttempt = Readonly<{input: string; intent: SaveIntent}>;
