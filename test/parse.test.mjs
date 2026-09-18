import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseNameStatusZ, parseLogLines, toPosixPath, buildShowSpec, encodeDiffQuery, decodeDiffQuery } =
  require('../out-test-parse/gitParse.js');

test('parseNameStatusZ: M/A/D (-z はNUL区切り)', () => {
  const raw = 'M\0foo.ts\0A\0new file.ts\0D\0old/消えた.txt\0';
  const entries = parseNameStatusZ(raw);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].path, 'foo.ts');
  assert.equal(entries[0].rawStatus, 'M');
  assert.equal(entries[1].status, 'A');
  assert.equal(entries[2].path, 'old/消えた.txt');
});

test('parseNameStatusZ: rename (-z はNUL区切り)', () => {
  const raw = 'R100\0old.ts\0new.ts\0';
  const [e] = parseNameStatusZ(raw);
  assert.equal(e.status, 'R');
  assert.equal(e.rawStatus, 'R100');
  assert.equal(e.oldPath, 'old.ts');
  assert.equal(e.path, 'new.ts');
});

test('parseNameStatusZ: 非-z形式も許容', () => {
  const raw = 'M\tfoo.ts\nR100\told.ts\tnew.ts\n';
  const entries = parseNameStatusZ(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].oldPath, 'old.ts');
});

test('toPosixPath converts backslash', () => {
  assert.equal(toPosixPath('C:\\repo\\a b\\f.ts'), 'C:/repo/a b/f.ts');
});

test('buildShowSpec strips leading slash', () => {
  assert.equal(buildShowSpec('abc123', '/src/a.ts'), 'abc123:src/a.ts');
});

test('diff query round-trip with spaces/unicode', () => {
  const q = encodeDiffQuery('C:\\r e\\日本語', 'abc', 'left');
  const d = decodeDiffQuery(q);
  assert.equal(d.repo, 'C:\\r e\\日本語');
  assert.equal(d.rev, 'abc');
});

test('parseLogLines', () => {
  const raw = 'abc\x00msg\x00taro\x002026-01-01\x00\n';
  const [c] = parseLogLines(raw);
  assert.equal(c.hash, 'abc');
  assert.equal(c.subject, 'msg');
});
