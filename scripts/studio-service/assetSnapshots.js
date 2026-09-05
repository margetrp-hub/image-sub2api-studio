import fs from 'node:fs/promises';
import path from 'node:path';

export async function listFilesRecursive(rootDir, baseDir = rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath, baseDir));
      continue;
    }
    if (!entry.isFile()) continue;
    files.push({
      path: path.relative(baseDir, fullPath).split(path.sep).join('/'),
      fullPath
    });
  }
  return files;
}

export function safeBackupAssetPath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  const value = rawPath.replace(/\\/g, '/');
  const segments = value.split('/');
  if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..'
    || /[<>:"|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) return '';
  return segments.join('/');
}

export function validateAssetSnapshot(assets) {
  const invalid = () => {
    const error = new Error('BACKUP_ASSET_INVALID');
    error.status = 400;
    return error;
  };
  if (!Array.isArray(assets)) throw invalid();
  const seen = new Set();
  const snapshot = assets.map((asset) => {
    const safePath = safeBackupAssetPath(asset?.path);
    if (!safePath || seen.has(safePath.toLowerCase()) || typeof asset?.data !== 'string'
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0
      || asset.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) {
      throw invalid();
    }
    const buffer = Buffer.from(asset.data, 'base64');
    if (buffer.length !== asset.bytes || buffer.toString('base64') !== asset.data) throw invalid();
    seen.add(safePath.toLowerCase());
    return { path: safePath, bytes: asset.bytes, data: asset.data };
  });
  // A file cannot also be the parent directory of another file, on any host.
  for (const asset of snapshot) {
    const segments = asset.path.toLowerCase().split('/');
    for (let depth = 1; depth < segments.length; depth++) {
      if (seen.has(segments.slice(0, depth).join('/'))) throw invalid();
    }
  }
  return snapshot;
}

export async function readAssetSnapshot(auth) {
  const root = path.join(auth.userDir, 'assets');
  const files = await listFilesRecursive(root);
  const assets = [];
  for (const file of files) {
    const safePath = safeBackupAssetPath(file.path);
    if (!safePath) continue;
    const buffer = await fs.readFile(file.fullPath);
    assets.push({
      path: safePath,
      bytes: buffer.length,
      data: buffer.toString('base64')
    });
  }
  return assets;
}

export async function restoreAssetSnapshot(auth, assets) {
  const snapshot = validateAssetSnapshot(assets);
  const root = path.join(auth.userDir, 'assets');
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  for (const asset of snapshot) {
    const filePath = path.join(root, ...asset.path.split('/'));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(asset.data, 'base64'));
  }
}
