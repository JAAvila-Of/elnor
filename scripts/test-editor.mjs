// Run real VS Code provider tests in an isolated profile; install nothing globally.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import reportContract from '../editors/vscode/tests/report-contract.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const debugPort = process.env.ELNOR_EDITOR_DEBUG_PORT;
if (debugPort && (!/^\d+$/.test(debugPort) || Number(debugPort) < 1024 || Number(debugPort) > 65535))
  throw Error('ELNOR_EDITOR_DEBUG_PORT must be a port between 1024 and 65535');
const executable = process.env.VSCODE_EXECUTABLE ?? (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe') : undefined);
if (!executable || !fs.existsSync(executable)) throw Error('Set VSCODE_EXECUTABLE to a local VS Code executable. No editor is downloaded automatically.');
const runs = path.resolve(root, '.elnor/spikes/004/editor-runs');
fs.mkdirSync(runs, {recursive: true});
const run = fs.mkdtempSync(path.join(runs, 'run-'));
const state = path.resolve(root, '.elnor/spikes/004');
const workspace = path.join(state, 'editor-workspace');
fs.mkdirSync(workspace, {recursive: true});
const badge = 'component Badge(label: string) {\r\n  ui {\r\n    span label\r\n  }\r\n}\r\n';
const screen = 'import Badge from "./Badge.eln";\r\ncomponent Screen() {\r\n  // café 😀\r\n  ui {\r\n\tBadge label="Ready"\r\n  }\r\n}\r\n';
fs.writeFileSync(path.join(workspace, 'Badge.eln'), badge);
fs.writeFileSync(path.join(workspace, 'Screen.eln'), screen);
fs.writeFileSync(path.join(workspace, 'Other.eln'), screen.replaceAll('Screen', 'Other'));
fs.writeFileSync(path.join(workspace, 'AliasOrigin.eln'), badge.replaceAll('Badge', 'AliasOrigin'));
fs.writeFileSync(path.join(workspace, 'AliasConsumer.eln'), screen.replaceAll('Badge', 'AliasOrigin').replaceAll('Screen', 'AliasConsumer'));
fs.writeFileSync(path.join(workspace, 'Model.mts'), 'export interface Model { label: string; }\r\n');
fs.writeFileSync(path.join(workspace, 'TypeConsumer.eln'), 'import type {Model} from "./Model.mjs";\r\ncomponent TypeConsumer(model: Model) {\r\n  ui {\r\n    span model.label.toUpperCase()\r\n  }\r\n}\r\n');
fs.writeFileSync(path.join(workspace, 'DiskLeaf.mts'), 'export interface Model { label: string; }\r\n');
fs.writeFileSync(path.join(workspace, 'DiskModel.mts'), 'export type {Model} from "./DiskLeaf.mjs";\r\n');
fs.writeFileSync(path.join(workspace, 'DiskConsumer.eln'), 'import type {Model} from "./DiskModel.mjs";\r\ncomponent DiskConsumer(model: Model) {\r\n  ui {\r\n    span model.label.toUpperCase()\r\n  }\r\n}\r\n');
const report = path.join(run, 'result.json');
const runId = randomUUID();
const env = {...process.env, ELNOR_EDITOR_REPORT: report, ELNOR_EDITOR_RUN_ID: runId, ELNOR_EDITOR_MODE: 'persistent'};
delete env.ELECTRON_RUN_AS_NODE;
console.log(`Editor test run: ${run}`);
console.log('If VS Code requests workspace trust, review only editor-workspace. Tests wait for your choice; no trust setting is changed by this script.');
console.log('Persistent development host: a trust decision should survive subsequent runs; extensionTestsPath is not used.');
const log = fs.openSync(path.join(run, 'editor.log'), 'a');
const child = spawn(executable, [workspace, '--new-window', '--skip-welcome', '--skip-release-notes',
  `--user-data-dir=${path.join(state, 'editor-profile')}`, `--extensions-dir=${path.join(state, 'editor-extensions')}`,
  `--extensionDevelopmentPath=${path.join(root, 'editors/vscode')}`,
  '--goto', path.join(workspace, 'Screen.eln'),
  ...(debugPort ? [`--remote-debugging-port=${debugPort}`] : []),
], {env, stdio: ['ignore', log, log], windowsHide: false});
fs.closeSync(log);
console.log(`Owned VS Code process: ${child.pid}`);
const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
if (!fs.existsSync(report)) throw Error(`VS Code exited (${exitCode}) without a test result; this is not a passing run.`);
const result = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log(JSON.stringify(result, null, 2));
reportContract.validateEditorReport(result, {runId, exitCode, launchMode: 'persistent'});
const host = JSON.parse(fs.readFileSync(path.join(run, 'host.json'), 'utf8'));
if (host.runId !== runId || host.completed !== true || host.trusted !== true || host.trustEnabled !== true || host.error)
  throw Error('The persistent host did not complete with Workspace Trust enabled');
