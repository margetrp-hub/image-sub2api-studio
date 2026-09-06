import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';

// These are the only entries a personal backup owns. Keep runtime jobs,
// pre-restore backups, and global publications outside the transaction.
const ENTRIES = ['records.json', 'session.json', 'sessions', 'jobs.json', 'community-prompts.json', 'assets'];
const exists = async (file, io = fs) => {
  try { await io.lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
export const restoreTransactionDir = (auth) => path.join(auth.userDir, '.restore-transaction');

// Called under the user lock before any user-data access. A process interrupted
// before the committed marker always rolls back, including between two renames.
export async function recoverUserRestore(auth, io = fs) {
  const root = restoreTransactionDir(auth);
  let journal;
  try { journal = JSON.parse(await io.readFile(path.join(root, 'journal.json'), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await io.rm(root, { recursive: true, force: true });
    return;
  }
  if (!['prepared', 'committed'].includes(journal.phase) || !Array.isArray(journal.entries)
    || journal.entries.length !== ENTRIES.length
    || journal.entries.some((entry, index) => entry.name !== ENTRIES[index] || typeof entry.hadOriginal !== 'boolean')) {
    throw new Error('BACKUP_RESTORE_JOURNAL_INVALID');
  }
  if (journal.phase === 'prepared') {
    for (const { name, hadOriginal } of journal.entries) {
      const original = path.join(auth.userDir, name);
      const previous = path.join(root, 'previous', name);
      if (await exists(previous, io)) {
        await io.rm(original, { recursive: true, force: true });
        await io.rename(previous, original);
      } else if (!hadOriginal) {
        await io.rm(original, { recursive: true, force: true });
      }
    }
  }
  // Rollback is idempotent if cleanup itself is interrupted.
  await io.rm(root, { recursive: true, force: true });
}

export async function commitUserRestore(auth, io = fs) {
  const root = restoreTransactionDir(auth);
  const entries = await Promise.all(ENTRIES.map(async (name) => ({
    name, hadOriginal: await exists(path.join(auth.userDir, name), io)
  })));
  await io.mkdir(path.join(root, 'previous'), { recursive: true });
  await atomicWriteJson(path.join(root, 'journal.json'), { phase: 'prepared', entries });
  try {
    for (const { name, hadOriginal } of entries) {
      if (hadOriginal) await io.rename(path.join(auth.userDir, name), path.join(root, 'previous', name));
      const staged = path.join(root, 'staged', name);
      if (await exists(staged, io)) await io.rename(staged, path.join(auth.userDir, name));
    }
    await atomicWriteJson(path.join(root, 'journal.json'), { phase: 'committed', entries });
  } catch (error) {
    try { await recoverUserRestore(auth, io); }
    catch (recoveryError) { throw new Error('BACKUP_RESTORE_RECOVERY_REQUIRED', { cause: recoveryError }); }
    throw error;
  }
  // Committed data is usable even if cleanup must wait for the next access.
  await io.rm(root, { recursive: true, force: true }).catch(() => {});
}
