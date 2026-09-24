const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []); }
test('application files have no duplicate local import bindings', () => {
  const duplicates = [];
  for (const file of ['app', 'components', 'lib'].flatMap(dir => files(path.join(root, dir)))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const seen = new Set();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
      const clause = statement.importClause;
      const names = clause.name ? [clause.name.text] : [];
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name.text);
        else names.push(...clause.namedBindings.elements.map(item => item.name.text));
      }
      for (const name of names) { if (seen.has(name)) duplicates.push(`${path.relative(root, file)}: ${name}`); seen.add(name); }
    }
  }
  assert.deepEqual(duplicates, []);
});
test('booking decision sends native push only once', () => {
  const source = fs.readFileSync(path.join(root, 'app/api/sessions/[id]/respond/route.ts'), 'utf8');
  assert.equal((source.match(/await pushClient\(/g) || []).length, 1);
});
test('exercise collection API cannot publish or message clients', () => {
  const source = fs.readFileSync(path.join(root, 'app/api/library/sets/route.ts'), 'utf8');
  assert.match(source, /deleted_at/);
  assert.match(source, /\["owner", "trainer"\]/);
  assert.doesNotMatch(source, /sendEmail|pushClient|createServiceClient/);
  const edits = fs.readFileSync(path.join(root, 'app/api/programs/[id]/route.ts'), 'utf8');
  assert.match(edits, /isExerciseSet\(existing\.data\)/);
  assert.match(edits, /status: 409/);
});
