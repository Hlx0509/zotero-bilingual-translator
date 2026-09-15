import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

test('build emits a loadable bootstrap lifecycle bundle', async () => {
  const bundle = await readFile('bootstrap.js', 'utf8');
  assert.match(bundle, /function startup/);
  assert.match(bundle, /function shutdown/);
});
