import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { atomicWriteFile } from './studio-service/jsonFiles.js';
import { commitUserRestore, recoverUserRestore, restoreTransactionDir } from './studio-service/restoreTransaction.js';

const root = path.resolve(import.meta.dirname, '..', 'tmp');
await fs.mkdir(root, { recursive: true });
const workspace = await fs.mkdtemp(path.join(root, 'restore-transaction-'));
const entries = ['records.json', 'sessions/one.json', 'jobs.json', 'community-prompts.json', 'assets/one/0.png'];
async function fixture(name) {
  const auth = { userDir: path.join(workspace, name) };
  for (const entry of entries) {
    await atomicWriteFile(path.join(auth.userDir, entry), `old:${entry}`);
    await atomicWriteFile(path.join(restoreTransactionDir(auth), 'staged', entry), `new:${entry}`);
  }
  await atomicWriteFile(path.join(restoreTransactionDir(auth), 'staged', 'session.json'), 'new:session');
  await atomicWriteFile(path.join(auth.userDir, 'backups', 'keep.json'), 'keep backup');
  await atomicWriteFile(path.join(auth.userDir, 'jobs', 'runtime.json'), 'keep runtime');
  return auth;
}
async function checkOld(auth) {
  for (const entry of entries) assert.equal(await fs.readFile(path.join(auth.userDir, entry), 'utf8'), `old:${entry}`);
  await assert.rejects(fs.access(path.join(auth.userDir, 'session.json')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(auth.userDir, 'backups', 'keep.json'), 'utf8'), 'keep backup');
  assert.equal(await fs.readFile(path.join(auth.userDir, 'jobs', 'runtime.json'), 'utf8'), 'keep runtime');
}
try {
  await test('a failed rename restores every original entry', async () => {
    for (let failAt = 1; failAt <= 11; failAt++) {
      const auth = await fixture(`failure-${failAt}`);
      let calls = 0;
      await assert.rejects(commitUserRestore(auth, {
        ...fs, rename: async (...args) => {
          if (++calls === failAt) throw new Error('injected rename failure');
          return fs.rename(...args);
        }
      }), /injected rename failure/);
      await checkOld(auth);
      await recoverUserRestore(auth);
      await checkOld(auth);
    }
  });
  await test('process exit at each rename boundary is recovered on next access', async () => {
    for (let stopAt = 1; stopAt <= 11; stopAt++) {
      const auth = await fixture(`crash-${stopAt}`);
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs/promises';
        import { commitUserRestore } from ${JSON.stringify(new URL('./studio-service/restoreTransaction.js', import.meta.url).href)};
        let calls = 0;
        await commitUserRestore(${JSON.stringify(auth)}, { ...fs, rename: async (...args) => {
          await fs.rename(...args);
          if (++calls === ${stopAt}) process.exit(73);
        }});
      `], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 73, result.stderr);
      await recoverUserRestore(auth);
      await checkOld(auth);
    }
  });
  await test('committed snapshots survive cleanup failure and retain unrelated files', async () => {
    const auth = await fixture('commit');
    await commitUserRestore(auth, { ...fs, rm: async () => { throw new Error('cleanup unavailable'); } });
    await recoverUserRestore(auth);
    for (const entry of entries) assert.equal(await fs.readFile(path.join(auth.userDir, entry), 'utf8'), `new:${entry}`);
    assert.equal(await fs.readFile(path.join(auth.userDir, 'session.json'), 'utf8'), 'new:session');
    assert.equal(await fs.readFile(path.join(auth.userDir, 'backups', 'keep.json'), 'utf8'), 'keep backup');
  });
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}
