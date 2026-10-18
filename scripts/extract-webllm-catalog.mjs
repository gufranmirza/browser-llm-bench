// Read the installed package's static prebuiltAppConfig without executing browser code.
import fs from "node:fs";
import ts from "typescript";
const pkg = process.argv[2];
if (!["web-llm", "web-llm-next"].includes(pkg))
  throw Error("Choose an installed WebLLM runtime");
const source = ts.createSourceFile(
  "catalog.js",
  fs.readFileSync(`node_modules/@mlc-ai/${pkg}/lib/index.js`, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const constants = {};
function read(n) {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n))
    return ts.isNumericLiteral(n) ? Number(n.text) : n.text;
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(n)) return -read(n.operand);
  if (ts.isIdentifier(n)) return constants[n.text];
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(read);
  if (ts.isObjectLiteralExpression(n))
    return Object.fromEntries(
      n.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => [p.name.text, read(p.initializer)]),
    );
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return read(n.left) + read(n.right);
}
let config;
for (const s of source.statements)
  if (ts.isVariableStatement(s))
    for (const d of s.declarationList.declarations) {
      if (["modelVersion", "modelLibURLPrefix"].includes(d.name.text))
        constants[d.name.text] = read(d.initializer);
      if (d.name.text === "prebuiltAppConfig") config = read(d.initializer);
    }
if (!config?.model_list?.length) throw Error("No installed catalog found");
process.stdout.write(JSON.stringify(config));
