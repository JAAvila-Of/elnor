const vscode = require('vscode');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {persistentSession, runPersistentSuite, waitForWorkspaceTrust} = require('./tests/persistent-host.cjs');

exports.activate = async function (context) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || folder.uri.scheme !== 'file') return;
  const nativeSession = persistentSession({mode: context.extensionMode, developmentMode: vscode.ExtensionMode.Development, workspace: folder.uri.fsPath});
  if (!vscode.workspace.isTrusted) {
    if (!nativeSession) return;
    await waitForWorkspaceTrust(vscode, context.subscriptions);
  }
  const {createAsyncLanguageService, isDiscardedResponse} = await import(pathToFileURL(path.join(__dirname, '../../src/async-language-service.mjs')).href);
  const {sourceKey} = await import(pathToFileURL(path.join(__dirname, '../../src/source-identity.mjs')).href);
  const service = createAsyncLanguageService({root: folder.uri.fsPath});
  const collection = vscode.languages.createDiagnosticCollection('elnor-surface');
  const output = vscode.window.createOutputChannel('Elnor Surface', {log: true});
  let timer;
  let disposed = false;
  const observers = new Set(), diskReads = new Map(), tracked = new Map(), conflicts = new Map(), released = new Set();
  const report = event => { for (const listener of observers) { try { listener(event); } catch { /* Test observers do not control provider state. */ } } };
  const canonical = file => process.platform === 'win32' ? file.toLowerCase() : file;
  const inside = uri => uri.scheme === 'file' && (canonical(uri.fsPath).startsWith(canonical(folder.uri.fsPath) + path.sep));
  const supportedFile = uri => inside(uri) && (uri.fsPath.endsWith('.eln') || /\.(?:ts|tsx|mts|cts)$/.test(uri.fsPath));
  const supported = doc => !doc.isClosed && !released.has(canonical(doc.uri.fsPath)) && supportedFile(doc.uri);
  const surface = doc => supported(doc) && doc.uri.fsPath.endsWith('.eln');
  const openDocument = uri => vscode.workspace.textDocuments.find(d => !d.isClosed && !released.has(canonical(d.uri.fsPath)) && canonical(d.uri.fsPath) === canonical(uri.fsPath));
  function sync(doc) {
    if (!supported(doc)) return true;
    const key = canonical(doc.uri.fsPath);
    try {
      const physical = sourceKey(doc.uri.fsPath);
      // Saved aliases are index entries, not independent editor views. Retire
      // them before registering a real view of the same physical source.
      for (const [name, entry] of tracked) {
        if (name !== key && entry.physical === physical && entry.kind === 'disk') {
          service.close(entry.uri.fsPath); tracked.delete(name);
        }
      }
      const previous = service.text(doc.uri.fsPath);
      // Equal text still acknowledges/registers this logical view.
      service.open(doc.uri.fsPath, doc.getText());
      tracked.set(key, {uri: doc.uri, physical, kind: 'view'});
      if (previous !== doc.getText()) collection.clear();
      if (conflicts.delete(key)) collection.delete(doc.uri);
      return true;
    } catch (error) {
      const code = /^(ELN-(?:SOURCE-CONFLICT|ALIAS-RETARGET)):/.exec(error.message)?.[1];
      if (!code) throw error;
      conflicts.set(key, error);
      const diagnostic = new vscode.Diagnostic(new vscode.Range(doc.positionAt(0), doc.positionAt(0)),
        `${error.message}. Reconcile the open views before continuing; no editor text was replaced.`, vscode.DiagnosticSeverity.Error);
      diagnostic.code = code; diagnostic.source = 'Elnor';
      collection.set(doc.uri, [diagnostic]);
      report({type: 'conflict', file: doc.uri.fsPath, code});
      return false;
    }
  }
  function synchronize() {
    let valid = true;
    for (const doc of vscode.workspace.textDocuments) if (!sync(doc)) valid = false;
    // A later sync can clear markers after an earlier conflict in the batch.
    if (!valid) for (const doc of vscode.workspace.textDocuments) {
      if (supported(doc) && conflicts.has(canonical(doc.uri.fsPath))) sync(doc);
    }
    return valid;
  }
  async function reload(uri) {
    if (!inside(uri)) return;
    const current = openDocument(uri);
    if (current) { sync(current); return; }
    const key = canonical(uri.fsPath), revision = (diskReads.get(key) ?? 0) + 1;
    diskReads.set(key, revision);
    let source;
    try { source = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)); }
    catch (error) {
      if (disposed || diskReads.get(key) !== revision) return;
      const stillOpen = openDocument(uri);
      if (stillOpen) { sync(stillOpen); return; }
      if (error.code === 'FileNotFound' || error.code === 'ENOENT') {
        service.close(uri.fsPath); tracked.delete(key); conflicts.delete(key); collection.clear(); return;
      }
      throw error;
    }
    if (disposed || diskReads.get(key) !== revision) return;
    const nowOpen = openDocument(uri);
    if (nowOpen) { sync(nowOpen); return; }
    const physical = sourceKey(uri.fsPath);
    const entries = [...tracked.values()].filter(entry => entry.physical === physical);
    // Disk notifications must not replace a dirty buffer owned through another
    // URI. One saved entry per physical source is enough to index closed files.
    if (entries.some(entry => entry.kind === 'view' || canonical(entry.uri.fsPath) !== key)) return;
    const previous = service.text(uri.fsPath);
    service.open(uri.fsPath, source);
    tracked.set(key, {uri, physical, kind: 'disk'});
    if (previous !== source) collection.clear();
  }
  async function publish() {
    if (disposed) return;
    const docs = vscode.workspace.textDocuments.filter(surface);
    if (!synchronize()) return;
    await Promise.all(docs.map(async doc => {
      try {
        const version = doc.version;
        const response = await service.query('diagnostics', [doc.uri.fsPath]);
        if (disposed || conflicts.size || doc.isClosed || version !== doc.version || !service.isCurrent(response.snapshot)) return;
        const diagnostics = response.value.map(error => {
          const diagnostic = new vscode.Diagnostic(new vscode.Range(doc.positionAt(error.start), doc.positionAt(error.start + error.length)),
            error.approximate ? `${error.message} (generated-code error; approximate location)` : error.message,
            error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
          diagnostic.code = error.code;
          diagnostic.source = error.approximate ? 'Elnor (approximate)' : 'Elnor';
          return diagnostic;
        });
        collection.set(doc.uri, diagnostics);
        report({type: 'published', file: doc.uri.fsPath, snapshot: response.snapshot, codes: diagnostics.map(d => d.code)});
      } catch (error) { if (!isDiscardedResponse(error) && !disposed) output.error(error); }
    }));
  }
  async function request(method, args, token) {
    if (disposed || token.isCancellationRequested) return null;
    if (!synchronize()) throw conflicts.values().next().value;
    const controller = new AbortController();
    const subscription = token.onCancellationRequested(() => controller.abort());
    try {
      const response = await service.query(method, args, {signal: controller.signal});
      if (conflicts.size) throw conflicts.values().next().value;
      return token.isCancellationRequested || disposed || !service.isCurrent(response.snapshot) ? null : response;
    } catch (error) {
      if (isDiscardedResponse(error)) return null;
      throw error;
    } finally { subscription.dispose(); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed) timer = setTimeout(() => { void publish().catch(error => output.error(error)); }, 100);
  }
  async function initialize() {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.eln'), '**/{node_modules,dist,.git,.elnor}/**');
    for (const uri of files) await reload(uri);
    for (const doc of vscode.workspace.textDocuments) sync(doc);
  }
  function closeDocument(doc) {
    if (!supportedFile(doc.uri)) return;
    const key = canonical(doc.uri.fsPath);
    released.add(key);
    diskReads.set(key, (diskReads.get(key) ?? 0) + 1);
    const physical = tracked.get(key)?.physical;
    service.close(doc.uri.fsPath); tracked.delete(key); conflicts.delete(key);
    collection.delete(doc.uri);
    if (physical) {
      const remaining = vscode.workspace.textDocuments.filter(current => supported(current) && sourceKey(current.uri.fsPath) === physical);
      // A revert before close can change the canonical buffer. Only unanimous
      // surviving editor text may establish ownership after releasing that view.
      if (remaining.length && remaining.every(current => current.getText() === remaining[0].getText())) {
        for (const [name, entry] of tracked) if (entry.physical === physical) {
          service.close(entry.uri.fsPath); tracked.delete(name);
        }
        for (const current of remaining) sync(current);
      }
    }
    // Closed TS files return to disk resolution, without acquiring buffer ownership.
    if (doc.uri.fsPath.endsWith('.eln')) void reload(doc.uri).then(schedule, error => output.error(error));
    else { service.invalidateDisk(doc.uri.fsPath); collection.clear(); schedule(); }
  }
  // Read the whole small workspace, including consumers not open in an editor.
  // This is a bounded spike index, not a production project discovery strategy.
  await initialize();
  const selector = {language: 'surface', scheme: 'file'};
  function assertSingleFormatView(doc){
    const physical=sourceKey(doc.uri.fsPath);
    const views=new Set(vscode.workspace.textDocuments.filter(current=>supported(current)&&sourceKey(current.uri.fsPath)===physical)
      .map(current=>canonical(current.uri.fsPath)));
    if(views.size>1)throw Error('ELN-FORMAT-ALIASES: Close other URI views of this source before formatting');
  }
  const watch = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*.{eln,ts,tsx,mts,cts}'));
  const watched = uri => !disposed && supportedFile(uri) && !path.relative(folder.uri.fsPath, uri.fsPath)
    .split(path.sep).some(part => ['node_modules', 'dist', '.git', '.elnor', '.elnor-authoring-output'].includes(part.toLowerCase()));
  const invalidateTypeScript = uri => { service.invalidateDisk(uri.fsPath); collection.clear(); schedule(); };
  const updateFromDisk = uri => {
    if (!watched(uri)) return;
    if (!uri.fsPath.endsWith('.eln')) { invalidateTypeScript(uri); return; }
    return reload(uri).then(schedule, error => output.error(error));
  };
  context.subscriptions.push(output, collection, watch,
    {dispose() { disposed = true; clearTimeout(timer); observers.clear(); void service.dispose(); }},
    {dispose: service.onEvent(event => {
      report(event);
      if (event.type === 'failure' && !disposed) {
        collection.clear();
        output.error(`Surface worker stopped: ${event.message}. A new edit or request will retry.`);
      }
    })},
    watch.onDidCreate(updateFromDisk), watch.onDidChange(updateFromDisk),
    watch.onDidDelete(uri => {
      if (!watched(uri)) return;
      if (!uri.fsPath.endsWith('.eln')) { invalidateTypeScript(uri); return; }
      const key = canonical(uri.fsPath); diskReads.set(key, (diskReads.get(key) ?? 0) + 1);
      const current = openDocument(uri);
      if (current) sync(current); else { service.close(uri.fsPath); tracked.delete(key); conflicts.delete(key); collection.clear(); }
      schedule();
    }),
    vscode.workspace.onDidOpenTextDocument(doc => {
      released.delete(canonical(doc.uri.fsPath));
      if (supported(doc)) { sync(doc); schedule(); }
    }),
    vscode.workspace.onDidChangeTextDocument(({document}) => {
      if (document.isDirty) released.delete(canonical(document.uri.fsPath));
      if (supported(document)) { sync(document); schedule(); }
    }),
    vscode.workspace.onDidCloseTextDocument(closeDocument),
    vscode.window.tabGroups.onDidChangeTabs(event => {
      for (const tab of event.closed) {
        const uri = tab.input?.uri;
        if (!uri || vscode.window.tabGroups.all.some(group => group.tabs.some(current => current.input?.uri?.toString() === uri.toString()))) continue;
        const doc = openDocument(uri);
        // Clean cached models may outlive their last tab. Dirty tabless rename
        // targets retain ownership until reverted, saved or actually closed.
        if (doc && !doc.isDirty) closeDocument(doc);
      }
      for (const tab of event.opened) {
        const uri = tab.input?.uri;
        if (!uri) continue;
        released.delete(canonical(uri.fsPath));
        const doc = openDocument(uri);
        if (doc) sync(doc);
      }
      schedule();
    }),
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      async provideDocumentFormattingEdits(doc,options,token){
        if(!surface(doc)||token.isCancellationRequested)return [];
        if(options?.insertSpaces===false)throw Error('ELN-FORMAT-OPTIONS: This formatter supports spaces, not tab indentation');
        assertSingleFormatView(doc);
        const version=doc.version,source=doc.getText();
        const response=await request('format',[doc.uri.fsPath,{indentSize:options?.tabSize??2}],token);
        if(!response||token.isCancellationRequested||!surface(doc)||doc.version!==version||doc.getText()!==source)return [];
        assertSingleFormatView(doc);
        if(!service.isCurrent(response.snapshot))return [];
        if(response.value.diagnostics.length){
          const error=response.value.diagnostics[0];
          throw Object.assign(Error(`${error.code}: ${error.message}`),{code:error.code});
        }
        // Return edits only. Application and saving remain the editor's choice;
        // real change events will update the service afterwards.
        return response.value.edits.map(edit=>vscode.TextEdit.replace(
          new vscode.Range(doc.positionAt(edit.start),doc.positionAt(edit.start+edit.length)),edit.newText));
      },
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(doc, position, token) {
        if (!surface(doc) || token.isCancellationRequested) return [];
        sync(doc);
        const response = await request('completions', [doc.uri.fsPath, doc.offsetAt(position)], token);
        if (!response) return [];
        return response.value.map(entry => {
          const item = new vscode.CompletionItem(entry.name, entry.kind === 'property' ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.Variable);
          item.detail = 'Elnor Surface';
          item.insertText = entry.isSnippet ? new vscode.SnippetString(entry.insertText) : entry.insertText ?? entry.name;
          if (entry.replacementSpan) item.range = new vscode.Range(doc.positionAt(entry.replacementSpan.start), doc.positionAt(entry.replacementSpan.start + entry.replacementSpan.length));
          return item;
        });
      },
    }, '.', ' '),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(doc, position, token) {
        if (!surface(doc) || token.isCancellationRequested) return [];
        sync(doc);
        const version = doc.version;
        const response = await request('definitions', [doc.uri.fsPath, doc.offsetAt(position)], token);
        if (!response) return [];
        const result = [];
        for (const location of response.value) {
          const uri = vscode.Uri.file(location.file);
          const expected = service.text(location.file);
          const target = await vscode.workspace.openTextDocument(uri);
          if (token.isCancellationRequested || doc.version !== version || !service.isCurrent(response.snapshot)
            || (expected !== undefined && target.getText() !== expected)) return [];
          result.push(new vscode.Location(uri, new vscode.Range(target.positionAt(location.start), target.positionAt(location.start + location.length))));
        }
        return result;
      },
    }),
    vscode.languages.registerRenameProvider(selector, {
      async provideRenameEdits(doc, position, newName, token) {
        if (!surface(doc) || token.isCancellationRequested) return null;
        const response = await request('rename', [doc.uri.fsPath, doc.offsetAt(position), newName], token);
        if (!response) return null;
        const plan = response.value;
        const targets = new Map();
        for (const edit of plan.edits) {
          const physical = sourceKey(edit.file);
          if (targets.has(physical)) continue;
          const views = vscode.workspace.textDocuments.filter(current => supported(current) && sourceKey(current.uri.fsPath) === physical);
          targets.set(physical, views.length ? views : [await vscode.workspace.openTextDocument(vscode.Uri.file(edit.file))]);
        }
        if (token.isCancellationRequested) return null;
        if (!service.isCurrent(response.snapshot)) return null;
        const result = new vscode.WorkspaceEdit();
        for (const edit of plan.edits) {
          const expected = service.text(edit.file);
          for (const target of targets.get(sourceKey(edit.file))) {
            if (target.isClosed || target.getText() !== expected) throw Error('ELN-SOURCE-CONFLICT: Rename target differs from its analyzed buffer');
            result.replace(target.uri, new vscode.Range(target.positionAt(edit.start), target.positionAt(edit.start + edit.length)), edit.newText);
          }
        }
        // VS Code applies this WorkspaceEdit. Do not mutate the service before
        // its real document-change events, and never save files automatically.
        return result;
      },
    }),
  );
  schedule();
  // Test-mode observability drives the same diagnostics path, never a mock.
  const api = {testing: {
    refreshDiagnostics: publish,
    restart: async () => { clearTimeout(timer); collection.clear(); await service.restart(); },
    status: service.status,
    onEvent(listener) { observers.add(listener); return () => observers.delete(listener); },
  }};
  if (nativeSession) setImmediate(() => {
    void runPersistentSuite({session: nativeSession, vscode, run: () => require('./tests/run.cjs').run()})
      .catch(error => output.error(error));
  });
  if (context.extensionMode === vscode.ExtensionMode.Test || nativeSession) return api;
};
