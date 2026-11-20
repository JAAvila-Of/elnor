import {getTs} from './typescript.mjs';

const ts = getTs();

// Bind a self-contained projection without disk access, libraries or execution.
// This uses TypeScript's lexical symbols, not its type diagnostics.
export function bindSource(source) {
  const file = 'fragment.ts';
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const host = {
    getSourceFile: name => name === file ? sf : undefined,
    getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: name => name === file,
    readFile: name => name === file ? source : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram([file], {
    noLib:true, noResolve:true, strict:true,
    target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext,
  }, host);
  return {sf, checker:program.getTypeChecker()};
}
