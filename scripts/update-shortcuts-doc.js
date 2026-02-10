const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'shortcuts.manifest.json');
const readmePath = path.join(root, 'README.md');

const START = '<!-- shortcuts-table:start -->';
const END = '<!-- shortcuts-table:end -->';

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const readme = fs.readFileSync(readmePath, 'utf8');

const tableLines = [
  '| Shortcut | Action | Scope |',
  '| --- | --- | --- |',
  ...manifest.map((item) => `| \`${item.keys}\` | ${item.action} | ${item.scope} |`)
];

const replacement = `${START}\n${tableLines.join('\n')}\n${END}`;

let updated = readme;
if (readme.includes(START) && readme.includes(END)) {
  updated = readme.replace(new RegExp(`${START}[\\s\\S]*?${END}`, 'm'), replacement);
} else {
  const lines = readme.split(/\r?\n/);
  const anchor = lines.findIndex((line) => line.includes('`Ctrl/Cmd + S`'));
  if (anchor === -1) {
    throw new Error('Cannot find shortcuts table anchor (`Ctrl/Cmd + S`) in README.md');
  }

  let tableStart = anchor;
  while (tableStart - 1 >= 0 && lines[tableStart - 1].trim().startsWith('|')) {
    tableStart -= 1;
  }

  let tableEnd = anchor;
  while (tableEnd + 1 < lines.length && lines[tableEnd + 1].trim().startsWith('|')) {
    tableEnd += 1;
  }

  const replacementLines = replacement.split('\n');
  const newLines = [
    ...lines.slice(0, tableStart),
    ...replacementLines,
    ...lines.slice(tableEnd + 1)
  ];
  updated = newLines.join('\n');
}

fs.writeFileSync(readmePath, updated, 'utf8');
console.log('Shortcut table updated in README.md');
