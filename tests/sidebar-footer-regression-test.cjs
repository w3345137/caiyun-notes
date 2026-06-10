const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sidebarPath = path.join(__dirname, '../src/components/Sidebar.tsx');
const source = fs.readFileSync(sidebarPath, 'utf8');

assert.match(
  source,
  /h-\[33px\][^"]*px-3[^"]*border-t[^"]*justify-between/,
  'sidebar footer should use the compact 33px height aligned with the editor footer'
);

assert.match(
  source,
  /h-\[25px\][^"]*max-w-\[117px\][^"]*px-\[11px\][^"]*justify-center[^"]*rounded-full[^"]*bg-gradient-to-r/,
  'user menu trigger should be about 10% smaller while staying centered on the nickname'
);

assert.match(
  source,
  /truncate text-\[11px\] font-medium/,
  'user menu trigger nickname text should scale down with the smaller chip'
);

assert.match(
  source,
  /Array\.from\(displayName\)/,
  'user menu trigger should count nickname characters before truncating'
);

assert.match(
  source,
  /displayNameForChip/,
  'user menu trigger should use a dedicated truncated nickname for the compact chip'
);

assert.match(
  source,
  /displayNameChars\.length > 5[\s\S]*slice\(0, 5\)[\s\S]*'…'/,
  'user menu trigger should show an ellipsis when the nickname is longer than 5 characters'
);

assert.doesNotMatch(
  source,
  /userInitial/,
  'user menu trigger should only show the full nickname once, without an extra initial avatar'
);

assert.match(
  source,
  /flex items-center gap-2 shrink-0/,
  'footer action buttons should use a single uniform gap without extra offsets'
);

assert.doesNotMatch(
  source,
  /ml-\[10px\]/,
  'footer action buttons should not use one-off left margin spacing'
);

assert.match(
  source,
  /className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded-md transition-colors relative"/,
  'notification button should use the smaller 24px square button shape'
);

assert.match(
  source,
  /className="w-6 h-6 flex items-center justify-center bg-purple-500 hover:bg-purple-600 rounded-md transition-colors"/,
  'add button should use the smaller 24px square shape while retaining purple primary styling'
);

console.log('sidebar footer regression tests passed');
