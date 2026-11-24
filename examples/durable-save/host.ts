import {createIntentJournal, httpIntentTransport} from "../../src/intents.mjs";
import type {DurableOperation, IntentStore} from "../../src/intents.mjs";

export type Note = {text: string; revision: number};
export type NoteRejection = {kind: "invalid"; message: string} | {kind: "conflict"; current: Note};
export type Notes = {save: DurableOperation<Note, {revision: number}, NoteRejection>};

type Options = {
  store?: IntentStore;
  account: string;
  baseUrl: string;
  fetch?: typeof fetch;
  locks?: LockManager;
};

// One journal per signed-in account. Call journal.stop() before the session
// ends or changes, and create a new one for the next account.
export function createNotes({store, account, baseUrl, fetch, locks}: Options) {
  const journal = createIntentJournal({store, scope: account, locks});
  const transport = httpIntentTransport({baseUrl, fetch, headers: () => ({"X-Fixture-Account": account})});
  const notes: Notes = {save: journal.operation("notes.save", {version: 1, transport})};
  journal.start();
  return {journal, notes};
}
