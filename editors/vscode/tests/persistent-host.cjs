const fs = require('node:fs');
const path = require('node:path');

const state = path.resolve(__dirname, '../../../.elnor/spikes/004');
const expectedWorkspace = path.join(state, 'editor-workspace');
const runs = path.join(state, 'editor-runs');
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function persistentSession({mode, developmentMode, workspace, env = process.env}) {
  if (env.ELNOR_EDITOR_MODE !== 'persistent') return null;
  if (developmentMode === undefined || mode !== developmentMode || !workspace || !samePath(path.resolve(workspace), expectedWorkspace))
    throw Error('Persistent tests require the development host and the isolated fixture workspace');
  const report = path.resolve(env.ELNOR_EDITOR_REPORT || '.');
  const directory = path.dirname(report);
  if (!samePath(path.dirname(directory), runs) || !/^run-[\w-]+$/.test(path.basename(directory)) || path.basename(report) !== 'result.json'
    || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(env.ELNOR_EDITOR_RUN_ID || ''))
    throw Error('Persistent tests require an isolated report path and a run UUID');
  return {report, directory, runId: env.ELNOR_EDITOR_RUN_ID, workspace: expectedWorkspace};
}

async function runPersistentSuite({session, vscode, run}) {
  const hostFile = path.join(session.directory, 'host.json');
  const host = {runId: session.runId, launchMode: 'persistent', workspace: session.workspace,
    trusted: vscode.workspace.isTrusted,
    trustEnabled: vscode.workspace.getConfiguration('security.workspace.trust').get('enabled', true),
    startedAt: new Date().toISOString(), completed: false};
  // Exclusive creation prevents an activation/reload from running the suite twice.
  fs.writeFileSync(hostFile, JSON.stringify(host, null, 2), {flag: 'wx'});
  try {
    if (!host.trusted || host.trustEnabled !== true) throw Error('Persistent tests require granted trust with Workspace Trust enabled');
    await run(); host.completed = true;
  } catch (error) {
    host.error = error.stack || String(error);
  } finally {
    host.finishedAt = new Date().toISOString();
    fs.writeFileSync(hostFile, JSON.stringify(host, null, 2));
    // Only this launcher's isolated application/profile is used for the suite.
    await vscode.commands.executeCommand('workbench.action.quit');
  }
}
async function waitForWorkspaceTrust(vscode, subscriptions) {
  if (vscode.workspace.isTrusted) return;
  await new Promise(resolve => {
    const subscription = vscode.workspace.onDidGrantWorkspaceTrust(() => { subscription.dispose(); resolve(); });
    subscriptions.push(subscription);
  });
}
module.exports = {persistentSession, runPersistentSuite, waitForWorkspaceTrust, expectedWorkspace, runs};
