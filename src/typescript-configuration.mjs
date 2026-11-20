import {getTs} from './typescript.mjs';

// Deliberately fixed: no tsconfig discovery, extends, plugins or user overrides.
// Return fresh options so a consumer cannot alter another service's contract.
export function createTypeScriptOptions(){
  const ts=getTs();
  return {
    strict:true, noEmit:true, skipLibCheck:true, types:[],
    allowJs:true, allowImportingTsExtensions:true,
    module:ts.ModuleKind.NodeNext, moduleResolution:ts.ModuleResolutionKind.NodeNext,
    target:ts.ScriptTarget.ES2022,
  };
}

// Packaging resolves with the same module rules, but owns its emit policy.
export function createModuleResolutionOptions(){
  const {module,moduleResolution,target,allowJs,allowImportingTsExtensions}=createTypeScriptOptions();
  return {module,moduleResolution,target,allowJs,allowImportingTsExtensions};
}

export function describeTypeScriptConfiguration(){
  const ts=getTs();
  const options=createTypeScriptOptions();
  return {
    profile:'elnor-mvp-fixed', typeScriptVersion:ts.version,
    configPolicy:'tsconfig.json, extends, project references and compiler plugins are not loaded',
    compilerOptions:{...options,module:ts.ModuleKind[options.module],
      moduleResolution:ts.ModuleResolutionKind[options.moduleResolution],target:ts.ScriptTarget[options.target]},
    rootFiles:'Surface import graph and explicitly owned editor buffers; no tsconfig include/files discovery',
    emitPolicy:'ESM with ES2022 target; runtime dependencies must satisfy the local ESM packaging contract',
  };
}
