import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, copyFile } from 'node:fs/promises';

await import('../esbuild.mjs');
await mkdir('dist', { recursive: true });
await rm('dist/zotero-bilingual-translator-0.1.6.xpi', { force: true });
await new Promise((resolve, reject) => {
  const output = createWriteStream('dist/zotero-bilingual-translator-0.1.6.xpi');
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.file('manifest.json', { name: 'manifest.json' });
  archive.file('bootstrap.js', { name: 'bootstrap.js' });
  archive.file('prefs.js', { name: 'prefs.js' });
  archive.file('prefs.xhtml', { name: 'prefs.xhtml' });
  archive.directory('assets', 'assets');
  archive.finalize();
});
await mkdir('../outputs', { recursive: true });
await copyFile('dist/zotero-bilingual-translator-0.1.6.xpi', '../outputs/zotero-bilingual-translator-0.1.6.xpi');
