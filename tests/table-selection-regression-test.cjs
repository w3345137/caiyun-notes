const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pluginPath = path.join(__dirname, '../src/extensions/TextSelectionInTablePlugin.ts');
const source = fs.readFileSync(pluginPath, 'utf8');

assert.doesNotMatch(
  source,
  /view\s*\([^)]*\)\s*\{[\s\S]*update\s*\([^)]*\)\s*\{[\s\S]*setSelection/,
  'table selection plugin must not rewrite selection from view.update; it can steal the caret while typing'
);

assert.match(
  source,
  /\$anchorCell\.pos === \$headCell\.pos[\s\S]*createSafeInlineTextSelection/,
  'only single-cell CellSelection should be converted back to TextSelection'
);

console.log('table selection regression tests passed');
