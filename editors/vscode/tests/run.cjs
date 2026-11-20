const assert = require('node:assert/strict');
const fs = require('node:fs');
const vscode = require('vscode');
const {suite, validateEditorReport} = require('./report-contract.cjs');

exports.run = async function () {
  const checks = [];
  const observations = [];
  let aliasLink;
  const diskOriginals = new Map();
  const requests = [];
  const root = vscode.workspace.workspaceFolders[0].uri;
  const uri = name => vscode.Uri.joinPath(root, name + '.eln');
  const diagnostics = doc => vscode.languages.getDiagnostics(doc.uri).filter(d => d.source?.startsWith('Elnor'));
  async function waitFor(predicate, description) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error(`Timed out: ${description}`);
  }
  async function check(name, action) {
    const start = performance.now();
    await action();
    checks.push({name, elapsedMs: Math.round(performance.now() - start)});
  }
  async function request(name, action) {
    const start = performance.now();
    const response = await action();
    requests.push({name, elapsedMs: Math.round(performance.now() - start)});
    return response;
  }
  async function replace(doc, text) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
    assert.equal(await vscode.workspace.applyEdit(edit), true);
  }
  const result = {suite, runId: process.env.ELNOR_EDITOR_RUN_ID, launchMode: process.env.ELNOR_EDITOR_MODE || 'extension-tests', editor: vscode.version, node: process.version, trusted: vscode.workspace.isTrusted, checks, requests, observations, passed: false};
  try {
    if (!vscode.workspace.isTrusted) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { subscription.dispose(); reject(Error('Fixture workspace trust was not granted; no editor capability was validated.')); }, 120000);
        const subscription = vscode.workspace.onDidGrantWorkspaceTrust(() => { clearTimeout(timeout); subscription.dispose(); resolve(); });
      });
    }
    result.trusted = vscode.workspace.isTrusted;
    assert.equal(vscode.workspace.isTrusted, true, 'The fixture workspace needs explicit trust; tests never change Workspace Trust.');
    const extension = vscode.extensions.getExtension('elnor.surface-spike');
    assert.ok(extension, 'Surface extension must load in a real Extension Development Host');
    const api = await extension.activate();
    assert.ok(api.testing, 'native tests require the real async adapter');
    const screen = await vscode.workspace.openTextDocument(uri('Screen'));
    const badge = await vscode.workspace.openTextDocument(uri('Badge'));
    await vscode.window.showTextDocument(screen);
    assert.equal(screen.languageId, 'surface');
    const original = screen.getText();
    const originalBadge = badge.getText();

    await check('complete a partial prop and apply its source edit', async () => {
      const partial = original.replace('label="Ready"', 'la');
      await replace(screen, partial);
      const cursor = screen.positionAt(partial.indexOf('Badge la') + 'Badge la'.length);
      const completion = await request('completion-first', () => vscode.commands.executeCommand('vscode.executeCompletionItemProvider', screen.uri, cursor));
      const item = completion.items.find(item => item.label === 'label' && item.detail === 'Elnor Surface');
      assert.ok(item, 'label completion must come through the editor provider');
      const warm = await request('completion-repeat', () => vscode.commands.executeCommand('vscode.executeCompletionItemProvider', screen.uri, cursor));
      assert.ok(warm.items.some(item => item.label === 'label' && item.detail === 'Elnor Surface'));
      assert.ok(item.range instanceof vscode.Range);
      assert.equal(screen.getText(item.range), 'la');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(screen.uri, item.range, item.insertText);
      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.match(screen.getText(), /Badge label\r?\n/);
      // Completing a name is not a valid prop assignment yet. Finish typing.
      await replace(screen, original);
      await waitFor(() => diagnostics(screen).length === 0, 'completed prop clears diagnostics');
    });

    await check('fix a mapped type error without saving', async () => {
      const invalid = original.replace('label="Ready"', 'missing="Ready"');
      await replace(screen, invalid);
      await waitFor(() => diagnostics(screen).some(d => d.code === 'TS2353'), 'mapped unknown prop diagnostic');
      const error = diagnostics(screen).find(d => d.code === 'TS2353');
      assert.equal(screen.getText(error.range), 'missing');
      assert.equal(error.range.start.line, 4);
      await replace(screen, original);
      await waitFor(() => diagnostics(screen).length === 0, 'fixed diagnostic clears');
      assert.equal(fs.readFileSync(screen.uri.fsPath, 'utf8'), original, 'type error was fixed without saving');
    });

    await check('navigate to the original component declaration', async () => {
      const definitions = await request('definition', () => vscode.commands.executeCommand('vscode.executeDefinitionProvider', screen.uri,
        screen.positionAt(screen.getText().indexOf('Badge label') + 2)));
      const target = definitions.find(d => d.uri?.fsPath === badge.uri.fsPath);
      assert.ok(target);
      assert.equal(badge.getText(target.range), 'Badge');
    });

    await check('rename a prop in the editor including a closed consumer', async () => {
      const edits = await request('rename', () => vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', badge.uri,
        badge.positionAt(badge.getText().indexOf('label: string') + 2), 'caption'));
      assert.ok(edits instanceof vscode.WorkspaceEdit);
      assert.equal(edits.entries().length, 3);
      assert.equal(await vscode.workspace.applyEdit(edits), true);
      const other = await vscode.workspace.openTextDocument(uri('Other'));
      assert.match(badge.getText(), /caption: string/);
      assert.match(badge.getText(), /span caption/);
      assert.match(screen.getText(), /Badge caption=/);
      assert.match(other.getText(), /Badge caption=/);
      await waitFor(() => diagnostics(screen).length === 0, 'renamed consumer is valid');
      assert.equal(fs.readFileSync(badge.uri.fsPath, 'utf8'), originalBadge, 'rename did not save source files');
    });

    await check('break and repair a declaration without restarting the extension', async () => {
      const healthy = badge.getText();
      await replace(badge, healthy.slice(0, healthy.lastIndexOf('}')));
      await waitFor(() => diagnostics(badge).some(d => String(d.code).startsWith('ELN-')), 'incomplete declaration diagnostic');
      const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', screen.uri,
        screen.positionAt(screen.getText().indexOf('Badge caption') + 2));
      assert.ok(definitions.some(d => d.uri?.fsPath === badge.uri.fsPath));
      await replace(badge, healthy);
      await waitFor(() => diagnostics(badge).length === 0 && diagnostics(screen).length === 0, 'repair removes obsolete errors');
      await replace(badge, healthy.replace('    span caption', '    p "unterminated\r\n    span caption'));
      await waitFor(() => diagnostics(badge).length > 0, 'broken UI string is reported');
      const preserved = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', screen.uri,
        screen.positionAt(screen.getText().indexOf('Badge caption') + 2));
      assert.ok(preserved.some(d => d.uri?.fsPath === badge.uri.fsPath), 'broken UI string preserves the component contract');
      const local = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', badge.uri,
        badge.positionAt(badge.getText().lastIndexOf('span caption') + 6));
      assert.ok(local.some(d => d.uri?.fsPath === badge.uri.fsPath && badge.getText(d.range) === 'caption'), 'intact sibling reference survives');
      observations.push('A broken single-line UI string preserves the component contract; malformed headers and block comments remain recovery boundaries.');
      await replace(badge, healthy);
      await waitFor(() => diagnostics(badge).length === 0, 'recovery after malformed string');
    });

    await check('edit during worker analysis without publishing stale diagnostics or blocking the host', async () => {
      const audit = [];
      const unsubscribe = api.testing.onEvent(event => audit.push({event, at: api.testing.status()}));
      try {
        await api.testing.restart();
        const stable = screen.getText();
        const oldEpoch = api.testing.status().epoch;
        let finished = false;
        const oldRefresh = api.testing.refreshDiagnostics().finally(() => { finished = true; });
        await waitFor(() => audit.some(({event}) => event.type === 'dispatched' && event.method === 'diagnostics'), 'real worker request dispatch');
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(finished, false, 'extension-host timer runs while cold worker analysis is pending');
        await replace(screen, stable.replace('caption=', 'missing='));
        const changedAt = audit.length;
        await oldRefresh;
        assert.ok(audit.some(({event}) => event.type === 'stale' && event.snapshot.epoch === oldEpoch));
        await api.testing.refreshDiagnostics();
        const error = diagnostics(screen).find(d => d.code === 'TS2353');
        assert.ok(error);
        assert.equal(screen.getText(error.range), 'missing');
        assert.match(error.message, /caption/, 'restart replayed the unsaved renamed prop instead of disk sources');
        assert.ok(audit.slice(changedAt).every(({event}) => event.type !== 'published' || event.snapshot.epoch !== oldEpoch));
        assert.ok(audit.every(({event, at}) => event.type !== 'published'
          || (event.snapshot.epoch === at.epoch && event.snapshot.generation === at.generation)));
        await replace(screen, stable);
        await api.testing.refreshDiagnostics();
        assert.deepEqual(diagnostics(screen), []);
        observations.push('The extension-host timer ran during cold worker analysis; an intervening edit discarded the old batch and restart preserved unsaved sources.');
      } finally { unsubscribe(); }
    });
    const origin = await vscode.workspace.openTextDocument(uri('AliasOrigin'));
    const consumer = await vscode.workspace.openTextDocument(uri('AliasConsumer'));
    const savedOrigin = origin.getText(), savedConsumer = consumer.getText();
    aliasLink = uri('AliasView').fsPath;
    fs.symlinkSync(origin.uri.fsPath, aliasLink, 'file');
    const alias = await vscode.workspace.openTextDocument(uri('AliasView'));
    await vscode.window.showTextDocument(origin, {preview: false});
    await vscode.window.showTextDocument(alias, {preview: false});
    assert.notEqual(alias, origin, 'VS Code must expose distinct logical documents for this experiment');
    assert.notEqual(alias.uri.toString(), origin.uri.toString());
    const dirtyOrigin = savedOrigin.replace('span label', 'span label + "!"');

    await check('preserve divergent alias text and expose a recoverable conflict', async () => {
      await replace(origin, dirtyOrigin);
      await api.testing.refreshDiagnostics();
      assert.equal(alias.getText(), savedOrigin, 'editing one URI does not silently replace another tab');
      assert.equal(origin.getText(), dirtyOrigin);
      await waitFor(() => diagnostics(alias).some(d => d.code === 'ELN-SOURCE-CONFLICT'), 'visible alias conflict');
      const blocked = await vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', origin.uri,
        origin.positionAt(origin.getText().indexOf('label: string') + 2), 'caption').then(() => false, () => true);
      assert.equal(blocked, true, 'rename must reject while an open alias has different text');
      await replace(alias, dirtyOrigin);
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(alias), []);
      assert.deepEqual(diagnostics(origin), []);
    });

    await check('apply rename to every open alias URI and one consumer without saving', async () => {
      const edits = await vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', origin.uri,
        origin.positionAt(origin.getText().indexOf('label: string') + 2), 'caption');
      assert.ok(edits instanceof vscode.WorkspaceEdit);
      assert.equal(edits.entries().length, 3);
      assert.deepEqual(new Set(edits.entries().map(([target]) => target.toString())),
        new Set([origin.uri.toString(), alias.uri.toString(), consumer.uri.toString()]));
      assert.equal(await vscode.workspace.applyEdit(edits), true);
      assert.match(origin.getText(), /caption: string/);
      assert.equal(alias.getText(), origin.getText());
      assert.match(consumer.getText(), /AliasOrigin caption=/);
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(origin), []);
      assert.deepEqual(diagnostics(alias), []);
      assert.deepEqual(diagnostics(consumer), []);
    });

    await check('close an unsaved alias without replacing another view from disk', async () => {
      const retained = origin.getText();
      await vscode.window.showTextDocument(alias, {preview: false});
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      await waitFor(() => !vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input?.uri?.toString() === alias.uri.toString())), 'alias tab close');
      await api.testing.refreshDiagnostics();
      assert.equal(origin.getText(), retained);
      assert.deepEqual(diagnostics(origin), []);
      assert.deepEqual(diagnostics(consumer), []);
      await api.testing.restart();
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(consumer), [], 'restart retains the remaining dirty physical buffer');
      const reopened = await vscode.workspace.openTextDocument(uri('AliasView'));
      await vscode.window.showTextDocument(reopened, {preview: false});
      assert.equal(reopened.getText(), savedOrigin);
      await api.testing.refreshDiagnostics();
      assert.ok(diagnostics(reopened).some(d => d.code === 'ELN-SOURCE-CONFLICT'));
      assert.equal(origin.getText(), retained);
      await replace(reopened, retained);
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(reopened), []);
      observations.push('VS Code exposed two independent URI documents. Divergence was reported without overwriting either tab; reconciliation, rename, close and restart preserved unsaved source.');
    });
    const typeConsumer = await vscode.workspace.openTextDocument(uri('TypeConsumer'));
    const model = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, 'Model.mts'));
    const savedModel = model.getText(), savedTypeConsumer = typeConsumer.getText();
    await check('unsaved TypeScript types update exact Surface diagnostics', async () => {
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(typeConsumer), []);
      const epoch = api.testing.status().epoch;
      await replace(model, savedModel.replace('string', 'number'));
      await api.testing.refreshDiagnostics();
      assert.ok(api.testing.status().epoch > epoch);
      const error = diagnostics(typeConsumer).find(d => d.code === 'TS2339');
      assert.ok(error);
      assert.equal(typeConsumer.getText(error.range), 'toUpperCase');
      assert.equal(fs.readFileSync(model.uri.fsPath, 'utf8'), savedModel);
      assert.deepEqual(diagnostics(model), [], 'ordinary TS diagnostics belong to the TypeScript extension');
      await replace(model, savedModel);
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(typeConsumer), []);
    });
    await check('navigate to an unsaved TypeScript range and reject cross-language rename', async () => {
      const dirty = '// café 😀\r\n\r\n' + savedModel;
      await replace(model, dirty);
      const position = typeConsumer.positionAt(savedTypeConsumer.indexOf('model.label') + 'model.'.length + 1);
      const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', typeConsumer.uri, position);
      const target = definitions.find(item => item.uri?.fsPath === model.uri.fsPath);
      assert.ok(target);
      assert.equal(model.offsetAt(target.range.start), dirty.indexOf('label:'));
      assert.equal(model.getText(target.range), 'label');
      await assert.rejects(vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', typeConsumer.uri, position, 'caption'), /Cross-language rename into TypeScript/);
      assert.equal(model.getText(), dirty);
      assert.equal(typeConsumer.getText(), savedTypeConsumer);
    });
    await check('TypeScript edits invalidate worker analysis and survive restart until discard', async () => {
      const audit = [];
      const unsubscribe = api.testing.onEvent(event => audit.push(event));
      try {
        await api.testing.restart();
        const epoch = api.testing.status().epoch;
        const oldRefresh = api.testing.refreshDiagnostics();
        await waitFor(() => audit.some(event => event.type === 'dispatched' && event.method === 'diagnostics'), 'analysis before TypeScript edit');
        await replace(model, model.getText().replace('string', 'number'));
        const changedAt = audit.length;
        await oldRefresh;
        assert.ok(audit.some(event => event.type === 'stale' && event.snapshot.epoch === epoch));
        assert.ok(audit.slice(changedAt).every(event => event.type !== 'published' || event.snapshot.epoch !== epoch));
        await api.testing.refreshDiagnostics();
        assert.ok(diagnostics(typeConsumer).some(d => d.code === 'TS2339'));
        await api.testing.restart();
        await api.testing.refreshDiagnostics();
        assert.ok(diagnostics(typeConsumer).some(d => d.code === 'TS2339'), 'restart replays the unsaved TypeScript dependency');
        await vscode.window.showTextDocument(model, {preview: false});
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        await waitFor(() => !vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input?.uri?.toString() === model.uri.toString())), 'TypeScript tab close');
        await api.testing.refreshDiagnostics();
        assert.deepEqual(diagnostics(typeConsumer), [], 'discard restores the saved dependency type');
        observations.push('Unsaved TypeScript changes advanced workspace versions, mapped Surface errors and navigation to current text, discarded in-flight results, survived worker restart and restored saved types on discard. Cross-language rename remained rejected.');
      } finally { unsubscribe(); }
    });
    await check('format an unsaved Surface buffer through the native provider without saving', async () => {
      const dirty = savedTypeConsumer.replace(/^ +/gm, '');
      await replace(typeConsumer, dirty);
      const epoch = api.testing.status().epoch;
      const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', typeConsumer.uri,
        {tabSize: 2, insertSpaces: true});
      assert.ok(edits?.length, 'the Surface formatter must return original-source edits');
      assert.equal(typeConsumer.getText(), dirty, 'requesting format does not apply it');
      assert.equal(api.testing.status().epoch, epoch);
      const application = new vscode.WorkspaceEdit();
      application.set(typeConsumer.uri, edits);
      assert.equal(await vscode.workspace.applyEdit(application), true);
      assert.equal(typeConsumer.getText(), savedTypeConsumer);
      await api.testing.refreshDiagnostics();
      assert.deepEqual(diagnostics(typeConsumer), []);
      assert.equal(fs.readFileSync(typeConsumer.uri.fsPath, 'utf8'), savedTypeConsumer);
    });
    const diskConsumer = await vscode.workspace.openTextDocument(uri('DiskConsumer'));
    const diskLeaf = vscode.Uri.joinPath(root, 'DiskLeaf.mts');
    const diskModel = vscode.Uri.joinPath(root, 'DiskModel.mts');
    for (const target of [diskConsumer.uri, diskLeaf, diskModel]) diskOriginals.set(target.fsPath, fs.readFileSync(target.fsPath, 'utf8'));
    const assertNeverOpened = () => {
      assert.ok(!vscode.workspace.textDocuments.some(doc => [diskLeaf.fsPath, diskModel.fsPath].includes(doc.uri.fsPath)),
        'disk dependencies must never acquire native TextDocument views');
    };
    // Establish the cached healthy graph before changing only saved dependencies.
    await api.testing.refreshDiagnostics();
    assert.deepEqual(diagnostics(diskConsumer), []);
    assertNeverOpened();
    const diskAudit = [];
    const stopDiskAudit = api.testing.onEvent(event => diskAudit.push(event));
    async function mutateDisk(action, expectedCode, description, target = diskLeaf) {
      const start = diskAudit.length, epoch = api.testing.status().epoch;
      action();
      await waitFor(() => diskAudit.slice(start).some(event => event.type === 'disk' && event.file === target.fsPath), `${description}: native disk event`);
      // Do not call refreshDiagnostics: the real watcher must schedule publication.
      await waitFor(() => diskAudit.slice(start).some(event => event.type === 'published' && event.file === diskConsumer.uri.fsPath
        && event.snapshot.epoch > epoch && event.snapshot.epoch === api.testing.status().epoch)
        && (expectedCode ? diagnostics(diskConsumer).some(d => d.code === expectedCode) : diagnostics(diskConsumer).length === 0), description);
      assertNeverOpened();
    }
    try {
      await check('saved transitive TypeScript changes refresh Surface diagnostics through the native watcher', async () => {
        await mutateDisk(() => fs.writeFileSync(diskLeaf.fsPath, diskOriginals.get(diskLeaf.fsPath).replace('string', 'number')),
          'TS2339', 'saved transitive type change');
        const error = diagnostics(diskConsumer).find(d => d.code === 'TS2339');
        assert.equal(diskConsumer.getText(error.range), 'toUpperCase');
        await mutateDisk(() => fs.writeFileSync(diskLeaf.fsPath, diskOriginals.get(diskLeaf.fsPath)), null, 'saved type recovery');
      });
      await check('native watcher refreshes deleted and recreated TypeScript dependencies', async () => {
        // Delete the directly imported module so its missing import maps to Surface.
        await mutateDisk(() => fs.unlinkSync(diskModel.fsPath), 'TS2307', 'deleted direct module', diskModel);
        await mutateDisk(() => fs.writeFileSync(diskModel.fsPath, diskOriginals.get(diskLeaf.fsPath).replace('string', 'number')),
          'TS2339', 'recreated direct module', diskModel);
        await mutateDisk(() => fs.writeFileSync(diskModel.fsPath, diskOriginals.get(diskModel.fsPath)), null, 'restored disk fixture', diskModel);
      });
    } finally {
      stopDiskAudit();
      fs.writeFileSync(diskLeaf.fsPath, diskOriginals.get(diskLeaf.fsPath));
      fs.writeFileSync(diskModel.fsPath, diskOriginals.get(diskModel.fsPath));
    }
    for (const [file, source] of diskOriginals) assert.equal(fs.readFileSync(file, 'utf8'), source);
    assert.equal(fs.readFileSync(model.uri.fsPath, 'utf8'), savedModel);
    assert.equal(fs.readFileSync(typeConsumer.uri.fsPath, 'utf8'), savedTypeConsumer);
    assert.equal(fs.readFileSync(origin.uri.fsPath, 'utf8'), savedOrigin);
    assert.equal(fs.readFileSync(consumer.uri.fsPath, 'utf8'), savedConsumer);
    assert.equal(fs.readFileSync(aliasLink, 'utf8'), savedOrigin);
    assert.equal(fs.readFileSync(screen.uri.fsPath, 'utf8'), original);
    assert.equal(fs.readFileSync(badge.uri.fsPath, 'utf8'), originalBadge);
    assert.equal(fs.readFileSync(uri('Other').fsPath, 'utf8'), original.replaceAll('Screen', 'Other'));
    result.sourceFilesUnchanged = true;
    result.passed = true;
    validateEditorReport(result, {runId: process.env.ELNOR_EDITOR_RUN_ID, exitCode: 0});
  } catch (error) {
    result.passed = false;
    result.error = error.stack;
    throw error;
  } finally {
    // A normal development host persists buffers. Discard only this fixture's
    // owned dirty documents before quitting, while alias files still exist.
    if (process.env.ELNOR_EDITOR_MODE === 'persistent') {
      try {
        for (const doc of vscode.workspace.textDocuments.filter(doc => doc.isDirty && doc.uri.scheme === 'file')) {
          assert.ok(doc.uri.fsPath.toLowerCase().startsWith(root.fsPath.toLowerCase() + require('node:path').sep), 'Refuse to discard documents outside the fixture');
          await vscode.window.showTextDocument(doc, {preview: false});
          await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        }
      } catch (error) { result.passed = false; result.error = error.stack; }
    }
    // Restore only the generated dependencies intentionally mutated by these tests.
    for (const name of ['DiskLeaf.mts', 'DiskModel.mts']) {
      const file = vscode.Uri.joinPath(root, name).fsPath;
      if (diskOriginals.has(file)) fs.writeFileSync(file, diskOriginals.get(file));
    }
    if (aliasLink && fs.existsSync(aliasLink)) fs.unlinkSync(aliasLink);
    fs.writeFileSync(process.env.ELNOR_EDITOR_REPORT, JSON.stringify(result, null, 2));
  }
};
