const fs = require("fs");
const path = require("path");

function createBackupManager(options = {}) {
  const projectRoot = path.resolve(String(options.projectRoot || process.cwd()));
  const backupRoot = path.resolve(String(options.backupRoot || path.join(projectRoot, "backup")));
  const trackedPaths = Array.isArray(options.trackedPaths) ? options.trackedPaths : [];

  ensureDir(backupRoot);

  return {
    listBackups,
    createBackup,
    restoreBackup,
    getBackupRoot: () => backupRoot,
  };

  function listBackups() {
    ensureDir(backupRoot);
    return fs
      .readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readBackupSummary(entry.name))
      .filter(Boolean)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  }

  function createBackup(payload = {}) {
    const createdAt = new Date().toISOString();
    const backupId = `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${sanitizeName(payload.label || "snapshot")}`;
    const snapshotDir = resolveBackupPath(backupId);

    if (fs.existsSync(snapshotDir)) {
      throw new Error(`Backup "${backupId}" already exists.`);
    }

    ensureDir(snapshotDir);
    const manifest = {
      id: backupId,
      label: String(payload.label || "Snapshot").trim() || "Snapshot",
      note: String(payload.note || "").trim(),
      created_at: createdAt,
      project_root: projectRoot,
      items: trackedPaths.map((item) => {
        const relativePath = normalizeRelativePath(item.relativePath);
        const sourcePath = resolveProjectPath(relativePath);
        const targetPath = path.join(snapshotDir, relativePath);
        const exists = fs.existsSync(sourcePath);
        if (exists) {
          copyEntry(sourcePath, targetPath, { filter: shouldSnapshotPath });
        }
        return {
          label: String(item.label || relativePath),
          relative_path: relativePath,
          exists,
        };
      }),
    };

    writeJson(path.join(snapshotDir, "manifest.json"), manifest);
    return {
      backup: readBackupSummary(backupId),
      backups: listBackups(),
    };
  }

  function restoreBackup(backupIdValue) {
    const backupId = sanitizeBackupId(backupIdValue);
    const snapshotDir = resolveBackupPath(backupId);
    if (!fs.existsSync(snapshotDir)) {
      throw new Error("Backup not found.");
    }

    const manifest = readJson(path.join(snapshotDir, "manifest.json"));
    if (!manifest) {
      throw new Error("Backup manifest is missing.");
    }

    for (const item of Array.isArray(manifest.items) ? manifest.items : []) {
      const relativePath = normalizeRelativePath(item.relative_path);
      const livePath = resolveProjectPath(relativePath);
      const sourcePath = path.join(snapshotDir, relativePath);

      if (!item.exists || !fs.existsSync(sourcePath)) {
        removeEntry(livePath);
        continue;
      }
      restoreEntry(sourcePath, livePath, relativePath);
    }

    return {
      restored_at: new Date().toISOString(),
      backup: readBackupSummary(backupId),
      backups: listBackups(),
    };
  }

  function readBackupSummary(backupId) {
    const manifest = readJson(path.join(resolveBackupPath(backupId), "manifest.json"));
    if (!manifest) {
      return null;
    }

    const copiedCount = (manifest.items || []).filter((item) => item.exists).length;
    return {
      id: manifest.id,
      label: manifest.label,
      note: manifest.note,
      created_at: manifest.created_at,
      item_count: copiedCount,
      items: manifest.items || [],
    };
  }

  function resolveBackupPath(backupId) {
    const normalized = sanitizeBackupId(backupId);
    const resolved = path.resolve(backupRoot, normalized);
    if (!resolved.startsWith(backupRoot)) {
      throw new Error("Invalid backup path.");
    }
    return resolved;
  }

  function resolveProjectPath(relativePath) {
    const resolved = path.resolve(projectRoot, normalizeRelativePath(relativePath));
    if (!resolved.startsWith(projectRoot)) {
      throw new Error("Invalid restore target.");
    }
    return resolved;
  }
}

function copyEntry(sourcePath, targetPath, options = {}) {
  const sourceStat = fs.statSync(sourcePath);
  ensureDir(path.dirname(targetPath));
  if (sourceStat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
      filter: typeof options.filter === "function" ? options.filter : undefined,
    });
    return;
  }
  fs.copyFileSync(sourcePath, targetPath);
}

function restoreEntry(sourcePath, targetPath, relativePath) {
  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isDirectory()) {
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  restoreDirectory(sourcePath, targetPath, relativePath);
}

function restoreDirectory(sourceDir, targetDir, relativePath) {
  ensureDir(targetDir);
  const preservedNames = getPreservedNames(relativePath);

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (preservedNames.has(entry.name)) {
      continue;
    }
    removeEntry(path.join(targetDir, entry.name));
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    restoreEntry(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
      path.posix.join(normalizeRelativePath(relativePath), entry.name)
    );
  }
}

function removeEntry(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function shouldSnapshotPath(sourcePath) {
  const normalized = String(sourcePath || "").replace(/\\/g, "/");
  if (!normalized) {
    return false;
  }
  if (/(^|\/)\.git($|\/)/.test(normalized)) {
    return false;
  }
  if (/(^|\/)backup($|\/)/.test(normalized)) {
    return false;
  }
  if (/(^|\/)node_modules($|\/)/.test(normalized)) {
    return false;
  }
  if (/\/admin\/\.runtime(\/|$)/.test(normalized)) {
    return false;
  }
  return true;
}

function getPreservedNames(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "admin") {
    return new Set(["node_modules", ".runtime"]);
  }
  if (normalized === "user") {
    return new Set(["node_modules"]);
  }
  return new Set();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeBackupId(value) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  if (!normalized) {
    throw new Error("Backup id is required.");
  }
  return normalized;
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.split("/").includes("..")) {
    throw new Error(`Invalid project path "${value}".`);
  }
  return normalized;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "snapshot";
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

module.exports = {
  createBackupManager,
};
