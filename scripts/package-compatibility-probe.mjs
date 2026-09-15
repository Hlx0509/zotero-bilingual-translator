import { execFile } from 'node:child_process';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const probe = 'compatibility-probe';
await mkdir(probe, { recursive: true });
await copyFile('manifest.compatibility-probe.json', `${probe}/manifest.json`);
await copyFile('bootstrap.compatibility-probe.js', `${probe}/bootstrap.js`);
await mkdir('../outputs', { recursive: true });
await rm('../outputs/zotero-compatibility-probe-1.0.0.zip', { force: true });
await rm('../outputs/zotero-compatibility-probe-1.0.0.xpi', { force: true });
await run('powershell.exe', ['-NoProfile', '-Command', "Push-Location compatibility-probe; Compress-Archive -Path manifest.json,bootstrap.js -DestinationPath ..\\..\\outputs\\zotero-compatibility-probe-1.0.0.zip -Force; Pop-Location"]);
await rename('../outputs/zotero-compatibility-probe-1.0.0.zip', '../outputs/zotero-compatibility-probe-1.0.0.xpi');
