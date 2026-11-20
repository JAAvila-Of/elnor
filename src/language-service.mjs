import path from 'node:path';
import {getTs, surfaceDiagnosticMessage} from './typescript.mjs';
import {projectSurface} from './language-projection.mjs';
import {domPropertyCompletions} from './dom-editor.mjs';
import {validateGraph} from './semantic-validation.mjs';
import {sourceKey,sourcePath,sourceImport} from './source-identity.mjs';
import {createDocumentStore} from './document-store.mjs';
import {formatSurface} from './formatter.mjs';
import {guardCallConflicts} from './action-guards.mjs';
import {createTypeScriptOptions,describeTypeScriptConfiguration} from './typescript-configuration.mjs';

const ts = getTs();

function position(source, offset) {
  const prefix = source.slice(0, offset);
  return {line: prefix.split('\n').length, column: offset - prefix.lastIndexOf('\n')};
}

// No generated modules, fixtures, TS plugins or user code are executed.
// All edits stay in the document store; the caller owns persistence to disk.
export function createSurfaceLanguageService({root = process.cwd()} = {}) {
  root = path.resolve(root);
  const options=createTypeScriptOptions();
  const store=createDocumentStore(root),documents=store.documents;
  let revision = 0, diskRevision = 0;
  let disposed = false;
  const key = file => sourceKey(path.resolve(root,file));
  const document = file => store.get(file);
  const virtualName = doc => doc.origin.endsWith('.eln') ? doc.origin + '.mts' : doc.origin;
  const virtualDocument = file => document(file.endsWith('.eln.mts') ? file.slice(0, -4) : file);
  function ensureActive() { if (disposed) throw Error('Language service is disposed'); }
  function discover(doc){
    // Discovery owns no editor view and must preserve existing dirty buffers.
    for(const imp of doc.projection?.ir?.imports??[]){
      if(!imp.path.endsWith('.eln'))continue;
      const imported=sourceImport(doc.origin,imp.path),existing=document(imported);
      if(existing)store.open(imported,existing.source,{explicit:false});
      else if(ts.sys.fileExists(imported))open(imported,ts.sys.readFile(imported),{dependency:true});
    }
  }
  function open(file, source, {dependency=false}={}) {
    ensureActive();
    file = path.resolve(root, file);
    if (!file.endsWith('.eln') && !/\.[cm]?tsx?$/.test(file)) throw Error('Only Surface and TypeScript documents are supported');
    const doc=store.open(file,source,{explicit:!dependency});
    const projection=doc.file.endsWith('.eln')?projectSurface(doc.source,doc.file):null;
    Object.assign(doc,{version:++revision,projection,projectionFile:doc.file});
    discover(doc);
    return doc.version;
  }
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...documents.values()].map(virtualName),
    getScriptVersion: file => `${virtualDocument(file)?.version ?? 0}:${diskRevision}`,
    getProjectVersion: () => String(revision),
    getScriptSnapshot: file => {
      const doc = virtualDocument(file);
      const source = doc ? doc.projection?.map.source ?? doc.source : ts.sys.readFile(file);
      return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: opts => ts.getDefaultLibFilePath(opts),
    fileExists: file => !!virtualDocument(file) || ts.sys.fileExists(file),
    readFile: file => {
      const doc = virtualDocument(file);
      return doc ? doc.projection?.map.source ?? doc.source : ts.sys.readFile(file);
    },
    readDirectory: ts.sys.readDirectory,
    directoryExists: directory => key(directory) === key(root)
      || [...documents.values()].some(d => key(d.origin).startsWith(key(directory) + '/'))
      || ts.sys.directoryExists(directory),
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    resolveModuleNames: (names, containingFile) => names.map(name => {
      if (name.endsWith('.eln.mjs')) {
        const original = sourceImport(containingFile,name.slice(0,-4));
        const doc = document(original);
        return doc ? {resolvedFileName: virtualName(doc), extension: ts.Extension.Mts} : undefined;
      }
      const resolved=ts.resolveModuleName(name,sourcePath(containingFile),options,host).resolvedModule;
      return resolved?{...resolved,resolvedFileName:sourcePath(resolved.resolvedFileName)}:undefined;
    }),
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  function invalidateDisk(file) {
    ensureActive();
    if (typeof file !== 'string' || !/\.(?:ts|tsx|mts|cts)$/.test(file)) throw Error('Expected a TypeScript disk path');
    // Conservatively refresh all disk snapshots and failed module resolutions.
    // Owned editor buffers remain authoritative; no disk source is adopted.
    revision++; diskRevision++; ls.cleanupSemanticCache();
  }
  function requireSurface(file) {
    ensureActive();
    store.assertCurrent();
    const doc = document(file);
    if (!doc?.projection) throw Error(`Surface document is not open: ${file}`);
    return doc;
  }
  function originalLocation(file, span) {
    const doc = virtualDocument(file);
    if (doc?.projection) {
      const mapped = doc.projection.map.toOriginal(span.start, span.length);
      return mapped ? {file: doc.file, ...mapped} : null;
    }
    return {file: path.resolve(file), ...span};
  }
  function format(file,formatOptions={}){
    const doc=requireSurface(file);
    store.assertCurrent({synchronized:true,operation:'formatting'});
    if(!store.isAcknowledged(file))throw Error('Formatting requires an explicitly opened Surface document');
    // Analyze the original owned snapshot, never a recovered/generated projection.
    return formatSurface(doc.source,{...formatOptions,filename:doc.file});
  }
  function diagnostics(file) {
    const doc = requireSurface(file);
    const errors = doc.projection.errors.map(error => {
      const start = Math.max(0, Math.min(error.start ?? 0, doc.source.length));
      return {file: doc.file, start, length: Math.min(error.length ?? 1, doc.source.length - start),
        code: error.code ?? 'ELN-PARSE', message: error.message, ...position(doc.source, start)};
    });
    if (!doc.projection.ir) return errors;
    const graph = new Map([...documents.values()]
      .filter(d => d.projection?.ir).map(d => [d.file, d.projection.ir]));
    for (const error of validateGraph(graph, {knownFiles: [...documents.values()].map(d => d.file),moduleHost:host})) {
      if (key(error.file) === key(doc.file)) errors.push({...error, ...position(doc.source, error.start)});
    }
    if(doc.projection.guardChecks?.length){
      for(const error of guardCallConflicts(ts,ls.getProgram(),virtualName(doc),doc.projection.guardChecks)){
        errors.push({...error,file:doc.file,...position(doc.source,error.start)});
      }
    }
    for (const d of [...ls.getSyntacticDiagnostics(virtualName(doc)), ...ls.getSemanticDiagnostics(virtualName(doc))]) {
      if(doc.projection.recoveryTails?.some(tail=>d.start>=tail.start&&d.start<tail.end))continue;
      const exact = originalLocation(virtualName(doc), {start: d.start ?? 0, length: d.length ?? 0});
      // Never report a virtual offset as a source offset. Unmapped errors are
      // explicitly anchored to the component, with their provenance retained.
      const mapped = exact ?? {file: doc.file, ...doc.projection.ir.nameSpan};
      errors.push({...mapped, code: `TS${d.code}`, message: surfaceDiagnosticMessage(ts, d, () => ls.getProgram()?.getTypeChecker()),
        ...position(doc.source, mapped.start), approximate: !exact});
    }
    return errors;
  }
  function definitions(file, offset) {
    const doc = requireSurface(file);
    const found = new Map();
    for (const generated of doc.projection.map.toGenerated(offset)) {
      for (const definition of ls.getDefinitionAtPosition(virtualName(doc), generated) ?? []) {
        const mapped = originalLocation(definition.fileName, definition.textSpan);
        if (mapped) found.set(`${key(mapped.file)}:${mapped.start}:${mapped.length}`, mapped);
      }
    }
    return [...found.values()];
  }
  function completions(file, offset) {
    const doc = requireSurface(file);
    const dom=domPropertyCompletions(doc.source,offset,doc.file,doc.projection.ir);if(dom!==null)return dom;
    if (!doc.projection.ir) return [];
    const context = doc.projection.propContexts.find(({node}) => {
      const span = node.attributesSpan;
      return offset >= span.start && offset <= span.start + span.length
        && !node.props.some(p => p.exprSpan && offset > p.exprSpan.start && offset <= p.exprSpan.start + p.exprSpan.length);
    });
    const positions = context ? [context.generatedPosition] : doc.projection.map.toGenerated(offset);
    const found = new Map();
    for (const generated of positions) {
      const result = ls.getCompletionsAtPosition(virtualName(doc), generated, {includeCompletionsForModuleExports: false});
      for (const entry of result?.entries ?? []) {
        const partial = context?.node.props.find(p => offset >= p.nameSpan.start && offset <= p.nameSpan.start + p.nameSpan.length);
        const span = context
          ? {file: doc.file, start: partial?.nameSpan.start ?? offset, length: partial?.nameSpan.length ?? 0}
          : entry.replacementSpan && originalLocation(virtualName(doc), entry.replacementSpan);
        found.set(entry.name, {name: entry.name, kind: entry.kind, ...(span ? {replacementSpan: span} : {})});
      }
    }
    return [...found.values()];
  }
  function rename(file, offset, newName) {
    const doc = requireSurface(file);
    store.assertCurrent({synchronized:true});
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, newName);
    if (scanner.scan() !== ts.SyntaxKind.Identifier || scanner.getTokenText() !== newName || scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
      throw Error('Rename requires a valid TypeScript identifier');
    }
    // A partial workspace is useful for reading/completion, never for a
    // destructive edit whose full set of references cannot be trusted.
    if ([...documents.values()].some(d => d.projection?.errors.length)) throw Error('Cannot rename an incomplete or invalid workspace');
    const queue = doc.projection.map.toGenerated(offset).map(start => ({file: virtualName(doc), start}));
    const initial = queue.map(q => ls.getRenameInfo(q.file, q.start, {allowRenameOfImportPath: false})).find(info => info.canRename);
    const trigger = initial?.canRename && doc.projection.map.toOriginal(initial.triggerSpan.start, initial.triggerSpan.length);
    const oldName = trigger && doc.source.slice(trigger.start, trigger.start + trigger.length);
    const visited = new Set(), edits = new Map();
    while (queue.length) {
      const request = queue.shift();
      const id = `${key(request.file)}:${request.start}`;
      if (visited.has(id)) continue;
      visited.add(id);
      const info = ls.getRenameInfo(request.file, request.start, {allowRenameOfImportPath: false});
      if (!info.canRename) continue;
      for (const location of ls.findRenameLocations(request.file, request.start, false, false, true) ?? []) {
        const mapped = originalLocation(location.fileName, location.textSpan);
        if (!mapped) throw Error('Rename touches generated code without an exact source range');
        const target = document(mapped.file);
        if (!target) throw Error('Rename touches a document outside the versioned workspace');
        if (!target.projection) throw Error('Cross-language rename into TypeScript is not proven by this spike');
        const editId = `${key(mapped.file)}:${mapped.start}:${mapped.length}`;
        const newText = `${location.prefixText ?? ''}${newName}${location.suffixText ?? ''}`;
        if (edits.has(editId) && edits.get(editId).newText !== newText) throw Error('Ambiguous rename mapping');
        edits.set(editId, {...mapped, newText, version: target.version});
        // One Surface declaration can have multiple TS projections (contract
        // property and local parameter). Follow those mirrors as symbol links.
        for (const start of target.projection?.map.toGenerated(mapped.start) ?? []) {
          queue.push({file: virtualName(target), start});
        }
      }
    }
    if (!edits.size) throw Error('No safely renamable symbol at this position');
    const result = [...edits.values()].sort((a, b) => a.file.localeCompare(b.file) || b.start - a.start);
    for (let i = 1; i < result.length; i++) {
      const a = result[i - 1], b = result[i];
      if (a.file === b.file && b.start + b.length > a.start) throw Error('Overlapping rename edits');
    }
    // TS rename finds references, but does not reject a name that collides with
    // an existing binding. Validate the proposed workspace before exposing edits.
    const candidate = createSurfaceLanguageService({root});
    try {
      const before = new Map();
      for (const target of documents.values()) {
        if (target.projection) for (const d of diagnostics(target.file)) {
          const message = oldName ? d.message.replaceAll(oldName, newName) : d.message;
          const id = `${key(d.file)}:${d.code}:${message}`;
          before.set(id, (before.get(id) ?? 0) + 1);
        }
        let source = target.source;
        for (const edit of result.filter(e => e.file === target.file)) {
          source = source.slice(0, edit.start) + edit.newText + source.slice(edit.start + edit.length);
        }
        candidate.open(target.file, source);
      }
      for (const target of documents.values()) {
        if (!target.projection) continue;
        for (const d of candidate.diagnostics(target.file)) {
          const id = `${key(d.file)}:${d.code}:${d.message}`;
          const count = before.get(id) ?? 0;
          if (!count) throw Error(`Rename introduces an invalid program: ${d.message}`);
          before.set(id, count - 1);
        }
      }
    } finally { candidate.dispose(); }
    return {edits: result, revision, versions: [...documents.values()].map(d => ({file: d.file, version: d.version}))};
  }
  function isCurrent(plan) {
    ensureActive();
    try{store.assertCurrent();return plan.revision === revision && plan.versions.every(v => document(v.file)?.version === v.version);}
    catch{return false;}
  }
  function applyRename(plan) {
    ensureActive();
    if (!isCurrent(plan)) throw Error('Stale rename plan');
    const changed = new Map();
    for (const edit of plan.edits) {
      const target = document(edit.file);
      if (!target || target.version !== edit.version) throw Error('Stale rename edit');
      const text = changed.get(edit.file) ?? target.source;
      changed.set(edit.file, text.slice(0, edit.start) + edit.newText + text.slice(edit.start + edit.length));
    }
    for (const [file, source] of changed) open(file, source);
  }
  return {
    open, diagnostics, definitions, completions, rename, applyRename, isCurrent, format, invalidateDisk,
    configuration:describeTypeScriptConfiguration,
    text: file => document(file)?.source,
    close(file) {
      ensureActive();store.close(file);revision++;
      for(const doc of documents.values())if(doc.projectionFile!==doc.file){
        doc.projection=doc.file.endsWith('.eln')?projectSurface(doc.source,doc.file):null;
        doc.projectionFile=doc.file;doc.version=revision;
      }
      // Closed editor text is released, but remaining consumers still need the
      // saved contract. Rehydrate only source dependencies, never user execution.
      for(const doc of [...documents.values()])discover(doc);
    },
    dispose() { if (!disposed) { ls.dispose(); store.clear(); disposed = true; } },
  };
}
