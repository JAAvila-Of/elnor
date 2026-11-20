// Use checked source snapshots, never a new disk read or a generated TS column.
export const terminalText=value=>String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,
  character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));

export function formatSourceDiagnostics(diagnostics,sources=new Map()){
  return diagnostics.map(diagnostic=>{
    const line=diagnostic.line,knownLine=Number.isInteger(line)&&line>0;
    let text=terminalText(`${diagnostic.code} ${diagnostic.file??'unknown'}${knownLine?':'+line:''}: ${diagnostic.message}`);
    const source=sources.get(diagnostic.file);
    if(typeof source==='string'&&knownLine){
      const lines=source.split(/\r\n|\n|\r/);
      if(line<=lines.length)text+='\n  '+line+' | '+terminalText(lines[line-1]);
    }
    return text;
  }).join('\n');
}
export const formatAuthoringDiagnostics=formatSourceDiagnostics;

export function authoringRecovery(command,previewAvailable){
  const summary=command==='check'?'Check failed; no preview was rebuilt.':
    previewAvailable===true?'Build failed. The previous preview files were kept.':
      previewAvailable===false?'Build failed. No successful preview is available yet.':'Build failed. Preview state could not be verified.';
  return summary+'\nFix the errors, save, build again, then reload.';
}
