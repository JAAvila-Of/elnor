const suite = 'elnor-native-mvp-15-v1';
const expectedChecks = Object.freeze([
  'complete a partial prop and apply its source edit',
  'fix a mapped type error without saving',
  'navigate to the original component declaration',
  'rename a prop in the editor including a closed consumer',
  'break and repair a declaration without restarting the extension',
  'edit during worker analysis without publishing stale diagnostics or blocking the host',
  'preserve divergent alias text and expose a recoverable conflict',
  'apply rename to every open alias URI and one consumer without saving',
  'close an unsaved alias without replacing another view from disk',
  'unsaved TypeScript types update exact Surface diagnostics',
  'navigate to an unsaved TypeScript range and reject cross-language rename',
  'TypeScript edits invalidate worker analysis and survive restart until discard',
  'format an unsaved Surface buffer through the native provider without saving',
  'saved transitive TypeScript changes refresh Surface diagnostics through the native watcher',
  'native watcher refreshes deleted and recreated TypeScript dependencies',
]);

function validateEditorReport(result, {runId, exitCode, launchMode}) {
  if (exitCode !== 0) throw Error(`VS Code exited unsuccessfully (${exitCode})`);
  if (!result || result.suite !== suite || !runId || result.runId !== runId)
    throw Error('Editor report does not belong to the current suite and run');
  if (launchMode && result.launchMode !== launchMode) throw Error('Editor report has the wrong launch mode');
  if (result.passed !== true || result.trusted !== true || result.sourceFilesUnchanged !== true || result.error)
    throw Error('Editor report did not establish a trusted, passing run with restored fixture sources');
  if (!result.editor || !result.node || !Array.isArray(result.checks) || result.checks.length !== expectedChecks.length)
    throw Error('Editor report is incomplete');
  for (let i = 0; i < expectedChecks.length; i++) {
    const check = result.checks[i];
    if (check?.name !== expectedChecks[i] || !Number.isFinite(check.elapsedMs) || check.elapsedMs < 0)
      throw Error(`Editor report is missing a completed task: ${expectedChecks[i]}`);
  }
  return result;
}
module.exports = {suite, expectedChecks, validateEditorReport};
