import {getTs} from './typescript.mjs';
import {bindSource} from './binding-analysis.mjs';
import {projectSurface} from './language-projection.mjs';
import {validateImports} from './import-validation.mjs';
import {managedSuspensionDiagnostics} from './managed-action-lowering.mjs';

const ts = getTs();

// Shared semantic checks and explicit generator boundaries. Keep compiler and
// editor entry points consistent without treating spike gaps as language rules.
export function validateComponent(ir,{moduleHost}={}) {
  const errors = managedSuspensionDiagnostics(ir);
  function report(code, message, span) {
    const start = span.start;
    if (errors.some(e => e.code === code && e.start === start && e.length === span.length)) return;
    errors.push({code, message, file: ir.filename, ...span,
      line: ir.source.slice(0, start).split('\n').length});
  }
  for (const prop of ir.params) {
    if (prop.initializerSpan) report('ELN-PROP-DEFAULT',
      'Default prop values are not implemented by this spike; use an optional prop and an explicit fallback expression',
      prop.initializerSpan);
  }
  const projection = projectSurface(ir.source, ir.filename);
  if (!projection.ir) return errors;
  const {sf, checker} = bindSource(projection.map.source);
  validateImports(ir,projection,report,{sf,checker,moduleHost});
  const fn = sf.statements.find(ts.isFunctionDeclaration);
  if (!fn?.body || sf.parseDiagnostics.length) return errors;
  const readonly = new Set(fn.parameters.map(p => checker.getSymbolAtLocation(p.name)));
  for (const statement of fn.body.statements) {
    if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
      for (const d of statement.declarationList.declarations) {
        if (ir.calcs.some(c => c.name === d.name.getText(sf))) readonly.add(checker.getSymbolAtLocation(d.name));
      }
    }
  }
  function target(node) {
    if (ts.isIdentifier(node)) {
      if (readonly.has(checker.getSymbolAtLocation(node))) {
        const span = projection.map.toOriginal(node.getStart(sf), node.getWidth(sf));
        if (span) report('ELN-READONLY', `Cannot assign to readonly component binding '${node.text}'`, span);
      }
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) target(node.expression);
    else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(target);
    else if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        if (ts.isShorthandPropertyAssignment(p)) {
          if (readonly.has(checker.getShorthandAssignmentValueSymbol(p))) {
            const span = projection.map.toOriginal(p.name.getStart(sf), p.name.getWidth(sf));
            if (span) report('ELN-READONLY', `Cannot assign to readonly component binding '${p.name.text}'`, span);
          }
        } else if (ts.isPropertyAssignment(p)) target(p.initializer);
        else if (ts.isSpreadAssignment(p)) target(p.expression);
      }
    } else if (ts.isSpreadElement(node)) target(node.expression);
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) target(node.left);
  }
  function walk(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) target(node.left);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) target(node.operand);
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) target(node.initializer);
    ts.forEachChild(node, walk);
  }
  walk(fn.body);
  return errors;
}
