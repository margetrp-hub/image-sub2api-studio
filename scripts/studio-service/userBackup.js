import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';
import { readAssetSnapshot, restoreAssetSnapshot, validateAssetSnapshot } from './assetSnapshots.js';

export function createUserBackupService({
  serviceVersion,
  normalizeSessionId,
  normalizeRecordId,
  ensureUserDirs,
  backupsDir,
  sessionPath,
  sessionsDir,
  readRecords,
  writeRecords,
  readSessionSnapshot,
  writeSession,
  readJobs,
  writeJobs,
  readCommunityPrompts,
  writeCommunityPrompts
}) {
  async function buildUserBackup(auth, reason = 'manual') {
    const [records, sessionSnapshot, jobs, communityPrompts, assets] = await Promise.all([
      readRecords(auth),
      readSessionSnapshot(auth),
      readJobs(auth),
      readCommunityPrompts(auth),
      readAssetSnapshot(auth)
    ]);
    return {
      ok: true,
      kind: 'image-agent-studio.user-backup',
      legacyKind: 'ai-image-workbench.user-backup',
      version: 1,
      serviceVersion,
      createdAt: new Date().toISOString(),
      reason,
      user: {
        id: auth.user?.id || auth.user?.user?.id || auth.user?.email || auth.user?.username || auth.userKey,
        key: auth.userKey
      },
      counts: {
        records: records.length,
        jobs: jobs.length,
        communityPrompts: communityPrompts.length,
        assets: assets.length,
        hasSession: Boolean(sessionSnapshot.legacy) || sessionSnapshot.sessions.length > 0,
        sessions: sessionSnapshot.sessions.length
      },
      data: {
        records,
        session: sessionSnapshot.legacy,
        sessions: sessionSnapshot.sessions,
        jobs,
        communityPrompts,
        assets
      }
    };
  }

  async function saveUserBackup(auth, reason = 'pre-restore') {
    await fs.mkdir(backupsDir(auth), { recursive: true });
    const backup = await buildUserBackup(auth, reason);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${stamp}-${reason}.json`;
    const filePath = path.join(backupsDir(auth), fileName);
    await atomicWriteJson(filePath, backup);
    return { fileName, filePath, backup };
  }

  function validateUserBackup(payload) {
    if (!payload || typeof payload !== 'object') {
      const error = new Error('BACKUP_PAYLOAD_REQUIRED');
      error.status = 400;
      throw error;
    }
    const supportedKinds = new Set(['image-agent-studio.user-backup', 'ai-image-workbench.user-backup']);
    if (!supportedKinds.has(payload.kind) || payload.version !== 1) {
      const error = new Error('BACKUP_FORMAT_UNSUPPORTED');
      error.status = 400;
      throw error;
    }
    const invalid = () => {
      const error = new Error('BACKUP_DATA_INVALID');
      error.status = 400;
      return error;
    };
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const data = payload.data;
    if (!isObject(data) || !Array.isArray(data.records) || !Array.isArray(data.jobs)
      || !Array.isArray(data.assets) || !(data.session === null || isObject(data.session))) throw invalid();
    const objects = (value) => {
      if (!Array.isArray(value) || value.some((item) => !isObject(item))) throw invalid();
      return value;
    };
    const unique = (values, key) => {
      if (new Set(values.map((value) => value[key])).size !== values.length) throw invalid();
      return values;
    };
    const records = unique(objects(data.records).map((record) => ({ ...record, id: normalizeRecordId(record.id) })), 'id');
    const session = data.session ? { ...data.session, sessionId: normalizeSessionId(data.session.sessionId) } : null;
    // Version 1 exports predating multi-session/community support omit these fields.
    const sessions = unique(objects(data.sessions === undefined ? [] : data.sessions)
      .map((item) => ({ ...item, sessionId: normalizeSessionId(item.sessionId, { allowEmpty: false }) })), 'sessionId');
    if (new Set(sessions.map((item) => item.sessionId.toLowerCase())).size !== sessions.length) throw invalid();
    const jobs = unique(objects(data.jobs), 'id');
    if (jobs.some((job) => typeof job.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(job.id))) throw invalid();
    const communityPrompts = unique(objects(data.communityPrompts === undefined ? [] : data.communityPrompts), 'id');
    if (communityPrompts.some((item) => typeof item.id !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(item.id)
      || typeof item.prompt !== 'string' || !item.prompt.trim())) throw invalid();
    return {
      records,
      session,
      sessions,
      jobs,
      communityPrompts,
      assets: validateAssetSnapshot(data.assets)
    };
  }

  async function restoreUserBackup(auth, payload) {
    const snapshot = validateUserBackup(payload);
    const preRestore = await saveUserBackup(auth, 'pre-restore');
    await ensureUserDirs(auth);
    await writeRecords(auth, snapshot.records);
    if (snapshot.session) {
      await writeSession(auth, snapshot.session);
    } else {
      await fs.rm(sessionPath(auth), { force: true });
    }
    await fs.rm(sessionsDir(auth), { recursive: true, force: true });
    for (const session of snapshot.sessions) {
      await writeSession(auth, session, session.sessionId);
    }
    await writeJobs(auth, snapshot.jobs);
    await writeCommunityPrompts(auth, snapshot.communityPrompts);
    await restoreAssetSnapshot(auth, snapshot.assets);
    return {
      ok: true,
      restoredAt: new Date().toISOString(),
      preRestoreBackup: preRestore.fileName,
      counts: {
        records: snapshot.records.length,
        jobs: snapshot.jobs.length,
        communityPrompts: snapshot.communityPrompts.length,
        assets: snapshot.assets.length,
        hasSession: Boolean(snapshot.session) || snapshot.sessions.length > 0,
        sessions: snapshot.sessions.length
      }
    };
  }

  return {
    buildUserBackup,
    saveUserBackup,
    validateUserBackup,
    restoreUserBackup
  };
}
