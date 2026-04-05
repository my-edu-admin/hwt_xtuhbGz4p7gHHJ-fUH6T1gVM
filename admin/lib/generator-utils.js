const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function stringOrDefault(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  if (normalized) {
    return normalized;
  }
  return String(fallback ?? "").trim();
}

const LOW_SIGNAL_TEXT_PATTERN =
  /^(?:n\/?a|na|null|none|nothing|test|demo|just demo|sample|placeholder|todo|tbd|coming soon|lorem ipsum|nil|\.+|-+)$/i;

function isMeaningfulText(value, options = {}) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const minimumLength = Number.isFinite(options.minLength) ? Math.max(0, options.minLength) : 1;

  if (!normalized) {
    return false;
  }
  if (LOW_SIGNAL_TEXT_PATTERN.test(normalized)) {
    return false;
  }

  return normalized.length >= minimumLength;
}

function meaningfulStringOrDefault(value, fallback = "", options = {}) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (isMeaningfulText(normalized, options)) {
    return normalized;
  }
  return String(fallback ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStringArray(value) {
  return ensureArray(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const normalized = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeFloat(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const normalized = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeHexColor(value, fallback = "#355da8") {
  const candidate = String(value || "").trim();
  if (/^#?[0-9a-f]{6}$/i.test(candidate)) {
    return `#${candidate.replace(/^#/, "").toLowerCase()}`;
  }
  if (/^#?[0-9a-f]{3}$/i.test(candidate)) {
    const short = candidate.replace(/^#/, "").toLowerCase();
    return `#${short
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return normalizeHexColor(fallback, "#355da8");
}

function normalizeUrl(value) {
  const input = String(value ?? "").trim();
  if (!input) {
    return "";
  }

  if (/^(#|\/|\.\.?\/)/.test(input)) {
    return input;
  }

  if (/^(mailto:|tel:|sms:)/i.test(input)) {
    return input;
  }

  let candidate = input;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value, spacing = 2) {
  const output = spacing == null ? JSON.stringify(value) : JSON.stringify(value, null, spacing);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, output, "utf8");
}

function sanitizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value) {
  return sanitizeSlug(value) || "item";
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeYaml(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

function runCommand(command, args = [], cwd, timeout = 0) {
  const needsShell =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || "").trim());
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: needsShell,
    timeout: timeout > 0 ? timeout : undefined,
    windowsHide: true,
  });

  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const errorLine = result.error ? `\n${result.error.message}` : "";
  const log = `${stdout}${stderr}${errorLine}`.trim();

  return {
    status: typeof result.status === "number" ? result.status : result.error ? 1 : 0,
    stdout,
    stderr,
    log,
  };
}

function trimLog(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  const headLength = Math.max(0, maxLength - 220);
  const tailLength = Math.min(180, text.length - headLength);
  return `${text.slice(0, headLength).trimEnd()}\n...\n${text.slice(-tailLength).trimStart()}`;
}

module.exports = {
  cleanStringArray,
  ensureArray,
  escapeXml,
  escapeYaml,
  isMeaningfulText,
  meaningfulStringOrDefault,
  normalizeFloat,
  normalizeHexColor,
  normalizeInteger,
  normalizeUrl,
  readJson,
  runCommand,
  sanitizePathSegment,
  sanitizeSlug,
  stringOrDefault,
  trimLog,
  writeJson,
};
