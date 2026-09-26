/* Aggregate all syntax failures before running tests/build; never repair source by replacing \n globally. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const excluded = new Set(["node_modules", ".git", ".next", ".vercel", "dist", "build", "coverage"]);
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? (excluded.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
const files = walk(".");
const problems = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, /tsx$/.test(file) ? ts.ScriptKind.TSX : /jsx$/.test(file) ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  for (const error of source.parseDiagnostics) {
    const position = source.getLineAndCharacterOfPosition(error.start || 0);
    problems.push(`${file}:${position.line + 1}:${position.character + 1} ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  }
}
console.log(`Source sweep: ${files.length} application, test and script files checked.`);
if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
else console.log("Source sweep passed: no syntax diagnostics.");
