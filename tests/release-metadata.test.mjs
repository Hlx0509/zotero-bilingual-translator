import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('formal release metadata', () => {
  it('keeps manifest, package, and GitHub update metadata on version 1.0.1', async () => {
    const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
    const packageJSON = JSON.parse(await readFile('package.json', 'utf8'));
    const updates = await readFile('updates.json', 'utf8').then(JSON.parse).catch(() => null);
    const release = updates?.addons?.['bilingual-translator@example.com']?.updates?.[0];

    expect(manifest.version).toBe('1.0.1');
    expect(packageJSON.version).toBe('1.0.1');
    expect(manifest.applications.zotero.update_url).toBe(
      'https://raw.githubusercontent.com/Hlx0509/zotero-bilingual-translator/main/updates.json',
    );
    expect(release).toMatchObject({
      version: '1.0.1',
      update_link: 'https://github.com/Hlx0509/zotero-bilingual-translator/releases/download/v1.0.1/zotero-bilingual-translator-1.0.1.xpi',
    });
  });
});
