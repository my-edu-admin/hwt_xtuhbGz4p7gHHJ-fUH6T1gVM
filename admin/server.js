const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const LOCATION_CATALOG = require("./config/location-catalog");
const { createGeneratorStudio } = require("./lib/generator-studio");
const { createBackupManager } = require("./lib/backup-manager");

const ENV = loadEnvFile(path.join(__dirname, ".env"));
const app = express();
const PORT = normalizeInteger(ENV.ADMIN_PORT) ?? 3000;
const HOST = stringOrDefault(ENV.ADMIN_HOST, "0.0.0.0");
const SERVE_USER_BUILD = normalizeBoolean(ENV.ADMIN_SERVE_USER_BUILD, true);
const ALLOW_REMOTE_ADMIN_ACCESS = normalizeBoolean(ENV.ADMIN_ALLOW_REMOTE_ACCESS, false);
const USER_STATIC_ROUTE = normalizeRoutePath(ENV.ADMIN_USER_ROUTE, "/user");
const DEFAULT_DB_REPO_CLONE_SUBPATH = "admin/db-mirror-repo";
const PROJECT_ROOT = path.join(__dirname, "..");
let adminServer = null;
let adminShutdownScheduled = false;
const adminSockets = new Set();

const DATA_DIR = path.join(__dirname, "data");
const BASIC_DIR = path.join(DATA_DIR, "basic");
const DETAILED_DIR = path.join(DATA_DIR, "detailed");
const PAYMENTS_DIR = path.join(DATA_DIR, "payments");
const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const STAFF_FILE = path.join(DATA_DIR, "staff.json");
const CALENDAR_EVENTS_FILE = path.join(DATA_DIR, "calendar-events.json");
const EMAIL_LOG_FILE = path.join(DATA_DIR, "email-log.json");
const PLAN_CATALOG_FILE = path.join(__dirname, "config", "plan-catalog.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const BASIC_INDEX_FILE = path.join(BASIC_DIR, "_cards.json");
const BASIC_INDEX_NAME = path.basename(BASIC_INDEX_FILE);
const USER_DIST_DIR = path.join(PROJECT_ROOT, "user", "dist");
const HAS_USER_DIST = SERVE_USER_BUILD && fs.existsSync(USER_DIST_DIR);
const ADMIN_ENV_FILE = path.join(__dirname, ".env");
const USER_ENV_FILE = path.join(PROJECT_ROOT, "user", ".env");
const USER_DATA_ROOT = path.join(PROJECT_ROOT, "user_data");
const USER_OUT_ROOT = path.join(PROJECT_ROOT, "user_out");
const BACKUP_ROOT = path.join(PROJECT_ROOT, "backup");
const ENV_CONFIG_SCHEMA = {
  admin: {
    title: "Admin Env",
    file_path: ADMIN_ENV_FILE,
    description: "Server, source repository, and DB mirror settings used by the admin desktop.",
    restart_note: "Restart the admin server after saving these values.",
    sections: [
      {
        title: "Server",
        description: "Core admin server behavior.",
        fields: [
          {
            key: "ADMIN_HOST",
            label: "Admin Host",
            placeholder: "0.0.0.0",
            example: "0.0.0.0",
            description: "Host binding for the admin server.",
          },
          {
            key: "ADMIN_PORT",
            label: "Admin Port",
            placeholder: "3000",
            example: "3000",
            description: "Port used by the admin server.",
          },
          {
            key: "ADMIN_SERVE_USER_BUILD",
            label: "Serve Built User App",
            placeholder: "true",
            example: "true",
            description: "Serve the built user app from the admin server.",
          },
          {
            key: "ADMIN_USER_ROUTE",
            label: "User App Route",
            placeholder: "/user",
            example: "/user",
            description: "Route where the built user app is mounted.",
          },
          {
            key: "ADMIN_ALLOW_REMOTE_ACCESS",
            label: "Allow Remote Admin Access",
            placeholder: "false",
            example: "false",
            description:
              "Keep false to restrict the admin desktop and private admin APIs to localhost while leaving `/user` and `/api/public/*` available.",
          },
        ],
      },
      {
        title: "Source Repo",
        description: "Full project repository used by Source App.",
        fields: [
          {
            key: "ADMIN_GIT_REPO_PATH",
            label: "Source Repo Path",
            placeholder: ".",
            example: ".",
            description: "Relative or absolute path to the full source repository.",
          },
          {
            key: "ADMIN_GIT_REMOTE",
            label: "Source Remote",
            placeholder: "origin",
            example: "origin",
            description: "Git remote name for the full source repository.",
          },
          {
            key: "ADMIN_GIT_DEFAULT_BRANCH",
            label: "Source Default Branch",
            placeholder: "main",
            example: "main",
            description: "Fallback branch used when git cannot infer the current branch.",
          },
        ],
      },
      {
        title: "DB Mirror",
        description: "Public business data mirror repository used by DB Manager.",
        fields: [
          {
            key: "ADMIN_DB_REPO_PATH",
            label: "DB Repo Path Or URL",
            placeholder: "../school-dnd-public-data",
            example: "https://github.com/<user>/<repo> or ../school-dnd-public-data",
            description:
              "Local path to the public-data repository, or a GitHub repository URL. When you enter a URL, the app clones and uses a local mirror at admin/db-mirror-repo.",
          },
          {
            key: "ADMIN_DB_REMOTE",
            label: "DB Remote",
            placeholder: "origin",
            example: "origin",
            description: "Git remote name for the DB mirror repository.",
          },
          {
            key: "ADMIN_DB_DEFAULT_BRANCH",
            label: "DB Default Branch",
            placeholder: "main",
            example: "main",
            description: "Fallback branch used by DB Manager.",
          },
          {
            key: "ADMIN_DB_BASIC_TARGET",
            label: "Basic Target Folder",
            placeholder: "basic",
            example: "basic",
            description: "Folder inside the DB repository where `_cards.json` is mirrored.",
          },
          {
            key: "ADMIN_DB_DETAILED_TARGET",
            label: "Detailed Target Folder",
            placeholder: "detailed",
            example: "detailed",
            description: "Folder inside the DB repository where per-business JSON files are mirrored.",
          },
        ],
      },
      {
        title: "Email Delivery",
        description: "SMTP settings used by the Mail Center to send individual or bulk business and staff emails.",
        fields: [
          {
            key: "ADMIN_SMTP_HOST",
            label: "SMTP Host",
            placeholder: "smtp.gmail.com",
            example: "smtp.gmail.com",
            description: "SMTP server host used for outbound mail.",
          },
          {
            key: "ADMIN_SMTP_PORT",
            label: "SMTP Port",
            placeholder: "587",
            example: "587",
            description: "SMTP server port. Use 465 for implicit TLS or 587 for STARTTLS.",
          },
          {
            key: "ADMIN_SMTP_SECURE",
            label: "SMTP Secure",
            placeholder: "false",
            example: "false",
            description: "Set true for implicit TLS connections such as port 465.",
          },
          {
            key: "ADMIN_SMTP_USER",
            label: "SMTP Username",
            placeholder: "no-reply@example.com",
            example: "no-reply@example.com",
            description: "SMTP authentication username.",
          },
          {
            key: "ADMIN_SMTP_PASS",
            label: "SMTP Password",
            placeholder: "app-password",
            example: "app-password",
            description: "SMTP password or app password used to authenticate mail sends.",
          },
          {
            key: "ADMIN_EMAIL_FROM_NAME",
            label: "From Name",
            placeholder: "EduData Nepal",
            example: "EduData Nepal",
            description: "Display name shown in outbound emails.",
          },
          {
            key: "ADMIN_EMAIL_FROM_ADDRESS",
            label: "From Address",
            placeholder: "no-reply@example.com",
            example: "no-reply@example.com",
            description: "From email address used for outbound emails.",
          },
          {
            key: "ADMIN_EMAIL_REPLY_TO",
            label: "Reply-To",
            placeholder: "support@example.com",
            example: "support@example.com",
            description: "Optional reply-to address if replies should go somewhere else.",
          },
        ],
      },
    ],
  },
  user: {
    title: "User Env",
    file_path: USER_ENV_FILE,
    description: "Frontend build and public data source settings used by the user app.",
    restart_note: "Restart the user dev server or rebuild the user app after saving these values.",
    sections: [
      {
        title: "Local Dev",
        description: "Local Vite dev server behavior.",
        fields: [
          {
            key: "VITE_ADMIN_API_ORIGIN",
            label: "Admin API Origin",
            placeholder: "http://localhost:3000",
            example: "http://localhost:3000",
            description: "API origin used by the user app during local development.",
          },
          {
            key: "VITE_DEV_HOST",
            label: "User Dev Host",
            placeholder: "0.0.0.0",
            example: "0.0.0.0",
            description: "Host binding for the user Vite dev server.",
          },
          {
            key: "VITE_DEV_PORT",
            label: "User Dev Port",
            placeholder: "5173",
            example: "5173",
            description: "Port used by the user Vite dev server.",
          },
        ],
      },
      {
        title: "Build & Data",
        description: "Standalone deploy settings and public data source.",
        fields: [
          {
            key: "VITE_USER_BASE",
            label: "User Build Base",
            placeholder: "/user/",
            example: "/user/",
            description: "Base path used when building the user app.",
          },
          {
            key: "VITE_PUBLIC_DATA_ROOT",
            label: "Public Data Root",
            placeholder: "https://raw.githubusercontent.com/<user>/<repo>/<branch>/data",
            example: "https://raw.githubusercontent.com/<user>/<repo>/<branch>/data",
            description: "GitHub Raw folder used by the user app in standalone deployments. Leave blank to use the local admin API.",
          },
        ],
      },
    ],
  },
};

const PLAN_CATALOG = loadPlanCatalog();
const DEFAULT_SUBSCRIPTION_PLAN = PLAN_CATALOG.default_label;
const DEFAULT_SUBSCRIPTION_CURRENCY = PLAN_CATALOG.currency;
const PROVINCES = Array.isArray(LOCATION_CATALOG?.provinces) ? LOCATION_CATALOG.provinces : [];
const ZONES = Array.isArray(LOCATION_CATALOG?.zones) ? LOCATION_CATALOG.zones : [];
const DISTRICT_CATALOG = Array.isArray(LOCATION_CATALOG?.districts) ? LOCATION_CATALOG.districts : [];
const PROVINCE_NAMES = Object.fromEntries(PROVINCES.map((province) => [String(province.id), String(province.name)]));
const ZONE_NAMES = Object.fromEntries(ZONES.map((zone) => [String(zone.id), String(zone.name)]));
const DISTRICT_LOOKUP = new Map(
  DISTRICT_CATALOG.map((district) => [String(district.name || "").trim().toLowerCase(), district])
);
const DISTRICTS_BY_PROVINCE = DISTRICT_CATALOG.reduce((accumulator, district) => {
  const provinceId = String(district.province_id || "").trim();
  if (!provinceId) {
    return accumulator;
  }
  if (!accumulator[provinceId]) {
    accumulator[provinceId] = [];
  }
  accumulator[provinceId].push(String(district.name || "").trim());
  accumulator[provinceId].sort((left, right) => left.localeCompare(right));
  return accumulator;
}, {});
const ZONES_BY_PROVINCE = DISTRICT_CATALOG.reduce((accumulator, district) => {
  const provinceId = String(district.province_id || "").trim();
  const zoneId = String(district.zone_id || "").trim();
  if (!provinceId || !zoneId) {
    return accumulator;
  }
  if (!accumulator[provinceId]) {
    accumulator[provinceId] = new Set();
  }
  accumulator[provinceId].add(zoneId);
  return accumulator;
}, {});

[BASIC_DIR, DETAILED_DIR, PAYMENTS_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
fs.mkdirSync(USER_DATA_ROOT, { recursive: true });
fs.mkdirSync(USER_OUT_ROOT, { recursive: true });
if (!fs.existsSync(NOTES_FILE)) {
  writeJson(NOTES_FILE, []);
}
if (!fs.existsSync(EXPENSES_FILE)) {
  writeJson(EXPENSES_FILE, []);
}
if (!fs.existsSync(STAFF_FILE)) {
  writeJson(STAFF_FILE, []);
}
if (!fs.existsSync(CALENDAR_EVENTS_FILE)) {
  writeJson(CALENDAR_EVENTS_FILE, []);
}
if (!fs.existsSync(EMAIL_LOG_FILE)) {
  writeJson(EMAIL_LOG_FILE, []);
}

const generatorStudio = createGeneratorStudio({
  userDataRoot: USER_DATA_ROOT,
  userOutRoot: USER_OUT_ROOT,
});
const backupManager = createBackupManager({
  projectRoot: PROJECT_ROOT,
  backupRoot: BACKUP_ROOT,
  trackedPaths: [
    { relativePath: "admin", label: "Admin App" },
    { relativePath: "user", label: "User App" },
    { relativePath: "user_data", label: "Generator Data" },
    { relativePath: "user_out", label: "Generator Output" },
    { relativePath: "README.md", label: "README" },
    { relativePath: ".gitignore", label: "Git Ignore" },
    { relativePath: "package.json", label: "Root Package" },
  ],
});

let basicCards = loadBasicCards();
let basicCardsBySlug = buildBasicCardMap(basicCards);
let revenuePaymentsCache = null;
let adminDirectoryListCache = null;
let publicDirectoryListCache = null;
const detailedRecordCache = new Map();

scheduleDirectoryCacheWarmup();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(restrictPrivateAdminSurface);
app.get("/location-catalog.js", (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  res.sendFile(path.join(__dirname, "config", "location-catalog.js"));
});
app.use(express.static(path.join(__dirname, "public")));
if (HAS_USER_DIST) {
  app.use(USER_STATIC_ROUTE, express.static(USER_DIST_DIR));
  app.get(new RegExp(`^${escapeRegExp(USER_STATIC_ROUTE)}(?:/.*)?$`), (req, res, next) => {
    const relativePath = String(req.path || "").slice(USER_STATIC_ROUTE.length);
    if (path.extname(relativePath)) {
      return next();
    }
    res.sendFile(path.join(USER_DIST_DIR, "index.html"));
  });
}

app.get("/api/admin/session", (req, res) => {
  if (!canAccessPrivateAdmin(req)) {
    return denyPrivateAdminRequest(req, res);
  }

  res.set("Cache-Control", "no-store");
  return res.json({
    success: true,
    authenticated: true,  // Always authenticated - password protection removed
    password_required: false,
  });
});

app.get("/api/list", (req, res) => {
  try {
    if (normalizeBoolean(req.query?.recheck)) {
      recheckAdminFilesystem();
    }
    res.json({
      success: true,
      data: getAdminDirectoryList(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/public/list", (req, res) => {
  try {
    const list = getPublicDirectoryList();
    res.json({
      success: true,
      data: list,
      meta: getPublicDirectoryMeta(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/public/meta", (req, res) => {
  try {
    res.json({
      success: true,
      data: getPublicDirectoryMeta(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/get/:slug", (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    const basic = basicCardsBySlug.get(slug) || readLegacyBasicCard(slug) || {};
    const detailed = readDetailedRecord(slug);

    if (!detailed && !basic.slug) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    res.json({
      success: true,
      data: attachGenerationStatus(
        decorateRecord(mergeBusinessRecords(basic, detailed || {}), {
          includePaymentHistory: true,
          includePaymentReferenceInSearch: true,
        })
      ),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/public/get/:slug", (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    const basic = basicCardsBySlug.get(slug) || readLegacyBasicCard(slug) || {};
    const detailed = readDetailedRecord(slug);

    if (!detailed && !basic.slug) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const record = decorateRecord(mergeBusinessRecords(basic, detailed || {}), {
      includePaymentHistory: false,
      includePaymentReferenceInSearch: false,
    });
    if (!isPublicRecordVisible(record)) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    res.json({
      success: true,
      data: toPublicRecord(record),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/meta/plans", (req, res) => {
  res.json({
    success: true,
    data: PLAN_CATALOG,
  });
});

app.post("/api/admin/recheck", (req, res) => {
  try {
    const data = recheckAdminFilesystem();
    res.json({
      success: true,
      data,
      message: "Admin filesystem rechecked.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/meta/locations", (req, res) => {
  res.json({
    success: true,
    data: buildLocationCatalogSnapshot(),
  });
});

app.post("/api/save", async (req, res) => {
  try {
    const payload = req.body || {};
    const name = stringOrDefault(payload.name);
    const slug = sanitizeSlug(payload.slug);
    const originalSlug = sanitizeSlug(payload.original_slug || payload.slug);

    if (!name || !slug) {
      return res.status(400).json({ success: false, error: "name and slug are required" });
    }

    const sourceSlug = originalSlug || slug;
    const existingBasic =
      basicCardsBySlug.get(sourceSlug) ||
      readLegacyBasicCard(sourceSlug) ||
      basicCardsBySlug.get(slug) ||
      readLegacyBasicCard(slug) ||
      {};
    const existingDetailed = readDetailedRecord(sourceSlug) || readDetailedRecord(slug) || {};

    if (sourceSlug !== slug) {
      const conflictingCard = basicCardsBySlug.get(slug) || readLegacyBasicCard(slug);
      const conflictingDetailed = readDetailedRecord(slug);
      const currentId = existingBasic.id || existingDetailed.id || "";
      const conflictingId = conflictingCard?.id || conflictingDetailed?.id || "";

      if (conflictingId && conflictingId !== currentId) {
        return res.status(409).json({
          success: false,
          error: `A business with slug "${slug}" already exists.`,
        });
      }
    }

    const now = new Date().toISOString();
    const existingSubscription = existingDetailed.subscription || existingBasic.subscription || {};
    const existingPaymentHistory = loadPaymentHistory(
      sourceSlug || slug,
      existingDetailed.payment_history || []
    );
    const subscription = buildSubscriptionFromSave(payload.subscription, existingSubscription, now);
    const paymentHistory = buildPaymentHistory(
      existingPaymentHistory,
      subscription,
      existingSubscription,
      payload.subscription
    );
    const basic = buildBasicCard(payload, existingBasic, existingDetailed, subscription, now);
    const registration = buildRegistrationSummary(
      payload.registration,
      existingDetailed.registration || existingBasic.registration,
      {
        createdAt: existingDetailed.registration?.created_at || existingBasic.registration?.created_at || now,
        updatedAt: now,
      }
    );
    const institutionHead = buildInstitutionHeadSummary(
      payload.institution_head,
      existingDetailed.institution_head || existingBasic.institution_head,
      payload.contact,
      payload.name
    );
    const idCard = buildIdCardSummary(
      payload.id_card,
      existingDetailed.id_card || existingBasic.id_card,
      {
        businessId: basic.id,
        businessName: basic.name,
        institutionHead,
        createdAt: existingDetailed.id_card?.generated_at || existingBasic.id_card?.generated_at || now,
        updatedAt: now,
      }
    );
    const existingMedia = existingDetailed.media || {};
    const incomingMedia = payload.media || {};

    const detailed = {
      ...basic,
      registration,
      institution_head: institutionHead,
      id_card: idCard,
      description: stringOrDefault(payload.description),
      contact: {
        address: stringOrDefault(payload.contact?.address),
        phone: cleanStringArray(payload.contact?.phone),
        email: stringOrDefault(payload.contact?.email),
        website: stringOrDefault(payload.contact?.website),
        map: {
          lat: normalizeFloat(payload.contact?.map?.lat),
          lng: normalizeFloat(payload.contact?.map?.lng),
        },
      },
      stats: {
        students: normalizeInteger(payload.stats?.students),
        faculty: normalizeInteger(payload.stats?.faculty),
        rating: normalizeFloat(payload.stats?.rating),
        programs_count:
          normalizeInteger(payload.stats?.programs_count) ??
          (cleanStringArray(payload.programs).length || null),
      },
      media: {
        logo: basic.logo,
        cover: basic.cover,
        gallery: cleanStringArray(
          Array.isArray(incomingMedia.gallery) ? incomingMedia.gallery : existingMedia.gallery
        ),
        videos: cleanStringArray(
          Array.isArray(incomingMedia.videos) ? incomingMedia.videos : existingMedia.videos
        ),
      },
      facilities: cleanStringArray(payload.facilities),
      social: {
        facebook: stringOrDefault(payload.social?.facebook),
        instagram: stringOrDefault(payload.social?.instagram),
        youtube: stringOrDefault(payload.social?.youtube),
        twitter: stringOrDefault(payload.social?.twitter),
      },
    };

    writeDetailedRecord(slug, detailed);
    savePaymentHistory(slug, paymentHistory);
    saveBasicCard(basic, sourceSlug);

    removeIfExists(filePathFor(BASIC_DIR, slug));
    if (sourceSlug && sourceSlug !== slug) {
      removeDetailedRecord(sourceSlug);
      removeIfExists(filePathFor(BASIC_DIR, sourceSlug));
      removePaymentHistory(sourceSlug);
    }
    invalidateRevenueCache();

    const notifications = {
      registration_id: basic.id,
      confirmation_email: {
        attempted: false,
        ok: false,
        email: stringOrDefault(detailed.contact?.email),
        message: "",
      },
    };

    const shouldSendConfirmation = normalizeBoolean(
      payload.registration?.send_confirmation_email,
      false
    );
    if (shouldSendConfirmation) {
      notifications.confirmation_email.attempted = true;
      try {
        const delivery = await sendBusinessRegistrationConfirmation(
          decorateRecord(detailed, {
            includePaymentHistory: true,
            includePaymentReferenceInSearch: true,
          }),
          {
            includeIdCard: normalizeBoolean(payload.registration?.send_id_card_email, true),
          }
        );
        notifications.confirmation_email.ok = true;
        notifications.confirmation_email.email = delivery.email;
        notifications.confirmation_email.message = `Registration email sent to ${delivery.email}.`;

        const deliveredDetailed = {
          ...detailed,
          registration: {
            ...detailed.registration,
            confirmation_email_sent_at: delivery.sent_at,
            confirmation_email_error: "",
          },
          id_card: {
            ...detailed.id_card,
            last_sent_at: delivery.sent_at,
            updated_at: delivery.sent_at,
          },
        };
        writeDetailedRecord(slug, deliveredDetailed);
        saveBasicCard(deliveredDetailed, sourceSlug);
      } catch (error) {
        notifications.confirmation_email.message = error.message;
        const failedDetailed = {
          ...detailed,
          registration: {
            ...detailed.registration,
            confirmation_email_error: error.message,
          },
        };
        writeDetailedRecord(slug, failedDetailed);
        saveBasicCard(failedDetailed, sourceSlug);
      }
    }

    const latestDetailed = readDetailedRecord(slug) || detailed;
    const latestBasic = basicCardsBySlug.get(slug) || basic;

    res.json({
      success: true,
      slug,
      basic: decorateRecord(latestBasic, {
        includePaymentHistory: false,
        includePaymentReferenceInSearch: true,
      }),
      detailed: decorateRecord(latestDetailed, {
        includePaymentHistory: true,
        includePaymentReferenceInSearch: true,
      }),
      notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/payment/:slug", (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    const basic = basicCardsBySlug.get(slug) || readLegacyBasicCard(slug) || {};
    const detailed = readDetailedRecord(slug);

    if (!detailed && !basic.slug) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    const current = mergeBusinessRecords(basic, detailed || {});
    const existingSubscription = current.subscription || {};
    const existingPaymentHistory = loadPaymentHistory(slug, current.payment_history);
    const paymentPayload = req.body || {};
    const editingPaymentId = stringOrDefault(paymentPayload.id);
    const editingPayment = existingPaymentHistory.find((entry) => entry.id === editingPaymentId) || null;
    const paymentDate = normalizeDateInput(paymentPayload.paid_at) || new Date();
    const resolvedPlan = stringOrDefault(
      paymentPayload.plan,
      editingPayment?.plan || existingSubscription.plan || DEFAULT_SUBSCRIPTION_PLAN
    );
    const cycleStart = editingPayment
      ? normalizeDateInput(paymentPayload.starts_at || editingPayment.starts_at) ||
        normalizeDateInput(editingPayment.paid_at) ||
        paymentDate
      : getRenewalStart(existingSubscription.expires_at, paymentDate);
    const expiresAt =
      normalizeDateInput(paymentPayload.expires_at) ||
      getPlanExpiryDate(cycleStart, resolvedPlan);
    const renewed = stripSubscriptionForStorage({
      ...hydrateStoredSubscription(existingSubscription),
      plan: resolvedPlan,
      amount:
        normalizeFloat(paymentPayload.amount) ??
        normalizeFloat(editingPayment?.amount) ??
        (editingPayment ? normalizeFloat(existingSubscription.amount) : null) ??
        getDefaultPlanAmount(resolvedPlan),
      currency: stringOrDefault(
        paymentPayload.currency,
        editingPayment?.currency || existingSubscription.currency || DEFAULT_SUBSCRIPTION_CURRENCY
      ),
      payment_method: stringOrDefault(
        paymentPayload.payment_method,
        editingPayment?.payment_method || existingSubscription.payment_method || ""
      ),
      payment_reference: stringOrDefault(
        paymentPayload.payment_reference,
        editingPayment?.payment_reference || ""
      ),
      notes: stringOrDefault(
        paymentPayload.notes,
        editingPayment?.notes || existingSubscription.notes || ""
      ),
      auto_renew: Boolean(paymentPayload.auto_renew ?? existingSubscription.auto_renew),
      paid_at: paymentDate.toISOString(),
      starts_at: cycleStart.toISOString(),
      expires_at: expiresAt.toISOString(),
      payment_status: expiresAt.getTime() > Date.now() ? "active" : "expired",
      last_updated_at: new Date().toISOString(),
    });

    const historyEntry = sanitizePaymentRecord(
      {
        id: editingPaymentId || generateId(),
        slug,
        plan: renewed.plan,
        amount: renewed.amount,
        currency: renewed.currency,
        paid_at: renewed.paid_at,
        starts_at: renewed.starts_at,
        expires_at: renewed.expires_at,
        payment_method: renewed.payment_method,
        payment_reference: renewed.payment_reference,
        notes: renewed.notes,
        created_at: editingPayment?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      slug
    );
    const nextPaymentHistory = upsertPaymentHistory(existingPaymentHistory, historyEntry);
    const effectiveSubscription = editingPayment
      ? deriveSubscriptionFromPaymentHistory(nextPaymentHistory, existingSubscription)
      : renewed;

    const updatedAt = new Date().toISOString();
    const nextBasic = buildBasicCard(
      {
        ...current,
        subscription: effectiveSubscription,
        updated_at: updatedAt,
      },
      basic,
      detailed || {},
      effectiveSubscription,
      updatedAt
    );
    const nextDetailed = {
      ...current,
      ...nextBasic,
      subscription: effectiveSubscription,
      updated_at: updatedAt,
      media: {
        logo: nextBasic.logo,
        cover: nextBasic.cover,
        gallery: cleanStringArray(current.media?.gallery),
        videos: cleanStringArray(current.media?.videos),
      },
    };

    writeDetailedRecord(slug, nextDetailed);
    savePaymentHistory(slug, nextPaymentHistory);
    saveBasicCard(nextBasic);
    removeIfExists(filePathFor(BASIC_DIR, slug));
    invalidateRevenueCache();

    res.json({
      success: true,
      data: decorateRecord(nextDetailed, {
        includePaymentHistory: true,
        includePaymentReferenceInSearch: true,
      }),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/delete/:slug", (req, res) => {
  try {
    const slug = sanitizeSlug(req.params.slug);
    removeBasicCard(slug);
    removeDetailedRecord(slug);
    removeIfExists(filePathFor(BASIC_DIR, slug));
    removePaymentHistory(slug);
    invalidateRevenueCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/reports/analytics", handleAnalyticsReportRequest);
app.get("/api/reports/revenue", (req, res) => {
  handleAnalyticsReportRequest(req, res);
});

app.get("/api/reports/expenses", (req, res) => {
  try {
    res.json({
      success: true,
      data: loadReportExpenses(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/reports/expenses", (req, res) => {
  try {
    const payload = req.body || {};
    const title = stringOrDefault(payload.title);
    const amount = normalizeFloat(payload.amount);
    const incurredAt = normalizeDateInput(payload.incurred_at);

    if (!title) {
      return res.status(400).json({ success: false, error: "Expense title is required." });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "Expense amount must be greater than 0." });
    }
    if (!incurredAt) {
      return res.status(400).json({ success: false, error: "Expense date is required." });
    }

    const expenses = loadExpenses();
    const expenseId = stringOrDefault(payload.id) || generateId();
    const existingExpense = expenses.find((expense) => expense.id === expenseId);
    const expense = sanitizeExpenseRecord({
      id: expenseId,
      title,
      category: stringOrDefault(payload.category, existingExpense?.category || "Operations"),
      amount,
      currency: stringOrDefault(
        payload.currency,
        existingExpense?.currency || DEFAULT_SUBSCRIPTION_CURRENCY
      ),
      incurred_at: incurredAt.toISOString(),
      notes: stringOrDefault(payload.notes, existingExpense?.notes || ""),
      created_at: existingExpense?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const nextExpenses = expenses.filter((expenseItem) => expenseItem.id !== expenseId);
    nextExpenses.push(expense);
    saveExpenses(nextExpenses);

    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/reports/expenses/:id", (req, res) => {
  try {
    const expenseId = stringOrDefault(req.params.id);
    const nextExpenses = loadExpenses().filter((expense) => expense.id !== expenseId);
    saveExpenses(nextExpenses);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/notes", (req, res) => {
  try {
    const notes = loadNotes().sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/notes", (req, res) => {
  try {
    const payload = req.body || {};
    const title = stringOrDefault(payload.title, "Untitled note");
    const content = String(payload.content ?? "");
    if (!title && !content.trim()) {
      return res.status(400).json({ success: false, error: "A note needs a title or content." });
    }

    const notes = loadNotes();
    const noteId = stringOrDefault(payload.id) || generateId();
    const existing = notes.find((note) => note.id === noteId);
    const now = new Date().toISOString();
    const nextNote = {
      id: noteId,
      title,
      content,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    const nextNotes = notes.filter((note) => note.id !== noteId);
    nextNotes.push(nextNote);
    saveNotes(nextNotes);

    res.json({ success: true, data: nextNote });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/notes/:id", (req, res) => {
  try {
    const noteId = stringOrDefault(req.params.id);
    const notes = loadNotes();
    const nextNotes = notes.filter((note) => note.id !== noteId);
    saveNotes(nextNotes);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/source/status", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildSourceSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/source/pull", (req, res) => {
  try {
    const sourceConfig = getSourceRepoConfig();
    const branch = getSourceBranchName();
    const snapshot = executeSourceWorkflow([
      {
        args: ["pull", "--rebase", sourceConfig.remoteName, branch],
        summary: `Pulled latest changes from ${sourceConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/source/stage", (req, res) => {
  try {
    const snapshot = executeSourceWorkflow([
      { args: ["add", "-A"], summary: "All repository changes were staged." },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/source/commit", (req, res) => {
  try {
    const message = stringOrDefault(req.body?.message);
    if (!message) {
      return res.status(400).json({ success: false, error: "A commit message is required." });
    }

    const snapshot = executeSourceWorkflow([
      { args: ["commit", "-m", message], summary: "Commit created.", allowNoop: true, noopSummary: "No staged changes were available to commit." },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/source/push", (req, res) => {
  try {
    const sourceConfig = getSourceRepoConfig();
    const branch = getSourceBranchName();
    const snapshot = executeSourceWorkflow([
      {
        args: ["push", sourceConfig.remoteName, `HEAD:${branch}`],
        summary: `Changes were pushed to ${sourceConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/source/publish", (req, res) => {
  try {
    const message = stringOrDefault(req.body?.message);
    if (!message) {
      return res.status(400).json({ success: false, error: "A commit message is required." });
    }

    const sourceConfig = getSourceRepoConfig();
    const branch = getSourceBranchName();
    const snapshot = executeSourceWorkflow([
      { args: ["add", "-A"], summary: "All repository changes were staged." },
      { args: ["commit", "-m", message], summary: "Commit created.", allowNoop: true, noopSummary: "No staged changes were available to commit." },
      {
        args: ["pull", "--rebase", sourceConfig.remoteName, branch],
        summary: `Pulled latest changes from ${sourceConfig.remoteName}/${branch}.`,
      },
      {
        args: ["push", sourceConfig.remoteName, `HEAD:${branch}`],
        summary: `Changes were pushed to ${sourceConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/db/status", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildDbSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/mirror", (req, res) => {
  try {
    const mirrored = mirrorBusinessDataToDbRepo();
    res.json({
      success: true,
      data: buildDbSnapshot({
        output: mirrored.log,
        summary: mirrored.summary,
      }),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/pull", (req, res) => {
  try {
    const dbConfig = getDbRepoConfig();
    const branch = getDbBranchName();
    const snapshot = executeDbWorkflow([
      {
        args: ["pull", "--rebase", dbConfig.remoteName, branch],
        summary: `Pulled latest data changes from ${dbConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/stage", (req, res) => {
  try {
    const snapshot = executeDbWorkflow([
      { args: ["add", "-A"], summary: "All DB repository changes were staged." },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/commit", (req, res) => {
  try {
    const message = stringOrDefault(req.body?.message);
    if (!message) {
      return res.status(400).json({ success: false, error: "A commit message is required." });
    }

    const snapshot = executeDbWorkflow([
      {
        args: ["commit", "-m", message],
        summary: "DB repository commit created.",
        allowNoop: true,
        noopSummary: "No staged DB changes were available to commit.",
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/push", (req, res) => {
  try {
    const dbConfig = getDbRepoConfig();
    const branch = getDbBranchName();
    const snapshot = executeDbWorkflow([
      {
        args: ["push", dbConfig.remoteName, `HEAD:${branch}`],
        summary: `DB changes were pushed to ${dbConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/db/publish", (req, res) => {
  try {
    const message = stringOrDefault(req.body?.message);
    if (!message) {
      return res.status(400).json({ success: false, error: "A commit message is required." });
    }

    const dbConfig = getDbRepoConfig();
    const branch = getDbBranchName();
    const snapshot = executeDbWorkflow([
      {
        args: ["pull", "--rebase", dbConfig.remoteName, branch],
        summary: `Pulled latest data changes from ${dbConfig.remoteName}/${branch}.`,
      },
      {
        run: () => mirrorBusinessDataToDbRepo(),
      },
      { args: ["add", "-A"], summary: "All DB repository changes were staged." },
      {
        args: ["commit", "-m", message],
        summary: "DB repository commit created.",
        allowNoop: true,
        noopSummary: "No staged DB changes were available to commit.",
      },
      {
        args: ["push", dbConfig.remoteName, `HEAD:${branch}`],
        summary: `DB changes were pushed to ${dbConfig.remoteName}/${branch}.`,
      },
    ]);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/generator/business/:slug", (req, res) => {
  try {
    const context = getGeneratorBusinessContext(req.params.slug);
    if (!context) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    res.json({
      success: true,
      data: generatorStudio.loadBusinessStudio(context.record),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generator/save", (req, res) => {
  try {
    const context = getGeneratorBusinessContext(req.body?.slug);
    if (!context) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    const result = generatorStudio.saveBusinessStudio(context.record, req.body || {});
    invalidateDirectoryDataCache(context.slug);
    res.json({
      success: true,
      data: result,
      message: "Generator Studio data saved.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generator/build/website", (req, res) => {
  try {
    const context = getGeneratorBusinessContext(req.body?.slug);
    if (!context) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    const result = generatorStudio.buildWebsite(context.record, req.body || {});
    recheckAdminFilesystem();
    res.json({
      success: true,
      data: result,
      message: "Website generated successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generator/build/app", (req, res) => {
  try {
    const context = getGeneratorBusinessContext(req.body?.slug);
    if (!context) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    const result = generatorStudio.buildApp(context.record, req.body || {});
    if (!result.flutter?.success) {
      return res.status(500).json({
        success: false,
        error: result.flutter?.message || "Flutter build failed.",
        data: result,
      });
    }

    recheckAdminFilesystem();

    return res.json({
      success: true,
      data: result,
      message: "Flutter app built successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generator/delete", (req, res) => {
  try {
    const context = getGeneratorBusinessContext(req.body?.slug);
    if (!context) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    const target = stringOrDefault(req.body?.target);
    const result = generatorStudio.deleteTarget(context.record, target);
    recheckAdminFilesystem();
    res.json({
      success: true,
      data: result,
      message: `Generator ${target || "selected"} files deleted.`,
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/id-card/:slug", (req, res) => {
  try {
    const updated = saveBusinessIdCard(req.params.slug, req.body || {});
    res.json({
      success: true,
      data: updated,
      message: "Business ID card saved.",
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/id-card/:slug/send", async (req, res) => {
  try {
    const updated = await sendBusinessIdCardForSlug(req.params.slug);
    res.json({
      success: true,
      data: updated,
      message: "Business ID card email sent.",
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/backups", (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        backup_root: BACKUP_ROOT,
        backups: backupManager.listBackups(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/backups/create", (req, res) => {
  try {
    const result = backupManager.createBackup(req.body || {});
    res.json({
      success: true,
      data: {
        backup_root: BACKUP_ROOT,
        ...result,
      },
      message: "Backup created.",
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/backups/restore/:id", (req, res) => {
  try {
    const result = backupManager.restoreBackup(req.params.id);
    recheckAdminFilesystem();
    res.json({
      success: true,
      data: {
        backup_root: BACKUP_ROOT,
        ...result,
      },
      message: "Backup restored.",
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/staff", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildStaffSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/staff/save", (req, res) => {
  try {
    res.json({
      success: true,
      data: saveStaffMember(req.body || {}),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete("/api/staff/:id", (req, res) => {
  try {
    res.json({
      success: true,
      data: removeStaffMember(req.params.id),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/staff/payment/:id", (req, res) => {
  try {
    res.json({
      success: true,
      data: saveStaffPaymentRecord(req.params.id, req.body || {}),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/staff/increment/:id", (req, res) => {
  try {
    res.json({
      success: true,
      data: saveStaffIncrementRecord(req.params.id, req.body || {}),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete("/api/staff/increment/:id/:incrementId", (req, res) => {
  try {
    res.json({
      success: true,
      data: deleteStaffIncrementRecord(req.params.id, req.params.incrementId),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete("/api/staff/payment/:id/:paymentId", (req, res) => {
  try {
    res.json({
      success: true,
      data: deleteStaffPaymentRecord(req.params.id, req.params.paymentId),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/calendar", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildCalendarSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/calendar/save", (req, res) => {
  try {
    res.json({
      success: true,
      data: saveCalendarEvent(req.body || {}),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete("/api/calendar/:id", (req, res) => {
  try {
    res.json({
      success: true,
      data: removeCalendarEvent(req.params.id),
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/email/snapshot", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildEmailSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/email/send", async (req, res) => {
  try {
    const result = await sendBusinessEmailCampaign(req.body || {});
    res.json({
      success: true,
      data: result,
      message: `Sent ${result.sent_count} email(s).`,
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/shutdown", (req, res) => {
  try {
    if (!canAccessPrivateAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: "Admin shutdown is allowed only from an authorized admin request.",
      });
    }

    res.json({
      success: true,
      message: "Admin server shutdown requested.",
    });
    scheduleAdminShutdown("Shutdown requested from the admin UI.");
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/config/env", (req, res) => {
  try {
    res.json({
      success: true,
      data: buildEnvConfigSnapshot(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/config/env", (req, res) => {
  try {
    const nextConfig = saveEnvConfigSnapshot(req.body || {});
    res.json({
      success: true,
      data: nextConfig,
      message:
        "Environment files were updated. Restart the admin server and rebuild or restart the user app if you changed build-time values.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function decorateRecord(record, options = {}) {
  const {
    includePaymentHistory = false,
    includePaymentReferenceInSearch = false,
  } = options;
  const normalized = mergeBusinessRecords(record, {});
  const subscription = hydrateStoredSubscription(normalized.subscription || {});
  const location = buildLocationLabels(normalized);
  const paymentHistory = includePaymentHistory
    ? loadPaymentHistory(normalized.slug, normalized.payment_history)
    : [];
  const decorated = {
    ...normalized,
    ...location,
    subscription,
    search_text: buildSearchText(normalized, location, {
      includePaymentReference: includePaymentReferenceInSearch,
    }),
  };

  if (includePaymentHistory) {
    decorated.payment_history = paymentHistory;
  } else {
    delete decorated.payment_history;
  }

  return decorated;
}

function mergeBusinessRecords(basic, detailed) {
  const { is_featured: _basicFeatured, ...basicRecord } = basic || {};
  const { is_featured: _detailedFeatured, ...detailedRecord } = detailed || {};
  const mergedMedia = {
    ...(basicRecord.media || {}),
    ...(detailedRecord.media || {}),
  };
  const logo = stringOrDefault(
    detailedRecord.logo ||
      mergedMedia.logo ||
      basicRecord.logo ||
      basicRecord.media?.logo
  );
  const cover = stringOrDefault(
    detailedRecord.cover ||
      mergedMedia.cover ||
      basicRecord.cover ||
      basicRecord.media?.cover
  );

  return {
    ...basicRecord,
    ...detailedRecord,
    logo,
    cover,
    is_verified: Boolean(
      detailedRecord.is_verified !== undefined ? detailedRecord.is_verified : basicRecord.is_verified
    ),
    is_certified: Boolean(
      detailedRecord.is_certified !== undefined ? detailedRecord.is_certified : basicRecord.is_certified
    ),
    contact: {
      ...(basicRecord.contact || {}),
      ...(detailedRecord.contact || {}),
    },
    stats: {
      ...(basicRecord.stats || {}),
      ...(detailedRecord.stats || {}),
    },
    media: {
      ...mergedMedia,
      logo,
      cover,
      gallery: cleanStringArray(mergedMedia.gallery),
      videos: cleanStringArray(mergedMedia.videos),
    },
    social: {
      ...(basicRecord.social || {}),
      ...(detailedRecord.social || {}),
    },
    registration: {
      ...(basicRecord.registration || {}),
      ...(detailedRecord.registration || {}),
    },
    institution_head: {
      ...(basicRecord.institution_head || {}),
      ...(detailedRecord.institution_head || {}),
    },
    id_card: {
      ...(basicRecord.id_card || {}),
      ...(detailedRecord.id_card || {}),
    },
    level: cleanStringArray(detailedRecord.level || basicRecord.level),
    field: cleanStringArray(detailedRecord.field || basicRecord.field),
    programs: cleanStringArray(detailedRecord.programs || basicRecord.programs),
    tags: sanitizeBusinessTags(detailedRecord.tags || basicRecord.tags),
    facilities: cleanStringArray(detailedRecord.facilities || basicRecord.facilities),
    subscription: stripSubscriptionForStorage(
      detailedRecord.subscription || basicRecord.subscription || {}
    ),
    payment_history: ensureArray(detailedRecord.payment_history),
  };
}

function buildBasicCard(payload, existingBasic, existingDetailed, subscription, nowIso) {
  const source = payload || {};
  const media = source.media || {};
  const district = stringOrDefault(source.district);
  const businessId = existingBasic.id || existingDetailed.id || source.id || generateBusinessRegistrationId();
  const institutionHead = buildInstitutionHeadSummary(
    source.institution_head,
    existingDetailed.institution_head || existingBasic.institution_head,
    source.contact,
    source.name
  );
  const registration = buildRegistrationSummary(
    source.registration,
    existingDetailed.registration || existingBasic.registration,
    {
      createdAt: existingDetailed.registration?.created_at || existingBasic.registration?.created_at || nowIso,
      updatedAt: nowIso,
    }
  );
  const idCard = buildIdCardSummary(
    source.id_card,
    existingDetailed.id_card || existingBasic.id_card,
    {
      businessId,
      businessName: source.name,
      institutionHead,
      createdAt: existingDetailed.id_card?.generated_at || existingBasic.id_card?.generated_at || nowIso,
      updatedAt: nowIso,
    }
  );
  return sanitizeBasicCard({
    id: businessId,
    slug: source.slug,
    name: source.name,
    name_np: source.name_np,
    type: source.type,
    level: source.level,
    field: source.field,
    affiliation: source.affiliation,
    district,
    zone: resolveZoneFromDistrict(source.zone, district),
    province: resolveProvinceFromDistrict(source.province, district),
    is_verified: source.is_verified,
    is_certified: source.is_certified,
    tags: source.tags,
    logo: source.logo ?? media.logo,
    cover: source.cover ?? media.cover,
    contact: buildBasicCardContactSummary(
      source.contact,
      existingDetailed.contact || existingBasic.contact
    ),
    registration,
    institution_head: institutionHead,
    id_card: idCard,
    subscription,
    updated_at: nowIso,
    created_at: existingBasic.created_at || existingDetailed.created_at || nowIso,
  });
}

function sanitizeBasicCard(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const media = record.media || {};
  const slug = sanitizeSlug(record.slug);
  const name = stringOrDefault(record.name);
  if (!slug || !name) {
    return null;
  }

  return {
    id: stringOrDefault(record.id),
    slug,
    name,
    name_np: stringOrDefault(record.name_np),
    type: stringOrDefault(record.type),
    level: cleanStringArray(record.level),
    field: cleanStringArray(record.field),
    affiliation: stringOrDefault(record.affiliation),
    district: stringOrDefault(record.district),
    zone: resolveZoneFromDistrict(record.zone, record.district),
    province: resolveProvinceFromDistrict(record.province, record.district),
    is_verified: Boolean(record.is_verified),
    is_certified: Boolean(record.is_certified),
    tags: sanitizeBusinessTags(record.tags),
    logo: stringOrDefault(record.logo || media.logo),
    cover: stringOrDefault(record.cover || media.cover),
    contact: buildBasicCardContactSummary(record.contact),
    registration: sanitizeRegistrationSummary(record.registration),
    institution_head: sanitizeInstitutionHeadSummary(record.institution_head),
    id_card: sanitizeIdCardSummary(record.id_card, record.id),
    subscription: stripSubscriptionForStorage(record.subscription || {}),
    updated_at: stringOrDefault(record.updated_at),
    created_at: stringOrDefault(record.created_at),
  };
}

function loadBasicCards() {
  const stored = readJson(BASIC_INDEX_FILE, null);
  if (Array.isArray(stored)) {
    return normalizeStoredBasicCards(stored);
  }

  const migrated = migrateBasicCards();
  writeJson(BASIC_INDEX_FILE, migrated, null);
  return migrated;
}

function normalizeStoredBasicCards(cards) {
  const normalized = sortBasicCards(
    ensureArray(cards).map((item) => sanitizeBasicCard(item)).filter(Boolean)
  );
  const serializedNext = JSON.stringify(normalized);
  const serializedStored = JSON.stringify(ensureArray(cards));

  if (serializedNext !== serializedStored) {
    writeJson(BASIC_INDEX_FILE, normalized, null);
  }

  return normalized;
}

function migrateBasicCards() {
  const legacyCards = fs
    .readdirSync(BASIC_DIR)
    .filter((file) => file.endsWith(".json") && file !== BASIC_INDEX_NAME)
    .map((file) => sanitizeBasicCard(readJson(path.join(BASIC_DIR, file), null)))
    .filter(Boolean);

  if (legacyCards.length) {
    return hydrateBasicCards(legacyCards);
  }

  const detailedCards = fs
    .readdirSync(DETAILED_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => sanitizeBasicCard(readJson(path.join(DETAILED_DIR, file), null)))
    .filter(Boolean);

  return hydrateBasicCards(detailedCards);
}

function buildBasicCardContactSummary(sourceContact, fallbackContact = {}) {
  const source = sourceContact || {};
  const fallback = fallbackContact || {};
  const sourcePhones = cleanStringArray(source.phone);
  const fallbackPhones = cleanStringArray(fallback.phone);

  return {
    address: stringOrDefault(source.address, fallback.address),
    phone: sourcePhones.length ? sourcePhones : fallbackPhones,
    email: stringOrDefault(source.email, fallback.email),
    website: stringOrDefault(source.website, fallback.website),
    map: {
      lat: normalizeFloat(source.map?.lat) ?? normalizeFloat(fallback.map?.lat),
      lng: normalizeFloat(source.map?.lng) ?? normalizeFloat(fallback.map?.lng),
    },
  };
}

function hydrateBasicCards(cards) {
  const nextCards = sortBasicCards(
    ensureArray(cards).map((card) => hydrateBasicCard(card)).filter(Boolean)
  );
  const serializedNext = JSON.stringify(nextCards);
  const serializedStored = JSON.stringify(sortBasicCards(ensureArray(cards).filter(Boolean)));

  if (serializedNext !== serializedStored) {
    writeJson(BASIC_INDEX_FILE, nextCards, null);
  }

  return nextCards;
}

function hydrateBasicCard(card) {
  const normalized = sanitizeBasicCard(card);
  if (!normalized?.slug) {
    return null;
  }

  const detailed = readDetailedRecord(normalized.slug);
  if (!detailed) {
    return normalized;
  }

  return sanitizeBasicCard({
    ...detailed,
    ...normalized,
    contact: buildBasicCardContactSummary(normalized.contact, detailed.contact),
    subscription: normalized.subscription || detailed.subscription || {},
  });
}

function saveBasicCard(card, sourceSlug = card.slug) {
  const normalized = sanitizeBasicCard(card);
  if (!normalized) {
    return;
  }

  const next = basicCards.filter(
    (item) => item.slug !== normalized.slug && item.slug !== sanitizeSlug(sourceSlug)
  );
  next.push(normalized);
  basicCards = sortBasicCards(next);
  basicCardsBySlug = buildBasicCardMap(basicCards);
  invalidateDirectoryDataCache(normalized.slug);
  invalidateDirectoryDataCache(sourceSlug);
  writeJson(BASIC_INDEX_FILE, basicCards, null);
}

function removeBasicCard(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return;
  }

  const next = basicCards.filter((card) => card.slug !== normalizedSlug);
  if (next.length === basicCards.length) {
    return;
  }

  basicCards = next;
  basicCardsBySlug = buildBasicCardMap(basicCards);
  invalidateDirectoryDataCache(normalizedSlug);
  writeJson(BASIC_INDEX_FILE, basicCards, null);
}

function buildBasicCardMap(cards) {
  return new Map(cards.map((card) => [card.slug, card]));
}

function sortBasicCards(cards) {
  return cards.sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name);
    return nameCompare || left.slug.localeCompare(right.slug);
  });
}

function readLegacyBasicCard(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }
  return sanitizeBasicCard(readJson(filePathFor(BASIC_DIR, normalizedSlug), null));
}

function buildSearchText(record, location, options = {}) {
  const { includePaymentReference = false } = options;
  const locationInfo = location || buildLocationLabels(record);
  return [
    record.id,
    record.name,
    record.slug,
    record.type,
    ...(record.level || []),
    ...(record.field || []),
    ...(record.programs || []),
    record.district,
    locationInfo.zone_name,
    locationInfo.province_name,
    record.affiliation,
    record.contact?.email,
    record.institution_head?.name,
    record.institution_head?.role,
    ...(record.tags || []),
    ...(includePaymentReference ? [record.subscription?.payment_reference] : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toPublicRecord(record) {
  return {
    id: stringOrDefault(record.id),
    slug: stringOrDefault(record.slug),
    name: stringOrDefault(record.name),
    name_np: stringOrDefault(record.name_np),
    type: stringOrDefault(record.type),
    level: cleanStringArray(record.level),
    field: cleanStringArray(record.field),
    affiliation: stringOrDefault(record.affiliation),
    district: stringOrDefault(record.district),
    zone: stringOrDefault(record.zone),
    zone_name: stringOrDefault(record.zone_name),
    province: stringOrDefault(record.province),
    province_name: stringOrDefault(record.province_name),
    location_label: stringOrDefault(record.location_label),
    location_full_label: stringOrDefault(record.location_full_label),
    is_verified: Boolean(record.is_verified),
    is_certified: Boolean(record.is_certified),
    tags: sanitizeBusinessTags(record.tags),
    logo: stringOrDefault(record.logo || record.media?.logo),
    cover: stringOrDefault(record.cover || record.media?.cover),
    description: stringOrDefault(record.description),
    programs: cleanStringArray(record.programs),
    facilities: cleanStringArray(record.facilities),
    contact: {
      address: stringOrDefault(record.contact?.address),
      phone: cleanStringArray(record.contact?.phone),
      email: stringOrDefault(record.contact?.email),
      website: stringOrDefault(record.contact?.website),
      map: {
        lat: normalizeFloat(record.contact?.map?.lat),
        lng: normalizeFloat(record.contact?.map?.lng),
      },
    },
    stats: {
      students: normalizeInteger(record.stats?.students),
      faculty: normalizeInteger(record.stats?.faculty),
      rating: normalizeFloat(record.stats?.rating),
      programs_count: normalizeInteger(record.stats?.programs_count),
    },
    media: {
      logo: stringOrDefault(record.media?.logo || record.logo),
      cover: stringOrDefault(record.media?.cover || record.cover),
      gallery: cleanStringArray(record.media?.gallery),
      videos: cleanStringArray(record.media?.videos),
    },
    social: {
      facebook: stringOrDefault(record.social?.facebook),
      instagram: stringOrDefault(record.social?.instagram),
      youtube: stringOrDefault(record.social?.youtube),
      twitter: stringOrDefault(record.social?.twitter),
    },
    created_at: stringOrDefault(record.created_at),
    updated_at: stringOrDefault(record.updated_at),
    search_text: buildSearchText(record, {
      zone_name: record.zone_name,
      province_name: record.province_name,
    }, {
      includePaymentReference: false,
    }),
  };
}

function toPublicSummaryRecord(record) {
  const publicRecord = toPublicRecord(record);
  return {
    id: publicRecord.id,
    slug: publicRecord.slug,
    name: publicRecord.name,
    name_np: publicRecord.name_np,
    type: publicRecord.type,
    level: publicRecord.level,
    field: publicRecord.field,
    affiliation: publicRecord.affiliation,
    district: publicRecord.district,
    zone: publicRecord.zone,
    zone_name: publicRecord.zone_name,
    province: publicRecord.province,
    province_name: publicRecord.province_name,
    location_label: publicRecord.location_label,
    location_full_label: publicRecord.location_full_label,
    is_verified: publicRecord.is_verified,
    is_certified: publicRecord.is_certified,
    tags: publicRecord.tags,
    logo: publicRecord.logo,
    cover: publicRecord.cover,
    contact: {
      address: publicRecord.contact.address,
      phone: publicRecord.contact.phone,
      email: publicRecord.contact.email,
      website: publicRecord.contact.website,
      map: publicRecord.contact.map,
    },
    media: {
      logo: publicRecord.media.logo,
      cover: publicRecord.media.cover,
    },
    created_at: publicRecord.created_at,
    updated_at: publicRecord.updated_at,
    search_text: publicRecord.search_text,
  };
}

function getGeneratorBusinessContext(slugValue) {
  const context = getBusinessDataContext(slugValue);
  if (!context) {
    return null;
  }

  return {
    slug: context.slug,
    record: decorateRecord(context.current, {
      includePaymentHistory: false,
      includePaymentReferenceInSearch: true,
    }),
  };
}

function getBusinessDataContext(slugValue) {
  const slug = sanitizeSlug(slugValue);
  if (!slug) {
    return null;
  }

  const basic = basicCardsBySlug.get(slug) || readLegacyBasicCard(slug) || {};
  const detailed = readDetailedRecord(slug) || {};
  if (!basic.slug && !detailed.slug) {
    return null;
  }

  return {
    slug,
    basic,
    detailed,
    current: mergeBusinessRecords(basic, detailed),
  };
}

function saveBusinessSnapshotRecord(sourceSlug, record) {
  const slug = sanitizeSlug(record?.slug || sourceSlug);
  if (!slug) {
    throw new Error("Business slug is required.");
  }

  const now = new Date().toISOString();
  const nextDetailed = {
    ...record,
    slug,
    updated_at: stringOrDefault(record?.updated_at, now),
  };
  writeDetailedRecord(slug, nextDetailed);
  saveBasicCard(nextDetailed, sourceSlug || slug);
  removeIfExists(filePathFor(BASIC_DIR, slug));
  return decorateRecord(nextDetailed, {
    includePaymentHistory: true,
    includePaymentReferenceInSearch: true,
  });
}

function buildBusinessIdCardPayload(record) {
  const decorated =
    record?.search_text && record?.location_label
      ? record
      : decorateRecord(record || {}, {
          includePaymentHistory: true,
          includePaymentReferenceInSearch: true,
        });
  const head = decorated.institution_head || {};
  const idCard = decorated.id_card || {};
  return {
    business_id: stringOrDefault(decorated.id),
    institution_name: stringOrDefault(decorated.name),
    institution_name_np: stringOrDefault(decorated.name_np),
    business_type: stringOrDefault(decorated.type),
    holder_name: stringOrDefault(idCard.holder_name, head.name),
    holder_role: stringOrDefault(idCard.holder_role, head.role),
    email: stringOrDefault(decorated.contact?.email),
    phone: cleanStringArray(decorated.contact?.phone)[0] || stringOrDefault(head.phone),
    location: stringOrDefault(decorated.location_full_label || decorated.location_label),
    issued_at: stringOrDefault(idCard.generated_at, decorated.created_at),
    title: stringOrDefault(idCard.title, "Institution ID Card"),
    subtitle: stringOrDefault(idCard.subtitle, "Business registration profile"),
    notes: stringOrDefault(idCard.notes),
    status: stringOrDefault(idCard.status, "draft"),
  };
}

function renderBusinessIdCardHtml(card) {
  const escape = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return `
    <div style="margin-top:16px;padding:18px;border-radius:18px;border:1px solid #d4d7df;background:linear-gradient(145deg,#f8fbff,#eef4ff);font-family:Arial,sans-serif;color:#14335c;">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c76a6;">${escape(card.title)}</div>
      <div style="margin-top:8px;font-size:22px;font-weight:700;">${escape(card.institution_name)}</div>
      <div style="margin-top:2px;font-size:13px;color:#4f6288;">${escape(card.subtitle)}</div>
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><strong>ID</strong><br>${escape(card.business_id)}</div>
        <div><strong>Type</strong><br>${escape(card.business_type || "Not set")}</div>
        <div><strong>Institution Head</strong><br>${escape(card.holder_name || "Not set")}</div>
        <div><strong>Role</strong><br>${escape(card.holder_role || "Institution Head")}</div>
        <div><strong>Location</strong><br>${escape(card.location || "Not set")}</div>
        <div><strong>Issued</strong><br>${escape(card.issued_at ? new Date(card.issued_at).toISOString().slice(0, 10) : "Pending")}</div>
      </div>
      ${
        card.notes
          ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #d6dded;font-size:13px;">${escape(card.notes)}</div>`
          : ""
      }
    </div>
  `;
}

function saveBusinessIdCard(slugValue, payload) {
  const context = getBusinessDataContext(slugValue);
  if (!context) {
    throw new Error("Business not found.");
  }

  const now = new Date().toISOString();
  const institutionHead = buildInstitutionHeadSummary(
    {
      name: payload.head_name ?? payload.holder_name,
      role: payload.head_role ?? payload.holder_role,
      email: payload.head_email,
      phone: payload.head_phone,
      notes: payload.head_notes,
    },
    context.current.institution_head,
    context.current.contact
  );
  const idCard = buildIdCardSummary(
    {
      title: payload.title,
      subtitle: payload.subtitle,
      template: payload.template,
      notes: payload.notes,
      photo_url: payload.photo_url,
      holder_name: institutionHead.name,
      holder_role: institutionHead.role,
      status: payload.status,
      last_sent_at: context.current.id_card?.last_sent_at,
    },
    context.current.id_card,
    {
      businessId: context.current.id,
      businessName: context.current.name,
      institutionHead,
      createdAt: context.current.id_card?.generated_at || now,
      updatedAt: now,
    }
  );

  const updated = saveBusinessSnapshotRecord(context.slug, {
    ...context.current,
    institution_head: institutionHead,
    id_card: idCard,
    updated_at: now,
  });

  return {
    record: updated,
    id_card: buildBusinessIdCardPayload(updated),
  };
}

async function sendBusinessIdCardForSlug(slugValue) {
  const context = getBusinessDataContext(slugValue);
  if (!context) {
    throw new Error("Business not found.");
  }

  const decorated = decorateRecord(context.current, {
    includePaymentHistory: true,
    includePaymentReferenceInSearch: true,
  });
  const delivery = await sendBusinessIdCardEmail(decorated);
  const sentAt = delivery.sent_at || new Date().toISOString();
  const updated = saveBusinessSnapshotRecord(context.slug, {
    ...context.current,
    registration: {
      ...context.current.registration,
      confirmation_email_error: "",
    },
    id_card: {
      ...context.current.id_card,
      status: "complete",
      last_sent_at: sentAt,
      updated_at: sentAt,
    },
    updated_at: sentAt,
  });

  return {
    record: updated,
    id_card: buildBusinessIdCardPayload(updated),
    delivery,
  };
}

function attachGenerationStatus(record) {
  const status = generatorStudio.getBusinessStatus(record);
  return {
    ...record,
    generator: {
      folder_name: status.paths.folder_name,
      data_dir: status.paths.data_dir,
      output_dir: status.paths.output_dir,
      generated_count: status.paths.generated_count,
      non_generated_count: status.paths.non_generated_count,
      has_website_form: status.paths.has_website_form,
      has_app_form: status.paths.has_app_form,
      has_website: status.paths.has_website,
      has_flutter_source: status.paths.has_flutter_source,
      has_apk: status.paths.has_apk,
      website_index_path: status.paths.website_index_path,
      apk_path: status.paths.apk_path,
    },
  };
}

function getAdminDirectoryList() {
  if (adminDirectoryListCache) {
    return adminDirectoryListCache;
  }

  adminDirectoryListCache = basicCards.map((card) =>
    attachGenerationStatus(
      decorateRecord(card, {
        includePaymentHistory: false,
        includePaymentReferenceInSearch: true,
      })
    )
  );
  return adminDirectoryListCache;
}

function getPublicDirectoryList() {
  if (publicDirectoryListCache) {
    return publicDirectoryListCache;
  }

  publicDirectoryListCache = basicCards
    .map((card) =>
      decorateRecord(card, {
        includePaymentHistory: false,
        includePaymentReferenceInSearch: false,
      })
    )
    .filter((record) => isPublicRecordVisible(record))
    .map((record) => toPublicSummaryRecord(record));

  return publicDirectoryListCache;
}

function getPublicDirectoryMeta() {
  const list = getPublicDirectoryList();
  const basicIndexStat = safeStat(BASIC_INDEX_FILE);
  const sourceUpdatedAt =
    getLatestRecordTimestamp(list) ||
    (basicIndexStat ? new Date(basicIndexStat.mtimeMs).toISOString() : "");
  const version = [
    basicIndexStat ? Math.round(basicIndexStat.mtimeMs) : "",
    list.length,
    sourceUpdatedAt,
  ]
    .filter(Boolean)
    .join(":");

  return {
    version: version || `count:${list.length}`,
    count: list.length,
    updated_at: sourceUpdatedAt,
  };
}

function scheduleDirectoryCacheWarmup() {
  const defer = typeof setImmediate === "function" ? setImmediate : setTimeout;
  defer(() => {
    try {
      getPublicDirectoryList();
    } catch {
      // Ignore warmup failures and serve lazily on request.
    }
  }, 0);
}

function invalidateDirectoryDataCache(...slugs) {
  adminDirectoryListCache = null;
  publicDirectoryListCache = null;

  for (const slug of slugs) {
    const normalizedSlug = sanitizeSlug(slug);
    if (normalizedSlug) {
      detailedRecordCache.delete(normalizedSlug);
    }
  }
}

function recheckAdminFilesystem() {
  basicCards = loadBasicCards();
  basicCardsBySlug = buildBasicCardMap(basicCards);
  detailedRecordCache.clear();
  invalidateDirectoryDataCache();
  return getAdminDirectoryList();
}

function getLatestRecordTimestamp(records) {
  let latestTime = 0;

  for (const record of ensureArray(records)) {
    const time =
      normalizeDateInput(record?.updated_at || record?.created_at)?.getTime() || 0;
    if (time > latestTime) {
      latestTime = time;
    }
  }

  return latestTime ? new Date(latestTime).toISOString() : "";
}

function readDetailedRecord(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  if (detailedRecordCache.has(normalizedSlug)) {
    return detailedRecordCache.get(normalizedSlug);
  }

  const detailed = readJson(filePathFor(DETAILED_DIR, normalizedSlug), null);
  if (detailed) {
    detailedRecordCache.set(normalizedSlug, detailed);
  }
  return detailed;
}

function writeDetailedRecord(slug, value) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return;
  }

  writeJson(filePathFor(DETAILED_DIR, normalizedSlug), value);
  invalidateDirectoryDataCache(normalizedSlug);
  detailedRecordCache.set(normalizedSlug, value);
}

function removeDetailedRecord(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return;
  }

  removeIfExists(filePathFor(DETAILED_DIR, normalizedSlug));
  invalidateDirectoryDataCache(normalizedSlug);
}

function isPublicRecordVisible(record) {
  return hydrateStoredSubscription(record?.subscription || {}).is_active;
}

function paymentDirFor(slug) {
  return path.join(PAYMENTS_DIR, sanitizeSlug(slug));
}

function paymentFilePath(slug, paymentId) {
  return path.join(paymentDirFor(slug), `${stringOrDefault(paymentId)}.json`);
}

function readStoredPaymentHistory(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return [];
  }

  const dir = paymentDirFor(normalizedSlug);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return sanitizePaymentHistory(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson(path.join(dir, file), null)),
    normalizedSlug
  );
}

function loadPaymentHistory(slug, fallbackHistory = []) {
  const stored = readStoredPaymentHistory(slug);
  if (stored.length) {
    return stored;
  }
  return sanitizePaymentHistory(fallbackHistory, slug);
}

function savePaymentHistory(slug, records) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return [];
  }

  const normalizedRecords = sanitizePaymentHistory(records, normalizedSlug);
  const dir = paymentDirFor(normalizedSlug);

  if (!normalizedRecords.length) {
    removePaymentHistory(normalizedSlug);
    return [];
  }

  fs.mkdirSync(dir, { recursive: true });
  const validIds = new Set(normalizedRecords.map((record) => record.id));

  for (const file of fs.readdirSync(dir).filter((entry) => entry.endsWith(".json"))) {
    if (!validIds.has(path.basename(file, ".json"))) {
      fs.unlinkSync(path.join(dir, file));
    }
  }

  for (const record of normalizedRecords) {
    writeJson(paymentFilePath(normalizedSlug, record.id), record);
  }

  return normalizedRecords;
}

function removePaymentHistory(slug) {
  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return;
  }

  const dir = paymentDirFor(normalizedSlug);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sanitizePaymentHistory(records, slug) {
  return sortPaymentHistory(
    ensureArray(records)
      .map((record) => sanitizePaymentRecord(record, slug))
      .filter(Boolean)
  );
}

function sortPaymentHistory(records) {
  return records.sort((left, right) => {
    const leftStart = normalizeDateInput(left.starts_at || left.paid_at)?.getTime() || 0;
    const rightStart = normalizeDateInput(right.starts_at || right.paid_at)?.getTime() || 0;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    const leftPaid = normalizeDateInput(left.paid_at)?.getTime() || 0;
    const rightPaid = normalizeDateInput(right.paid_at)?.getTime() || 0;
    if (leftPaid !== rightPaid) {
      return leftPaid - rightPaid;
    }

    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function sanitizePaymentRecord(record, slug) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const normalizedSlug = sanitizeSlug(slug || record.slug);
  const id = stringOrDefault(record.id) || generateId();
  const plan = stringOrDefault(record.plan, DEFAULT_SUBSCRIPTION_PLAN);
  const paidAt =
    normalizeDateInput(record.paid_at || record.starts_at) ||
    normalizeDateInput(record.created_at);
  const startsAt =
    normalizeDateInput(record.starts_at || record.paid_at) ||
    normalizeDateInput(record.created_at);
  if (!id || !startsAt) {
    return null;
  }

  const expiresAt = normalizeDateInput(record.expires_at) || getPlanExpiryDate(startsAt, plan);
  const nowIso = new Date().toISOString();

  return {
    id,
    slug: normalizedSlug,
    plan,
    amount: normalizeFloat(record.amount) ?? getDefaultPlanAmount(plan),
    currency: stringOrDefault(record.currency, DEFAULT_SUBSCRIPTION_CURRENCY),
    paid_at: (paidAt || startsAt).toISOString(),
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    payment_method: stringOrDefault(record.payment_method),
    payment_reference: stringOrDefault(record.payment_reference),
    notes: stringOrDefault(record.notes),
    created_at: stringOrDefault(record.created_at, nowIso),
    updated_at: stringOrDefault(record.updated_at, nowIso),
  };
}

function upsertPaymentHistory(history, record) {
  return sanitizePaymentHistory(
    [...ensureArray(history).filter((item) => item.id !== record.id), record],
    record.slug
  );
}

function deriveSubscriptionFromPaymentHistory(history, fallbackSubscription = {}) {
  const payments = sanitizePaymentHistory(history);
  const latest = payments[payments.length - 1];
  if (!latest) {
    return stripSubscriptionForStorage(fallbackSubscription || {});
  }

  const fallback = hydrateStoredSubscription(fallbackSubscription || {});
  const expiresAt = normalizeDateInput(latest.expires_at);

  return stripSubscriptionForStorage({
    ...fallback,
    plan: stringOrDefault(latest.plan, fallback.plan || DEFAULT_SUBSCRIPTION_PLAN),
    amount:
      normalizeFloat(latest.amount) ??
      normalizeFloat(fallback.amount) ??
      getDefaultPlanAmount(latest.plan || fallback.plan),
    currency: stringOrDefault(
      latest.currency,
      fallback.currency || DEFAULT_SUBSCRIPTION_CURRENCY
    ),
    payment_method: stringOrDefault(latest.payment_method, fallback.payment_method || ""),
    payment_reference: stringOrDefault(latest.payment_reference),
    notes: stringOrDefault(latest.notes, fallback.notes || ""),
    paid_at: latest.paid_at,
    starts_at: latest.starts_at,
    expires_at: latest.expires_at,
    payment_status: expiresAt && expiresAt.getTime() > Date.now() ? "active" : "expired",
    last_updated_at: stringOrDefault(latest.updated_at, fallback.last_updated_at || ""),
  });
}

function migrateLegacyPayments() {
  const detailedFiles = fs.readdirSync(DETAILED_DIR).filter((file) => file.endsWith(".json"));

  for (const file of detailedFiles) {
    const slug = path.basename(file, ".json");
    const detailedPath = path.join(DETAILED_DIR, file);
    const detailed = readJson(detailedPath, null);
    if (!detailed || !Object.prototype.hasOwnProperty.call(detailed, "payment_history")) {
      continue;
    }

    const existingPayments = readStoredPaymentHistory(slug);
    if (!existingPayments.length) {
      savePaymentHistory(slug, detailed.payment_history);
    }

    const nextDetailed = { ...detailed };
    delete nextDetailed.payment_history;
    writeJson(detailedPath, nextDetailed);
  }
}

function loadNotes() {
  const notes = readJson(NOTES_FILE, []);
  return Array.isArray(notes) ? notes : [];
}

function saveNotes(notes) {
  writeJson(
    NOTES_FILE,
    ensureArray(notes).sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  );
}

function loadExpenses() {
  const expenses = readJson(EXPENSES_FILE, []);
  return sortExpenses(
    ensureArray(expenses)
      .map((expense) => sanitizeExpenseRecord(expense))
      .filter(Boolean)
  );
}

function loadReportExpenses() {
  const directExpenses = loadExpenses().map((expense) => ({
    ...expense,
    source: "expense",
    source_label: "Expense",
  }));
  return sortExpenses([...directExpenses, ...collectPayrollExpenses()]);
}

function collectPayrollExpenses() {
  const payrollExpenses = [];

  for (const staff of loadStaffRecords()) {
    for (const payment of ensureArray(staff.payment_history)) {
      const amount = normalizeFloat(payment.amount);
      const incurredAt = normalizeDateInput(payment.paid_at);
      if (!Number.isFinite(amount) || amount <= 0 || !incurredAt) {
        continue;
      }

      payrollExpenses.push({
        id: `staff-payroll-${staff.id}-${payment.id}`,
        title: `Salary - ${stringOrDefault(staff.full_name, "Staff Member")}`,
        category: "Payroll",
        amount: roundAmount(amount),
        currency: stringOrDefault(payment.currency, staff.salary_currency || DEFAULT_SUBSCRIPTION_CURRENCY),
        incurred_at: incurredAt.toISOString(),
        notes: [payment.notes, staff.role, staff.department].filter(Boolean).join(" | "),
        created_at: stringOrDefault(payment.created_at, incurredAt.toISOString()),
        updated_at: stringOrDefault(payment.updated_at, payment.created_at || incurredAt.toISOString()),
        source: "staff-payroll",
        source_label: "Staff Salary",
        staff_id: staff.id,
        staff_name: staff.full_name,
        payment_id: payment.id,
      });
    }
  }

  return sortExpenses(payrollExpenses);
}

function saveExpenses(expenses) {
  writeJson(EXPENSES_FILE, sortExpenses(expenses), 2);
}

function sortExpenses(expenses) {
  return ensureArray(expenses).sort((left, right) => {
    const rightDate = normalizeDateInput(right?.incurred_at || right?.updated_at)?.getTime() || 0;
    const leftDate = normalizeDateInput(left?.incurred_at || left?.updated_at)?.getTime() || 0;
    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function sanitizeExpenseRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const amount = normalizeFloat(record.amount);
  const incurredAt = normalizeDateInput(record.incurred_at);
  if (!Number.isFinite(amount) || amount <= 0 || !incurredAt) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: stringOrDefault(record.id) || generateId(),
    title: stringOrDefault(record.title),
    category: stringOrDefault(record.category, "Operations"),
    amount: roundAmount(amount),
    currency: stringOrDefault(record.currency, DEFAULT_SUBSCRIPTION_CURRENCY),
    incurred_at: incurredAt.toISOString(),
    notes: stringOrDefault(record.notes),
    created_at: stringOrDefault(record.created_at, nowIso),
    updated_at: stringOrDefault(record.updated_at, nowIso),
  };
}

function normalizeReportPeriod(value) {
  const normalized = String(value || "monthly").trim().toLowerCase();
  return ["monthly", "yearly"].includes(normalized) ? normalized : "monthly";
}

function normalizeReportYear(value) {
  const parsed = normalizeInteger(value);
  if (!parsed) {
    return null;
  }
  return parsed >= 2000 && parsed <= 2100 ? parsed : null;
}

function invalidateRevenueCache() {
  revenuePaymentsCache = null;
}

function handleAnalyticsReportRequest(req, res) {
  try {
    const period = normalizeReportPeriod(req.query.period);
    const year = normalizeReportYear(req.query.year);
    res.json({
      success: true,
      data: buildRevenueReport(period, { year }),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

function buildRevenueReport(period, options = {}) {
  const { year = null } = options;
  const payments = collectRevenuePayments();
  const expenses = loadReportExpenses();
  const availableYears = collectAvailableReportYears(payments, expenses);
  const selectedYear = resolveSelectedReportYear(period, year, availableYears);
  const grouped = new Map();
  const seedBuckets = buildEmptyReportBuckets(period, selectedYear);

  for (const bucket of seedBuckets) {
    grouped.set(bucket.key, createReportAccumulator(bucket));
  }

  for (const payment of payments) {
    const bucket = getRevenueBucket(payment.paid_at, period);
    if (!bucket || (selectedYear && bucket.year !== selectedYear && period !== "yearly")) {
      continue;
    }

    const existing = grouped.get(bucket.key) || createReportAccumulator(bucket);
    addPaymentToAccumulator(existing, payment);
    grouped.set(bucket.key, existing);
  }

  for (const expense of expenses) {
    const bucket = getRevenueBucket(expense.incurred_at, period);
    if (!bucket || (selectedYear && bucket.year !== selectedYear && period !== "yearly")) {
      continue;
    }

    const existing = grouped.get(bucket.key) || createReportAccumulator(bucket);
    addExpenseToAccumulator(existing, expense);
    grouped.set(bucket.key, existing);
  }

  const rows = [...grouped.values()]
    .sort((left, right) => right.start_at.localeCompare(left.start_at))
    .map((row) => finalizeReportAccumulator(row));

  return {
    period,
    selected_year: selectedYear,
    available_years: availableYears,
    generated_at: new Date().toISOString(),
    totals: {
      month: summarizeRevenueWindow(payments, expenses, "monthly"),
      year: summarizeRevenueWindow(payments, expenses, "yearly"),
      lifetime: summarizeRevenueWindow(payments, expenses, "lifetime"),
    },
    rows,
  };
}

function collectAvailableReportYears(payments, expenses) {
  const years = [
    ...ensureArray(payments).map((payment) => normalizeDateInput(payment.paid_at)?.getUTCFullYear() || null),
    ...ensureArray(expenses).map((expense) => normalizeDateInput(expense.incurred_at)?.getUTCFullYear() || null),
  ]
    .filter(Boolean)
    .sort((left, right) => right - left);

  const uniqueYears = [...new Set(years)];
  return uniqueYears.length ? uniqueYears : [new Date().getUTCFullYear()];
}

function resolveSelectedReportYear(period, requestedYear, availableYears) {
  const yearList = ensureArray(availableYears);
  if (!yearList.length) {
    return requestedYear || new Date().getUTCFullYear();
  }
  if (requestedYear && yearList.includes(requestedYear)) {
    return requestedYear;
  }
  return yearList[0];
}

function buildEmptyReportBuckets(period, year) {
  if (!year || period === "yearly") {
    return [];
  }

  if (period === "monthly") {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const start = new Date(Date.UTC(year, monthIndex, 1));
      const end = new Date(Date.UTC(year, monthIndex + 1, 0));
      return {
        key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
        year,
        label: start.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" }),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      };
    });
  }

  return [];
}

function collectRevenuePayments() {
  if (revenuePaymentsCache) {
    return revenuePaymentsCache;
  }

  const payments = [];
  const businessSlugs = new Set([
    ...fs
      .readdirSync(DETAILED_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.basename(file, ".json")),
    ...fs
      .readdirSync(PAYMENTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  ]);

  for (const slug of businessSlugs) {
    const business =
      readJson(filePathFor(DETAILED_DIR, slug), null) ||
      basicCardsBySlug.get(slug) ||
      null;
    const paymentHistory = loadPaymentHistory(slug, business?.payment_history);

    for (const entry of paymentHistory) {
      const amount = normalizeFloat(entry.amount);
      const paidAt = normalizeDateInput(entry.paid_at);
      if (!paidAt || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }

      payments.push({
        slug: stringOrDefault(business?.slug, slug),
        name: stringOrDefault(business?.name),
        amount,
        currency: stringOrDefault(entry.currency, DEFAULT_SUBSCRIPTION_CURRENCY),
        paid_at: paidAt.toISOString(),
      });
    }
  }

  revenuePaymentsCache = payments;
  return revenuePaymentsCache;
}

function createReportAccumulator(bucket = {}) {
  return {
    key: stringOrDefault(bucket.key),
    year: normalizeInteger(bucket.year),
    label: stringOrDefault(bucket.label),
    start_at: stringOrDefault(bucket.start_at),
    end_at: stringOrDefault(bucket.end_at),
    revenue_total: 0,
    expense_total: 0,
    payment_count: 0,
    expense_count: 0,
    payroll_count: 0,
    businesses: new Set(),
    revenue_breakdown: {},
    expense_breakdown: {},
    payroll_breakdown: {},
    expense_categories: {},
    payroll_total: 0,
  };
}

function addPaymentToAccumulator(accumulator, payment) {
  accumulator.revenue_total += payment.amount;
  accumulator.payment_count += 1;
  accumulator.businesses.add(payment.slug);
  accumulator.revenue_breakdown[payment.currency] =
    (accumulator.revenue_breakdown[payment.currency] || 0) + payment.amount;
}

function addExpenseToAccumulator(accumulator, expense) {
  accumulator.expense_total += expense.amount;
  accumulator.expense_count += 1;
  accumulator.expense_breakdown[expense.currency] =
    (accumulator.expense_breakdown[expense.currency] || 0) + expense.amount;

  if (expense.source === "staff-payroll") {
    accumulator.payroll_total += expense.amount;
    accumulator.payroll_count += 1;
    accumulator.payroll_breakdown[expense.currency] =
      (accumulator.payroll_breakdown[expense.currency] || 0) + expense.amount;
  }

  const category = stringOrDefault(expense.category, "Operations");
  const existingCategory =
    accumulator.expense_categories[category] || {
      category,
      amount: 0,
      entries: 0,
    };
  existingCategory.amount += expense.amount;
  existingCategory.entries += 1;
  accumulator.expense_categories[category] = existingCategory;
}

function finalizeReportAccumulator(accumulator) {
  const revenueBreakdown = normalizeCurrencyBreakdown(accumulator.revenue_breakdown);
  const expenseBreakdown = normalizeCurrencyBreakdown(accumulator.expense_breakdown);
  const payrollBreakdown = normalizeCurrencyBreakdown(accumulator.payroll_breakdown);
  const expenseCategories = finalizeExpenseCategories(
    accumulator.expense_categories,
    accumulator.expense_total
  );

  return {
    key: accumulator.key,
    year: normalizeInteger(accumulator.year),
    label: accumulator.label,
    start_at: accumulator.start_at,
    end_at: accumulator.end_at,
    revenue_total: roundAmount(accumulator.revenue_total),
    expense_total: roundAmount(accumulator.expense_total),
    net_total: roundAmount(accumulator.revenue_total - accumulator.expense_total),
    payment_count: accumulator.payment_count,
    expense_count: accumulator.expense_count,
    payroll_count: accumulator.payroll_count,
    business_count: accumulator.businesses.size,
    revenue_breakdown: revenueBreakdown,
    expense_breakdown: expenseBreakdown,
    payroll_breakdown: payrollBreakdown,
    payroll_total: roundAmount(accumulator.payroll_total),
    net_breakdown: buildNetBreakdown(revenueBreakdown, expenseBreakdown),
    expense_categories: expenseCategories,
    top_expense_category: expenseCategories[0] || null,
    average_payment_value: accumulator.payment_count
      ? roundAmount(accumulator.revenue_total / accumulator.payment_count)
      : 0,
    margin_percent: accumulator.revenue_total
      ? roundAmount(((accumulator.revenue_total - accumulator.expense_total) / accumulator.revenue_total) * 100)
      : null,
  };
}

function normalizeCurrencyBreakdown(breakdown) {
  return Object.fromEntries(
    Object.entries(breakdown || {})
      .filter(([, amount]) => Number.isFinite(Number(amount)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => [currency, roundAmount(amount)])
  );
}

function buildNetBreakdown(revenueBreakdown, expenseBreakdown) {
  const currencies = new Set([
    ...Object.keys(revenueBreakdown || {}),
    ...Object.keys(expenseBreakdown || {}),
  ]);
  const netBreakdown = {};

  for (const currency of currencies) {
    const netAmount =
      roundAmount((revenueBreakdown?.[currency] || 0) - (expenseBreakdown?.[currency] || 0));
    if (netAmount !== 0) {
      netBreakdown[currency] = netAmount;
    }
  }

  return netBreakdown;
}

function finalizeExpenseCategories(categories, totalAmount) {
  return Object.values(categories || {})
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }
      return left.category.localeCompare(right.category);
    })
    .map((item) => ({
      category: item.category,
      amount: roundAmount(item.amount),
      entries: item.entries,
      share_percent: totalAmount ? roundAmount((item.amount / totalAmount) * 100) : 0,
    }));
}

function buildReportHighlights(rows) {
  return {
    highest_revenue_period: pickHighlightedRow(rows, "revenue_total", "revenue_breakdown"),
    highest_expense_period: pickHighlightedRow(rows, "expense_total", "expense_breakdown"),
    strongest_net_period: pickHighlightedRow(rows, "net_total", "net_breakdown"),
  };
}

function pickHighlightedRow(rows, metricKey, breakdownKey) {
  const finiteRows = ensureArray(rows).filter(
    (row) => Number.isFinite(Number(row?.[metricKey]))
  );
  if (!finiteRows.length) {
    return null;
  }

  const candidates = finiteRows.filter((row) => Number(row[metricKey]) > 0);
  const sourceRows = candidates.length ? candidates : finiteRows;

  const best = sourceRows.reduce((currentBest, row) =>
    row[metricKey] > currentBest[metricKey] ? row : currentBest
  );

  return {
    label: best.label,
    amount: best[metricKey],
    breakdown: best[breakdownKey] || {},
  };
}

function summarizeRevenueWindow(payments, expenses, period) {
  const now = new Date();
  const summary = createReportAccumulator();
  const currentBucket = period === "lifetime" ? null : getRevenueBucket(now.toISOString(), period);

  for (const payment of payments) {
    const paidAt = normalizeDateInput(payment.paid_at);
    if (!paidAt) {
      continue;
    }

    if (currentBucket) {
      const paymentBucket = getRevenueBucket(payment.paid_at, period);
      if (!paymentBucket || currentBucket.key !== paymentBucket.key) {
        continue;
      }
    }

    addPaymentToAccumulator(summary, payment);
  }

  for (const expense of expenses) {
    const incurredAt = normalizeDateInput(expense.incurred_at);
    if (!incurredAt) {
      continue;
    }

    if (currentBucket) {
      const expenseBucket = getRevenueBucket(expense.incurred_at, period);
      if (!expenseBucket || currentBucket.key !== expenseBucket.key) {
        continue;
      }
    }

    addExpenseToAccumulator(summary, expense);
  }

  return finalizeReportAccumulator(summary);
}

function getRevenueBucket(value, period) {
  const date = normalizeDateInput(value);
  if (!date) {
    return null;
  }

  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const monthNumber = String(monthIndex + 1).padStart(2, "0");

  if (period === "monthly") {
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0));
    return {
      key: `${year}-${monthNumber}`,
      year,
      label: start.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" }),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
    };
  }

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return {
    key: String(year),
    year,
    label: String(year),
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function executeSourceWorkflow(steps) {
  const sourceConfig = getSourceRepoConfig();
  return executeRepoWorkflow({
    repoRoot: getSourceRepoRoot(),
    remoteName: sourceConfig.remoteName,
    defaultBranch: sourceConfig.defaultBranch,
    label: "source-control app",
    steps,
  });
}

function buildSourceSnapshot(lastCommand = null) {
  const sourceConfig = getSourceRepoConfig();
  return buildRepoSnapshot({
    repoRoot: getSourceRepoRoot(),
    remoteName: sourceConfig.remoteName,
    defaultBranch: sourceConfig.defaultBranch,
    label: "source-control app",
    lastCommand,
  });
}

function executeDbWorkflow(steps) {
  const dbConfig = getDbRepoConfig();
  return executeRepoWorkflow({
    repoRoot: getDbRepoRoot(),
    remoteName: dbConfig.remoteName,
    defaultBranch: dbConfig.defaultBranch,
    label: "DB manager",
    steps,
    extra: buildDbSnapshotExtras(),
  });
}

function buildDbSnapshot(lastCommand = null) {
  const dbConfig = getDbRepoConfig();
  return buildRepoSnapshot({
    repoRoot: getDbRepoRoot(),
    remoteName: dbConfig.remoteName,
    defaultBranch: dbConfig.defaultBranch,
    label: "DB manager",
    lastCommand,
    extra: buildDbSnapshotExtras(),
  });
}

function buildDbSnapshotExtras() {
  const dbConfig = getDbRepoConfig();
  const repoRoot = getDbRepoRoot();
  return {
    source_basic_dir: BASIC_DIR,
    source_detailed_dir: DETAILED_DIR,
    target_basic_dir: path.join(repoRoot, dbConfig.basicTargetPath),
    target_detailed_dir: path.join(repoRoot, dbConfig.detailedTargetPath),
  };
}

function executeRepoWorkflow({ repoRoot, remoteName, defaultBranch, label, steps, extra = {} }) {
  const logs = [];
  let lastSummary = "Repository control is ready.";

  for (const step of ensureArray(steps)) {
    if (typeof step.run === "function") {
      const result = step.run();
      if (result?.summary) {
        lastSummary = result.summary;
      }
      if (result?.log) {
        logs.push(String(result.log).trim());
      }
      continue;
    }

    const result = runGitCommandInRepo(repoRoot, step.args);
    const commandLabel = `$ git ${ensureArray(step.args).join(" ")}`;

    if (!result.ok) {
      if (step.allowNoop && isGitNoopResult(result.output)) {
        lastSummary = step.noopSummary || step.summary || "No changes were required.";
        logs.push(`${commandLabel}\n${result.output || lastSummary}`);
        continue;
      }

      throw new Error(result.output || `${commandLabel} failed.`);
    }

    lastSummary = step.summary || "Git command completed.";
    logs.push(`${commandLabel}\n${result.output || lastSummary}`);
  }

  return buildRepoSnapshot({
    repoRoot,
    remoteName,
    defaultBranch,
    label,
    lastCommand: {
      output: logs.join("\n\n").trim(),
      summary: lastSummary,
    },
    extra,
  });
}

function buildRepoSnapshot({ repoRoot, remoteName, defaultBranch, label, lastCommand = null, extra = {} }) {
  const branch = getBranchNameForRepo(repoRoot, defaultBranch, label);
  const statusResult = runGitCommandInRepo(repoRoot, ["status", "--porcelain=v1", "--branch"]);
  if (!statusResult.ok) {
    throw new Error(statusResult.output || "Unable to read git status.");
  }

  const parsedStatus = parseGitStatusOutput(statusResult.output, branch);
  const remoteResult = runGitCommandInRepo(repoRoot, ["remote", "get-url", remoteName], {
    allowFailure: true,
  });
  const lastOutput = stringOrDefault(lastCommand?.output, statusResult.output);
  const lastSummary = stringOrDefault(lastCommand?.summary, parsedStatus.status_summary);

  return {
    repo_root: repoRoot,
    branch,
    remote_name: remoteName,
    remote_url: remoteResult.ok ? remoteResult.stdout.trim() : "",
    ahead: parsedStatus.ahead,
    behind: parsedStatus.behind,
    is_clean: parsedStatus.changed_count === 0,
    changed_count: parsedStatus.changed_count,
    staged_count: parsedStatus.staged_count,
    changed_files: parsedStatus.changed_files,
    status_text: statusResult.output,
    status_summary: parsedStatus.status_summary,
    last_output: lastOutput,
    last_summary: lastSummary,
    ...extra,
  };
}

function parseGitStatusOutput(output, branch) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .filter(Boolean);
  const header = lines.find((line) => line.startsWith("## ")) || "";
  const changedLines = lines.filter((line) => !line.startsWith("## "));
  const changedFiles = changedLines.map((line) => parseGitStatusLine(line)).filter(Boolean);
  const stagedCount = changedFiles.filter((file) => file.staged).length;
  const changedCount = changedFiles.length;
  const { ahead, behind } = parseGitAheadBehind(header);

  return {
    ahead,
    behind,
    changed_count: changedCount,
    staged_count: stagedCount,
    changed_files: changedFiles,
    status_summary: changedCount
      ? `${changedCount} changed file${changedCount === 1 ? "" : "s"} on ${branch}.`
      : `Working tree clean on ${branch}.`,
  };
}

function parseGitAheadBehind(headerLine) {
  const match = String(headerLine || "").match(/\[(.*?)\]/);
  if (!match) {
    return { ahead: 0, behind: 0 };
  }

  const parts = match[1].split(",");
  let ahead = 0;
  let behind = 0;

  for (const part of parts) {
    const normalized = part.trim();
    if (normalized.startsWith("ahead")) {
      ahead = normalizeInteger(normalized.replace(/[^\d-]/g, "")) || 0;
    }
    if (normalized.startsWith("behind")) {
      behind = normalizeInteger(normalized.replace(/[^\d-]/g, "")) || 0;
    }
  }

  return { ahead, behind };
}

function parseGitStatusLine(line) {
  const text = String(line || "");
  if (text.length < 3) {
    return null;
  }

  const stagedCode = text[0];
  const unstagedCode = text[1];
  const pathText = text.slice(3).trim();
  const finalPath = pathText.includes(" -> ") ? pathText.split(" -> ").pop() : pathText;
  const staged = stagedCode !== " " && stagedCode !== "?";
  const unstaged = unstagedCode !== " " && unstagedCode !== "?";
  const untracked = stagedCode === "?" || unstagedCode === "?";
  const deleted = stagedCode === "D" || unstagedCode === "D";
  const renamed = stagedCode === "R" || unstagedCode === "R";

  return {
    path: finalPath,
    status: `${stagedCode}${unstagedCode}`.trim() || "??",
    staged,
    unstaged,
    untracked,
    summary: untracked
      ? "Untracked file"
      : renamed
        ? "Renamed file"
        : deleted
          ? "Deleted file"
          : staged && unstaged
            ? "Staged and modified"
            : staged
              ? "Staged change"
              : "Modified file",
  };
}

function runGitCommand(args, options = {}) {
  return runGitCommandInRepo(getSourceRepoRoot(), args, options);
}

function runGitCommandInRepo(repoRoot, args, options = {}) {
  return runGitCommandInDirectory(repoRoot, args, options);
}

function runGitCommandInDirectory(cwd, args, options = {}) {
  const result = spawnSync("git", ensureArray(args), {
    cwd,
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const output = [stdout, stderr].filter(Boolean).join("\n").trim();
  const ok = !result.error && result.status === 0;

  if (!ok && !options.allowFailure) {
    return {
      ok: false,
      stdout,
      stderr,
      output: output || result.error?.message || "Git command failed.",
    };
  }

  return {
    ok,
    stdout,
    stderr,
    output,
  };
}

function getCurrentAdminEnv() {
  return loadEnvFile(ADMIN_ENV_FILE);
}

function resolveRepoConfigPath(value, fallback = "") {
  const normalized = stringOrDefault(value, fallback);
  if (!normalized) {
    return "";
  }
  return path.resolve(path.join(__dirname, ".."), normalized);
}

function isRemoteRepoReference(value) {
  return /^(?:https?:\/\/|ssh:\/\/|git@)/i.test(String(value || "").trim());
}

function normalizeRepoUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeRepoUrlForCompare(value) {
  return normalizeRepoUrl(value).replace(/\.git$/i, "");
}

function getSourceRepoConfig() {
  const envValues = getCurrentAdminEnv();
  return {
    repoPath: resolveRepoConfigPath(envValues.ADMIN_GIT_REPO_PATH, "."),
    remoteName: stringOrDefault(envValues.ADMIN_GIT_REMOTE, "origin"),
    defaultBranch: stringOrDefault(envValues.ADMIN_GIT_DEFAULT_BRANCH),
  };
}

function getDbRepoConfig() {
  const envValues = getCurrentAdminEnv();
  const repoInput = stringOrDefault(envValues.ADMIN_DB_REPO_PATH);
  const remoteUrl = isRemoteRepoReference(repoInput) ? normalizeRepoUrl(repoInput) : "";
  const repoPath = remoteUrl
    ? resolveRepoConfigPath(DEFAULT_DB_REPO_CLONE_SUBPATH)
    : resolveRepoConfigPath(repoInput);

  return {
    repoInput,
    remoteUrl,
    repoPath,
    remoteName: stringOrDefault(envValues.ADMIN_DB_REMOTE, "origin"),
    defaultBranch: stringOrDefault(envValues.ADMIN_DB_DEFAULT_BRANCH),
    basicTargetPath: normalizeRepoSubpath(envValues.ADMIN_DB_BASIC_TARGET, "basic"),
    detailedTargetPath: normalizeRepoSubpath(envValues.ADMIN_DB_DETAILED_TARGET, "detailed"),
  };
}

function getSourceRepoRoot() {
  const sourceConfig = getSourceRepoConfig();
  return getRepoRootFromConfig(sourceConfig.repoPath, "source-control app");
}

function getSourceBranchName() {
  const sourceConfig = getSourceRepoConfig();
  return getBranchNameForRepo(getSourceRepoRoot(), sourceConfig.defaultBranch, "source-control app");
}

function getDbRepoRoot() {
  const dbConfig = getDbRepoConfig();
  if (!dbConfig.repoPath && !dbConfig.remoteUrl) {
    throw new Error("Configure the DB repo path or URL in admin/.env before using DB Manager.");
  }
  if (dbConfig.remoteUrl) {
    ensureDbRepoClone(dbConfig);
  }
  return getRepoRootFromConfig(dbConfig.repoPath, "DB manager");
}

function getDbBranchName() {
  const dbConfig = getDbRepoConfig();
  return getBranchNameForRepo(getDbRepoRoot(), dbConfig.defaultBranch, "DB manager");
}

function ensureDbRepoClone(dbConfig) {
  const repoPath = dbConfig?.repoPath;
  const remoteUrl = dbConfig?.remoteUrl;
  if (!repoPath || !remoteUrl) {
    return;
  }

  if (!fs.existsSync(repoPath)) {
    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
    const cloneResult = runGitCommandInDirectory(path.dirname(repoPath), [
      "clone",
      remoteUrl,
      path.basename(repoPath),
    ]);
    if (!cloneResult.ok) {
      throw new Error(cloneResult.output || `Unable to clone ${remoteUrl}.`);
    }
  } else if (!isGitRepository(repoPath)) {
    const entries = fs.readdirSync(repoPath);
    if (entries.length) {
      throw new Error(
        `Configured DB repo path exists but is not a git repository: ${repoPath}`
      );
    }

    const cloneResult = runGitCommandInDirectory(path.dirname(repoPath), [
      "clone",
      remoteUrl,
      path.basename(repoPath),
    ]);
    if (!cloneResult.ok) {
      throw new Error(cloneResult.output || `Unable to clone ${remoteUrl}.`);
    }
  }

  ensureRepoRemoteConfigured(repoPath, dbConfig.remoteName, remoteUrl);
}

function isGitRepository(repoPath) {
  const probe = runGitCommandInDirectory(repoPath, ["rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  return probe.ok;
}

function ensureRepoRemoteConfigured(repoRoot, remoteName, remoteUrl) {
  if (!repoRoot || !remoteName || !remoteUrl) {
    return;
  }

  const currentRemote = runGitCommandInRepo(repoRoot, ["remote", "get-url", remoteName], {
    allowFailure: true,
  });
  const hasMatchingRemote =
    currentRemote.ok &&
    normalizeRepoUrlForCompare(currentRemote.stdout) === normalizeRepoUrlForCompare(remoteUrl);

  if (hasMatchingRemote) {
    return;
  }

  const remoteCommand = currentRemote.ok
    ? ["remote", "set-url", remoteName, remoteUrl]
    : ["remote", "add", remoteName, remoteUrl];
  const result = runGitCommandInRepo(repoRoot, remoteCommand);
  if (!result.ok) {
    throw new Error(result.output || `Unable to configure ${remoteName} for ${repoRoot}.`);
  }
}

function getRepoRootFromConfig(repoConfigPath, label) {
  if (!repoConfigPath) {
    throw new Error(`Configure the ${label} repo path in .env before using this app.`);
  }
  if (!fs.existsSync(repoConfigPath)) {
    throw new Error(`Configured ${label} repo path does not exist: ${repoConfigPath}`);
  }

  const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoConfigPath,
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  if (probe.error || probe.status !== 0) {
    throw new Error(`No git repository was found at ${repoConfigPath}`);
  }

  return String(probe.stdout || "").trim() || repoConfigPath;
}

function getBranchNameForRepo(repoRoot, defaultBranch, label) {
  const branchResult = runGitCommandInRepo(repoRoot, ["branch", "--show-current"]);
  const branch = stringOrDefault(branchResult.stdout, defaultBranch);
  if (!branch) {
    throw new Error(`A checked-out branch is required before using the ${label}.`);
  }
  return branch;
}

function mirrorBusinessDataToDbRepo() {
  const dbConfig = getDbRepoConfig();
  const repoRoot = getDbRepoRoot();
  const basicTargetDir = path.join(repoRoot, dbConfig.basicTargetPath);
  const detailedTargetDir = path.join(repoRoot, dbConfig.detailedTargetPath);
  const basicResult = mirrorJsonDirectory(BASIC_DIR, basicTargetDir);
  const detailedResult = mirrorJsonDirectory(DETAILED_DIR, detailedTargetDir);
  const mirroredFileCount = basicResult.copied + detailedResult.copied;

  return {
    summary: `Mirrored ${mirroredFileCount} JSON files into the DB repository.`,
    log: [
      `Mirrored basic data: ${basicResult.copied} copied, ${basicResult.removed} removed`,
      `Source: ${BASIC_DIR}`,
      `Target: ${basicTargetDir}`,
      "",
      `Mirrored detailed data: ${detailedResult.copied} copied, ${detailedResult.removed} removed`,
      `Source: ${DETAILED_DIR}`,
      `Target: ${detailedTargetDir}`,
    ].join("\n"),
  };
}

function mirrorJsonDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const sourceFiles = fs
    .readdirSync(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(".json"));
  const sourceFileSet = new Set(sourceFiles);

  let removed = 0;
  for (const targetFile of fs.readdirSync(targetDir)) {
    if (!targetFile.toLowerCase().endsWith(".json")) {
      continue;
    }
    if (!sourceFileSet.has(targetFile)) {
      fs.unlinkSync(path.join(targetDir, targetFile));
      removed += 1;
    }
  }

  for (const fileName of sourceFiles) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(targetDir, fileName));
  }

  return {
    copied: sourceFiles.length,
    removed,
  };
}

function isGitNoopResult(output) {
  return /nothing to commit|nothing added to commit|working tree clean/i.test(String(output || ""));
}

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function loadPlanCatalog() {
  const rawCatalog = readJson(PLAN_CATALOG_FILE, {});
  const baseMonthlyRate = normalizeFloat(rawCatalog?.base_monthly_rate) ?? 100;
  const currency = stringOrDefault(rawCatalog?.currency, "NPR");
  const fallbackPlans = [
    {
      id: "monthly",
      label: "monthly",
      months: 1,
      discount_percent: 0,
      description: "1 month at the standard monthly rate.",
    },
    {
      id: "yearly",
      label: "Yearly",
      months: 12,
      discount_percent: 10,
      description: "12 months with a 10% discount.",
    },
    {
      id: "six-months",
      label: "6 Months",
      months: 6,
      discount_percent: 5,
      description: "6 months with a 5% discount.",
    },
  ];
  const plans = ensureArray(rawCatalog?.plans)
    .map((record, index) => sanitizePlanDefinition(record, index, baseMonthlyRate, currency))
    .filter(Boolean);
  const normalizedPlans = plans.length
    ? plans
    : fallbackPlans.map((record, index) =>
        sanitizePlanDefinition(record, index, baseMonthlyRate, currency)
      );

  return {
    currency,
    base_monthly_rate: baseMonthlyRate,
    default_label: stringOrDefault(rawCatalog?.default_label, normalizedPlans[0]?.label || "monthly"),
    plans: normalizedPlans,
  };
}

function sanitizePlanDefinition(record, index, baseMonthlyRate, currency) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const label = stringOrDefault(record.label, `Plan ${index + 1}`);
  const months = Math.max(1, normalizeInteger(record.months) || 12);
  const discountPercent = Math.min(100, Math.max(0, normalizeFloat(record.discount_percent) ?? 0));

  return {
    id: sanitizeSlug(record.id || label) || `plan-${index + 1}`,
    label,
    months,
    discount_percent: discountPercent,
    description: stringOrDefault(record.description),
    currency,
    amount: calculatePlanAmount(baseMonthlyRate, months, discountPercent),
  };
}

function calculatePlanAmount(baseMonthlyRate, months, discountPercent) {
  const grossAmount = baseMonthlyRate * months;
  const discountedAmount = grossAmount * (1 - discountPercent / 100);
  return Number(discountedAmount.toFixed(2));
}

function getPlanDefinition(value) {
  const normalized = sanitizeSlug(value);
  if (!normalized) {
    return PLAN_CATALOG.plans[0] || null;
  }

  return (
    PLAN_CATALOG.plans.find(
      (plan) =>
        plan.id === normalized ||
        sanitizeSlug(plan.label) === normalized ||
        normalized.includes(plan.id) ||
        normalized.includes(sanitizeSlug(plan.label))
    ) ||
    PLAN_CATALOG.plans[0] ||
    null
  );
}

function getDefaultPlanAmount(planValue) {
  return getPlanDefinition(planValue)?.amount ?? PLAN_CATALOG.plans[0]?.amount ?? 0;
}

function getPlanDurationMonths(planValue) {
  return getPlanDefinition(planValue)?.months ?? PLAN_CATALOG.plans[0]?.months ?? 12;
}

function getPlanExpiryDate(startDate, planValue) {
  return addMonthsUtc(startDate, getPlanDurationMonths(planValue));
}

function hydrateStoredSubscription(input) {
  const raw = input || {};
  const plan = stringOrDefault(raw.plan, DEFAULT_SUBSCRIPTION_PLAN);
  const startsAt = normalizeDateInput(raw.starts_at || raw.paid_at);
  const expiresAt = normalizeDateInput(
    raw.expires_at || (startsAt ? getPlanExpiryDate(startsAt, plan) : null)
  );
  const now = new Date();
  let paymentStatus = String(raw.payment_status || "").toLowerCase();

  if (expiresAt) {
    paymentStatus = expiresAt.getTime() > now.getTime() ? "active" : "expired";
  } else if (paymentStatus !== "pending") {
    paymentStatus = "pending";
  }

  const timeRemainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : null;
  const daysRemaining = timeRemainingMs == null ? null : Math.ceil(timeRemainingMs / 86400000);

  return {
    plan,
    amount: normalizeFloat(raw.amount) ?? getDefaultPlanAmount(plan),
    currency: stringOrDefault(raw.currency, DEFAULT_SUBSCRIPTION_CURRENCY),
    payment_method: stringOrDefault(raw.payment_method),
    payment_reference: stringOrDefault(raw.payment_reference),
    notes: stringOrDefault(raw.notes),
    auto_renew: Boolean(raw.auto_renew),
    paid_at: normalizeDateInput(raw.paid_at)?.toISOString() || "",
    starts_at: startsAt ? startsAt.toISOString() : "",
    expires_at: expiresAt ? expiresAt.toISOString() : "",
    payment_status: paymentStatus || "pending",
    days_remaining: daysRemaining,
    is_active: paymentStatus === "active",
    is_expired: paymentStatus === "expired",
    last_updated_at: stringOrDefault(raw.last_updated_at),
  };
}

function stripSubscriptionForStorage(input) {
  const raw = input || {};
  const plan = stringOrDefault(raw.plan, DEFAULT_SUBSCRIPTION_PLAN);
  return {
    plan,
    amount: normalizeFloat(raw.amount) ?? getDefaultPlanAmount(plan),
    currency: stringOrDefault(raw.currency, DEFAULT_SUBSCRIPTION_CURRENCY),
    payment_method: stringOrDefault(raw.payment_method),
    payment_reference: stringOrDefault(raw.payment_reference),
    notes: stringOrDefault(raw.notes),
    auto_renew: Boolean(raw.auto_renew),
    paid_at: normalizeDateInput(raw.paid_at)?.toISOString() || "",
    starts_at: normalizeDateInput(raw.starts_at)?.toISOString() || "",
    expires_at: normalizeDateInput(raw.expires_at)?.toISOString() || "",
    payment_status: stringOrDefault(raw.payment_status, "pending").toLowerCase(),
    last_updated_at: stringOrDefault(raw.last_updated_at),
  };
}

function buildSubscriptionFromSave(input, existingSubscription, nowIso) {
  const source = input || {};
  const previous = hydrateStoredSubscription(existingSubscription || {});
  const previousPlan = stringOrDefault(previous.plan, DEFAULT_SUBSCRIPTION_PLAN);
  const plan = stringOrDefault(source.plan, previousPlan || DEFAULT_SUBSCRIPTION_PLAN);
  const amount =
    normalizeFloat(source.amount) ??
    (plan !== previousPlan
      ? getDefaultPlanAmount(plan)
      : previous.amount ?? getDefaultPlanAmount(plan));
  const currency = stringOrDefault(
    source.currency,
    previous.currency || DEFAULT_SUBSCRIPTION_CURRENCY
  );
  const paymentMethod = stringOrDefault(source.payment_method, previous.payment_method || "");
  const paymentReference = stringOrDefault(
    source.payment_reference,
    previous.payment_reference || ""
  );
  const notes = stringOrDefault(source.notes, previous.notes || "");
  const autoRenew = Boolean(source.auto_renew ?? previous.auto_renew);
  const requestedStatus = stringOrDefault(
    source.payment_status,
    previous.payment_status || "pending"
  ).toLowerCase();
  const paidAtValue =
    source.paid_at !== undefined
      ? source.paid_at
      : requestedStatus === "pending"
        ? ""
        : previous.paid_at;
  const startsAtValue =
    source.starts_at !== undefined
      ? source.starts_at
      : requestedStatus === "pending"
        ? ""
        : previous.starts_at || paidAtValue;
  const paidAt = normalizeDateInput(paidAtValue);
  const startsAt = normalizeDateInput(
    startsAtValue || paidAt || (requestedStatus === "pending" ? null : nowIso)
  );
  let expiresAt = normalizeDateInput(source.expires_at !== undefined ? source.expires_at : null);

  if ((requestedStatus === "paid" || requestedStatus === "active" || requestedStatus === "expired") && startsAt) {
    expiresAt = expiresAt || getPlanExpiryDate(startsAt, plan);
  }

  if (requestedStatus === "pending") {
    expiresAt = null;
  }

  const effectiveStatus = expiresAt
    ? expiresAt.getTime() > Date.now()
      ? "active"
      : "expired"
    : "pending";
  const effectivePaidAt =
    effectiveStatus === "pending" ? null : paidAt || startsAt || normalizeDateInput(nowIso);

  return stripSubscriptionForStorage({
    plan,
    amount,
    currency,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
    notes,
    auto_renew: autoRenew,
    paid_at: effectivePaidAt ? effectivePaidAt.toISOString() : "",
    starts_at: startsAt && effectiveStatus !== "pending" ? startsAt.toISOString() : "",
    expires_at: expiresAt ? expiresAt.toISOString() : "",
    payment_status: effectiveStatus,
    last_updated_at: nowIso,
  });
}

function buildPaymentHistory(existingHistory, nextSubscription, previousSubscription, source) {
  const history = ensureArray(existingHistory).slice();
  const shouldRecord =
    Boolean(source?.payment_status && String(source.payment_status).toLowerCase() !== "pending") ||
    Boolean(source?.paid_at) ||
    Boolean(source?.payment_reference) ||
    Boolean(source?.amount);

  if (!shouldRecord || nextSubscription.payment_status === "pending") {
    return history;
  }

  const previous = hydrateStoredSubscription(previousSubscription || {});
  const signature = [
    nextSubscription.plan,
    nextSubscription.paid_at,
    nextSubscription.starts_at,
    nextSubscription.expires_at,
    nextSubscription.amount,
    nextSubscription.payment_reference,
  ].join("|");
  const previousSignature = [
    previous.plan,
    previous.paid_at,
    previous.starts_at,
    previous.expires_at,
    previous.amount,
    previous.payment_reference,
  ].join("|");
  const last = history[history.length - 1];
  const lastSignature = last
    ? [
        last.plan,
        last.paid_at,
        last.starts_at,
        last.expires_at,
        last.amount,
        last.payment_reference,
      ].join("|")
    : "";

  if (signature === previousSignature || signature === lastSignature) {
    return history;
  }

  history.push({
    id: generateId(),
    plan: nextSubscription.plan,
    amount: nextSubscription.amount,
    currency: nextSubscription.currency,
    paid_at: nextSubscription.paid_at,
    starts_at: nextSubscription.starts_at,
    expires_at: nextSubscription.expires_at,
    payment_method: nextSubscription.payment_method,
    payment_reference: nextSubscription.payment_reference,
    notes: nextSubscription.notes,
  });

  return history;
}

function getRenewalStart(existingExpiry, paymentDate) {
  const expiry = normalizeDateInput(existingExpiry);
  if (expiry && expiry.getTime() > paymentDate.getTime()) {
    return expiry;
  }
  return paymentDate;
}

function addMonthsUtc(date, monthCount) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + monthCount + 1, 0, hours, minutes, seconds, milliseconds)
  );
  const targetDay = Math.min(day, lastDayOfTargetMonth.getUTCDate());
  return new Date(
    Date.UTC(
      lastDayOfTargetMonth.getUTCFullYear(),
      lastDayOfTargetMonth.getUTCMonth(),
      targetDay,
      hours,
      minutes,
      seconds,
      milliseconds
    )
  );
}

function loadStaffRecords() {
  return ensureArray(readJson(STAFF_FILE, []))
    .map((item) => normalizeStaffRecord(item))
    .filter(Boolean);
}

function writeStaffRecords(records) {
  writeJson(STAFF_FILE, ensureArray(records).map((item) => normalizeStaffRecord(item)).filter(Boolean));
}

function normalizeStaffRecord(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const paymentHistory = ensureArray(input.payment_history)
    .map((item) => normalizeStaffPaymentRecord(item))
    .filter(Boolean);
  const salaryIncrements = ensureArray(input.salary_increments)
    .map((item) => normalizeStaffIncrementRecord(item))
    .filter(Boolean)
    .sort((left, right) => {
      return (normalizeDateInput(right.effective_from)?.getTime() || 0) - (normalizeDateInput(left.effective_from)?.getTime() || 0);
    });
  const salaryCurrency = stringOrDefault(input.salary_currency, "NPR");
  const baseSalaryAmount = normalizeFloat(input.base_salary_amount) ?? normalizeFloat(input.salary_amount) ?? null;
  const baseSalaryCurrency = stringOrDefault(input.base_salary_currency, salaryCurrency);
  const baseRole = stringOrDefault(input.base_role, input.role);
  const baseDepartment = stringOrDefault(input.base_department, input.department);
  const payCycle = ["monthly", "biweekly", "weekly", "custom"].includes(String(input.pay_cycle || "").trim().toLowerCase())
    ? String(input.pay_cycle || "").trim().toLowerCase()
    : "monthly";
  const paymentDay = normalizeInteger(input.payment_day);

  return {
    id: stringOrDefault(input.id, generateId()),
    employee_code: stringOrDefault(input.employee_code),
    full_name: stringOrDefault(input.full_name),
    role: stringOrDefault(input.role, baseRole),
    department: stringOrDefault(input.department, baseDepartment),
    employment_type: stringOrDefault(input.employment_type, "Full Time"),
    status: stringOrDefault(input.status, "active").toLowerCase(),
    phone: stringOrDefault(input.phone),
    email: stringOrDefault(input.email),
    address: stringOrDefault(input.address),
    emergency_contact: stringOrDefault(input.emergency_contact),
    joined_at: normalizeDateInput(input.joined_at)?.toISOString() || "",
    left_at: normalizeDateInput(input.left_at)?.toISOString() || "",
    salary_amount: normalizeFloat(input.salary_amount) ?? baseSalaryAmount,
    salary_currency: salaryCurrency,
    base_salary_amount: baseSalaryAmount,
    base_salary_currency: baseSalaryCurrency,
    base_role: baseRole,
    base_department: baseDepartment,
    pay_cycle: payCycle,
    payment_day: paymentDay != null ? Math.max(1, Math.min(31, paymentDay)) : null,
    bank_account: stringOrDefault(input.bank_account),
    avatar_url: stringOrDefault(input.avatar_url),
    notes: stringOrDefault(input.notes),
    skills: cleanStringArray(input.skills),
    documents: cleanStringArray(input.documents),
    salary_increments: salaryIncrements,
    payment_history: paymentHistory.sort((left, right) => {
      return (normalizeDateInput(right.paid_at)?.getTime() || 0) - (normalizeDateInput(left.paid_at)?.getTime() || 0);
    }),
    created_at: stringOrDefault(input.created_at),
    updated_at: stringOrDefault(input.updated_at),
  };
}

function normalizeStaffPaymentRecord(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const paidAt = normalizeDateInput(input.paid_at);
  return {
    id: stringOrDefault(input.id, generateId()),
    amount: normalizeFloat(input.amount) ?? null,
    currency: stringOrDefault(input.currency, "NPR"),
    paid_at: paidAt ? paidAt.toISOString() : "",
    method: stringOrDefault(input.method),
    reference: stringOrDefault(input.reference),
    notes: stringOrDefault(input.notes),
    created_at: stringOrDefault(input.created_at),
    updated_at: stringOrDefault(input.updated_at),
  };
}

function normalizeStaffIncrementRecord(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const effectiveFrom = normalizeDateInput(input.effective_from);
  if (!effectiveFrom) {
    return null;
  }

  return {
    id: stringOrDefault(input.id, generateId()),
    effective_from: effectiveFrom.toISOString(),
    salary_amount: normalizeFloat(input.salary_amount) ?? null,
    salary_currency: stringOrDefault(input.salary_currency, "NPR"),
    role: stringOrDefault(input.role),
    department: stringOrDefault(input.department),
    notes: stringOrDefault(input.notes),
    created_at: stringOrDefault(input.created_at),
    updated_at: stringOrDefault(input.updated_at),
  };
}

function getFutureStaffIncrements(staff) {
  const nowTime = Date.now();
  return ensureArray(staff.salary_increments)
    .filter((item) => (normalizeDateInput(item.effective_from)?.getTime() || 0) > nowTime)
    .sort((left, right) => {
      return (normalizeDateInput(left.effective_from)?.getTime() || 0) - (normalizeDateInput(right.effective_from)?.getTime() || 0);
    });
}

function getNextStaffIncrement(staff) {
  return getFutureStaffIncrements(staff)[0] || null;
}

function getStaffTermsAtDate(staff, targetDateValue) {
  const targetTime = normalizeDateInput(targetDateValue)?.getTime() || Date.now();
  const resolved = {
    salary_amount: normalizeFloat(staff.base_salary_amount) ?? normalizeFloat(staff.salary_amount) ?? null,
    salary_currency: stringOrDefault(staff.base_salary_currency, staff.salary_currency || "NPR"),
    role: stringOrDefault(staff.base_role, staff.role),
    department: stringOrDefault(staff.base_department, staff.department),
  };

  const orderedIncrements = ensureArray(staff.salary_increments)
    .slice()
    .sort((left, right) => {
      return (normalizeDateInput(left.effective_from)?.getTime() || 0) - (normalizeDateInput(right.effective_from)?.getTime() || 0);
    });

  for (const increment of orderedIncrements) {
    const effectiveTime = normalizeDateInput(increment.effective_from)?.getTime() || 0;
    if (effectiveTime > targetTime) {
      break;
    }
    if (increment.salary_amount != null) {
      resolved.salary_amount = increment.salary_amount;
    }
    if (increment.salary_currency) {
      resolved.salary_currency = increment.salary_currency;
    }
    if (increment.role) {
      resolved.role = increment.role;
    }
    if (increment.department) {
      resolved.department = increment.department;
    }
  }

  return resolved;
}

function resolveUpcomingStaffTerms(staff, targetDateValue) {
  return getStaffTermsAtDate(staff, targetDateValue);
}

function decorateStaffRecord(record) {
  const staff = normalizeStaffRecord(record);
  if (!staff) {
    return null;
  }

  const paymentHistory = ensureArray(staff.payment_history);
  const totalPaid = paymentHistory.reduce((sum, item) => sum + (normalizeFloat(item.amount) || 0), 0);
  const lastPaymentAt = paymentHistory[0]?.paid_at || "";
  const nextPaymentDueAt = getNextStaffPaymentDue(staff, lastPaymentAt);
  const currentTerms = getStaffTermsAtDate(staff, new Date().toISOString());
  const upcomingTerms = resolveUpcomingStaffTerms(staff, nextPaymentDueAt || new Date().toISOString());
  const nextIncrement = getNextStaffIncrement(staff);
  const isOverdue =
    Boolean(nextPaymentDueAt) &&
    normalizeDateInput(nextPaymentDueAt)?.getTime() < Date.now() &&
    staff.status === "active";

  return {
    ...staff,
    salary_amount: currentTerms.salary_amount,
    salary_currency: currentTerms.salary_currency,
    role: currentTerms.role,
    department: currentTerms.department,
    payment_history: paymentHistory,
    total_paid_amount: totalPaid,
    last_payment_at: lastPaymentAt,
    next_payment_due_at: nextPaymentDueAt,
    upcoming_salary_amount: upcomingTerms.salary_amount,
    upcoming_salary_currency: upcomingTerms.salary_currency,
    upcoming_role: upcomingTerms.role,
    upcoming_department: upcomingTerms.department,
    next_increment: nextIncrement,
    is_overdue: isOverdue,
  };
}

function getNextStaffPaymentDue(staff, lastPaymentAt) {
  if (staff.status !== "active") {
    return "";
  }

  const baseDate =
    normalizeDateInput(lastPaymentAt) ||
    normalizeDateInput(staff.joined_at) ||
    new Date();

  if (staff.pay_cycle === "weekly") {
    return addDaysUtc(baseDate, 7).toISOString();
  }
  if (staff.pay_cycle === "biweekly") {
    return addDaysUtc(baseDate, 14).toISOString();
  }
  if (staff.pay_cycle === "custom") {
    return "";
  }

  const now = new Date();
  const desiredDay = Math.max(1, Math.min(31, staff.payment_day || baseDate.getUTCDate() || 1));
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), desiredDay));
  const lastDayOfMonth = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0));
  if (desiredDay > lastDayOfMonth.getUTCDate()) {
    candidate = lastDayOfMonth;
  }
  if (candidate.getTime() <= now.getTime()) {
    candidate = addMonthsUtc(candidate, 1);
  }
  return candidate.toISOString();
}

function buildStaffSnapshot() {
  const staff = loadStaffRecords().map((item) => decorateStaffRecord(item)).filter(Boolean);
  const monthKey = new Date().toISOString().slice(0, 7);
  const payrollThisMonth = staff.reduce((sum, item) => {
    const paidThisMonth = ensureArray(item.payment_history).reduce((paymentSum, payment) => {
      return String(payment.paid_at || "").startsWith(monthKey)
        ? paymentSum + (normalizeFloat(payment.amount) || 0)
        : paymentSum;
    }, 0);
    return sum + paidThisMonth;
  }, 0);

  return {
    staff,
    stats: {
      total: staff.length,
      active: staff.filter((item) => item.status === "active").length,
      inactive: staff.filter((item) => item.status !== "active").length,
      overdue: staff.filter((item) => item.is_overdue).length,
      scheduled_increments: staff.filter((item) => item.next_increment).length,
      payroll_this_month: payrollThisMonth,
    },
  };
}

function saveStaffMember(payload) {
  const records = loadStaffRecords();
  const existing = records.find((item) => item.id === stringOrDefault(payload.id));
  const now = new Date().toISOString();
  const requestedStatus = stringOrDefault(payload.status, existing?.status || "active").toLowerCase();
  const leftAt =
    requestedStatus === "active"
      ? ""
      : normalizeDateInput(payload.left_at || existing?.left_at)?.toISOString() ||
        (existing?.status === "active" ? now : existing?.left_at || now);
  const next = normalizeStaffRecord({
    ...(existing || {}),
    ...(payload || {}),
    id: existing?.id || stringOrDefault(payload.id, generateId()),
    created_at: existing?.created_at || now,
    updated_at: now,
    status: requestedStatus,
    left_at: leftAt,
    base_salary_amount:
      normalizeFloat(payload.salary_amount) ??
      normalizeFloat(existing?.base_salary_amount) ??
      normalizeFloat(existing?.salary_amount),
    base_salary_currency: stringOrDefault(
      payload.salary_currency,
      existing?.base_salary_currency || existing?.salary_currency || "NPR"
    ),
    base_role: stringOrDefault(payload.role, existing?.base_role || existing?.role),
    base_department: stringOrDefault(payload.department, existing?.base_department || existing?.department),
    salary_increments: existing?.salary_increments || [],
    payment_history: existing?.payment_history || [],
  });

  if (!next?.full_name) {
    throw new Error("Staff member name is required.");
  }
  if (!next.role) {
    throw new Error("Staff role is required.");
  }

  const filtered = records.filter((item) => item.id !== next.id);
  filtered.push(next);
  writeStaffRecords(filtered);
  return buildStaffSnapshot();
}

function removeStaffMember(idValue) {
  const id = stringOrDefault(idValue);
  if (!id) {
    throw new Error("Staff id is required.");
  }
  const records = loadStaffRecords();
  const staff = records.find((item) => item.id === id);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const hasFinancialHistory =
    ensureArray(staff.payment_history).length > 0 || ensureArray(staff.salary_increments).length > 0;

  if (!hasFinancialHistory) {
    writeStaffRecords(records.filter((item) => item.id !== id));
    return buildStaffSnapshot();
  }

  staff.status = "inactive";
  staff.left_at = staff.left_at || new Date().toISOString();
  staff.updated_at = new Date().toISOString();
  writeStaffRecords(records);
  return buildStaffSnapshot();
}

function saveStaffPaymentRecord(staffIdValue, payload) {
  const staffId = stringOrDefault(staffIdValue);
  if (!staffId) {
    throw new Error("Staff id is required.");
  }

  const records = loadStaffRecords();
  const staff = records.find((item) => item.id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }
  const existingPayment = ensureArray(staff.payment_history).find((item) => item.id === stringOrDefault(payload.id));

  const now = new Date().toISOString();
  const nextPayment = normalizeStaffPaymentRecord({
    ...(existingPayment || {}),
    ...(payload || {}),
    id: stringOrDefault(payload.id, generateId()),
    created_at: existingPayment?.created_at || now,
    updated_at: now,
  });

  if ((normalizeFloat(nextPayment.amount) || 0) <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }
  if (!nextPayment.paid_at) {
    throw new Error("Payment date is required.");
  }

  staff.payment_history = ensureArray(staff.payment_history).filter((item) => item.id !== nextPayment.id);
  staff.payment_history.push(nextPayment);
  staff.updated_at = now;
  writeStaffRecords(records);
  return buildStaffSnapshot();
}

function deleteStaffPaymentRecord(staffIdValue, paymentIdValue) {
  const staffId = stringOrDefault(staffIdValue);
  const paymentId = stringOrDefault(paymentIdValue);
  const records = loadStaffRecords();
  const staff = records.find((item) => item.id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  staff.payment_history = ensureArray(staff.payment_history).filter((item) => item.id !== paymentId);
  staff.updated_at = new Date().toISOString();
  writeStaffRecords(records);
  return buildStaffSnapshot();
}

function saveStaffIncrementRecord(staffIdValue, payload) {
  const staffId = stringOrDefault(staffIdValue);
  if (!staffId) {
    throw new Error("Staff id is required.");
  }

  const records = loadStaffRecords();
  const staff = records.find((item) => item.id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const existingIncrement = ensureArray(staff.salary_increments).find((item) => item.id === stringOrDefault(payload.id));
  const now = new Date().toISOString();
  staff.base_salary_amount =
    normalizeFloat(staff.base_salary_amount) ?? normalizeFloat(staff.salary_amount) ?? null;
  staff.base_salary_currency = stringOrDefault(staff.base_salary_currency, staff.salary_currency || "NPR");
  staff.base_role = stringOrDefault(staff.base_role, staff.role);
  staff.base_department = stringOrDefault(staff.base_department, staff.department);
  const nextIncrement = normalizeStaffIncrementRecord({
    ...(existingIncrement || {}),
    ...(payload || {}),
    id: stringOrDefault(payload.id, generateId()),
    salary_currency: stringOrDefault(payload.salary_currency, existingIncrement?.salary_currency || staff.salary_currency || "NPR"),
    created_at: existingIncrement?.created_at || now,
    updated_at: now,
  });

  if (!nextIncrement) {
    throw new Error("A valid increment effective date is required.");
  }
  if (
    nextIncrement.salary_amount == null &&
    !nextIncrement.role &&
    !nextIncrement.department
  ) {
    throw new Error("Add a salary, post, or department change to save the increment.");
  }

  staff.salary_increments = ensureArray(staff.salary_increments).filter((item) => item.id !== nextIncrement.id);
  staff.salary_increments.push(nextIncrement);
  staff.salary_increments.sort((left, right) => {
    return (normalizeDateInput(right.effective_from)?.getTime() || 0) - (normalizeDateInput(left.effective_from)?.getTime() || 0);
  });

  staff.updated_at = now;
  writeStaffRecords(records);
  return buildStaffSnapshot();
}

function deleteStaffIncrementRecord(staffIdValue, incrementIdValue) {
  const staffId = stringOrDefault(staffIdValue);
  const incrementId = stringOrDefault(incrementIdValue);
  const records = loadStaffRecords();
  const staff = records.find((item) => item.id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const increment = ensureArray(staff.salary_increments).find((item) => item.id === incrementId);
  if (!increment) {
    throw new Error("Increment record not found.");
  }

  staff.salary_increments = ensureArray(staff.salary_increments).filter((item) => item.id !== incrementId);
  staff.updated_at = new Date().toISOString();
  writeStaffRecords(records);
  return buildStaffSnapshot();
}

function loadCalendarEvents() {
  return ensureArray(readJson(CALENDAR_EVENTS_FILE, []))
    .map((item) => normalizeCalendarEvent(item))
    .filter(Boolean);
}

function writeCalendarEvents(events) {
  writeJson(CALENDAR_EVENTS_FILE, ensureArray(events).map((item) => normalizeCalendarEvent(item)).filter(Boolean));
}

function normalizeCalendarEvent(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const date = normalizeDateInput(input.date);
  return {
    id: stringOrDefault(input.id, generateId()),
    title: stringOrDefault(input.title),
    category: stringOrDefault(input.category, "reminder"),
    date: date ? date.toISOString() : "",
    notes: stringOrDefault(input.notes),
    source: stringOrDefault(input.source, "custom"),
    source_id: stringOrDefault(input.source_id),
    created_at: stringOrDefault(input.created_at),
    updated_at: stringOrDefault(input.updated_at),
  };
}

function buildAutomaticCalendarEvents() {
  const businessEvents = getAdminDirectoryList()
    .filter((business) => business.subscription?.expires_at)
    .map((business) => ({
      id: `biz:${business.slug}`,
      title: `${business.name} renewal due`,
      category: "business-renewal",
      date: business.subscription.expires_at,
      notes: `${business.location_full_label || business.location_label || "No location"} · ${business.subscription?.plan || DEFAULT_SUBSCRIPTION_PLAN}`,
      source: "business",
      source_id: business.slug,
    }));

  const staffEvents = buildStaffSnapshot().staff
    .filter((staff) => staff.next_payment_due_at)
    .map((staff) => ({
      id: `staff:${staff.id}`,
      title: `${staff.full_name} payroll due`,
      category: "staff-payroll",
      date: staff.next_payment_due_at,
      notes: `${staff.role || "Staff"} · ${staff.department || "No department"}`,
      source: "staff",
      source_id: staff.id,
    }));

  return [...businessEvents, ...staffEvents]
    .map((item) => normalizeCalendarEvent(item))
    .filter(Boolean);
}

function buildCalendarSnapshot() {
  const customEvents = loadCalendarEvents();
  const automaticEvents = buildAutomaticCalendarEvents();
  const events = [...automaticEvents, ...customEvents].sort((left, right) => {
    return (normalizeDateInput(left.date)?.getTime() || 0) - (normalizeDateInput(right.date)?.getTime() || 0);
  });

  return {
    today: new Date().toISOString(),
    custom_events: customEvents,
    automatic_events: automaticEvents,
    events,
    stats: {
      total: events.length,
      custom: customEvents.length,
      automatic: automaticEvents.length,
    },
  };
}

function saveCalendarEvent(payload) {
  const records = loadCalendarEvents();
  const existing = records.find((item) => item.id === stringOrDefault(payload.id));
  const now = new Date().toISOString();
  const next = normalizeCalendarEvent({
    ...(existing || {}),
    ...(payload || {}),
    id: existing?.id || stringOrDefault(payload.id, generateId()),
    source: "custom",
    created_at: existing?.created_at || now,
    updated_at: now,
  });

  if (!next?.title) {
    throw new Error("Calendar title is required.");
  }
  if (!next.date) {
    throw new Error("Calendar date is required.");
  }

  const filtered = records.filter((item) => item.id !== next.id);
  filtered.push(next);
  writeCalendarEvents(filtered);
  return buildCalendarSnapshot();
}

function removeCalendarEvent(idValue) {
  const id = stringOrDefault(idValue);
  writeCalendarEvents(loadCalendarEvents().filter((item) => item.id !== id));
  return buildCalendarSnapshot();
}

function readEmailLogs() {
  return ensureArray(readJson(EMAIL_LOG_FILE, []));
}

function writeEmailLogs(items) {
  writeJson(EMAIL_LOG_FILE, ensureArray(items).slice(0, 120));
}

function getEmailConfig() {
  const env = loadEnvFile(ADMIN_ENV_FILE);
  const port = normalizeInteger(env.ADMIN_SMTP_PORT) ?? 587;
  const secure = normalizeBoolean(env.ADMIN_SMTP_SECURE, port === 465);
  const user = stringOrDefault(env.ADMIN_SMTP_USER);
  const pass = stringOrDefault(env.ADMIN_SMTP_PASS);
  if ((user && !pass) || (!user && pass)) {
    throw new Error("Both SMTP username and password must be provided together.");
  }

  return {
    host: stringOrDefault(env.ADMIN_SMTP_HOST),
    port,
    secure,
    user,
    pass,
    from_name: stringOrDefault(env.ADMIN_EMAIL_FROM_NAME, "EduData Nepal"),
    from_address: stringOrDefault(env.ADMIN_EMAIL_FROM_ADDRESS),
    reply_to: stringOrDefault(env.ADMIN_EMAIL_REPLY_TO),
  };
}

function buildEmailSnapshot() {
  const config = getEmailConfig();
  const businesses = getAdminDirectoryList().filter((business) => String(business.contact?.email || "").trim());
  const staffRecipients = loadStaffRecords().filter((staff) => String(staff.email || "").trim());
  return {
    config_ready: Boolean(config.host && config.port && config.from_address && (!config.user || config.pass)),
    config,
    recipient_count: businesses.length + staffRecipients.length,
    business_recipient_count: businesses.length,
    staff_recipient_count: staffRecipients.length,
    available_tags: [
      "{{recipient_name}}",
      "{{recipient_email}}",
      "{{recipient_type}}",
      "{{business_name}}",
      "{{business_id}}",
      "{{business_slug}}",
      "{{district}}",
      "{{zone}}",
      "{{province}}",
      "{{business_email}}",
      "{{institution_head}}",
      "{{id_card_status}}",
      "{{website_ready}}",
      "{{apk_ready}}",
      "{{staff_name}}",
      "{{staff_role}}",
      "{{staff_department}}",
      "{{staff_email}}",
    ],
    recent_logs: readEmailLogs(),
  };
}

function renderEmailTemplate(input, recipient) {
  const replacements = {
    "{{recipient_name}}": recipient.name || "",
    "{{recipient_email}}": recipient.email || "",
    "{{recipient_type}}": recipient.type || "",
    "{{business_name}}": recipient.type === "business" ? recipient.name || "" : "",
    "{{business_id}}": recipient.type === "business" ? recipient.id || "" : "",
    "{{business_slug}}": recipient.type === "business" ? recipient.slug || "" : "",
    "{{district}}": recipient.type === "business" ? recipient.district || "" : "",
    "{{zone}}": recipient.type === "business" ? recipient.zone_name || "" : "",
    "{{province}}": recipient.type === "business" ? recipient.province_name || "" : "",
    "{{business_email}}": recipient.type === "business" ? recipient.email || "" : "",
    "{{institution_head}}":
      recipient.type === "business" ? recipient.institution_head?.name || "" : "",
    "{{id_card_status}}": recipient.type === "business" ? recipient.id_card?.status || "" : "",
    "{{website_ready}}": recipient.type === "business" && recipient.generator?.has_website ? "Yes" : "No",
    "{{apk_ready}}": recipient.type === "business" && recipient.generator?.has_apk ? "Yes" : "No",
    "{{staff_name}}": recipient.type === "staff" ? recipient.name || "" : "",
    "{{staff_role}}": recipient.type === "staff" ? recipient.role || "" : "",
    "{{staff_department}}": recipient.type === "staff" ? recipient.department || "" : "",
    "{{staff_email}}": recipient.type === "staff" ? recipient.email || "" : "",
  };

  return Object.entries(replacements).reduce((output, [token, value]) => {
    return output.replaceAll(token, String(value || ""));
  }, String(input || ""));
}

function buildEmailHtml(textBody) {
  const encode = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  return String(textBody || "")
    .split(/\r?\n/)
    .map((line) => encode(line) || "&nbsp;")
    .join("<br>");
}

function escapeHtmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isEmailConfigReady(config) {
  return Boolean(config?.host && config?.port && config?.from_address && (!config.user || config.pass));
}

function createEmailTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
}

function formatEmailFrom(config) {
  return config.from_name ? `"${config.from_name}" <${config.from_address}>` : config.from_address;
}

function appendEmailLogEntry(entry) {
  writeEmailLogs([entry, ...readEmailLogs()]);
}

async function sendBusinessEmailCampaign(payload) {
  const config = getEmailConfig();
  if (!isEmailConfigReady(config)) {
    throw new Error("Configure SMTP host, port, and from address in Config App before sending mail.");
  }

  const requestedRecipients = new Set(cleanStringArray(payload.recipient_slugs));
  const requestedStaff = new Set(cleanStringArray(payload.staff_ids));
  if (!requestedRecipients.size && !requestedStaff.size) {
    throw new Error("Select at least one business or staff recipient with an email address.");
  }

  const subject = stringOrDefault(payload.subject);
  const body = String(payload.body ?? "").trim();
  if (!subject) {
    throw new Error("Email subject is required.");
  }
  if (!body) {
    throw new Error("Email body is required.");
  }

  const transporter = createEmailTransporter(config);
  await transporter.verify();

  const recipients = [
    ...getAdminDirectoryList()
      .filter((business) => requestedRecipients.has(business.slug) && String(business.contact?.email || "").trim())
      .map((business) => ({
        type: "business",
        key: business.slug,
        id: business.id,
        slug: business.slug,
        name: business.name,
        email: business.contact.email,
        district: business.district,
        zone_name: business.zone_name,
        province_name: business.province_name,
        institution_head: business.institution_head,
        id_card: business.id_card,
        generator: business.generator,
      })),
    ...loadStaffRecords()
      .filter((staff) => requestedStaff.has(staff.id) && String(staff.email || "").trim())
      .map((staff) => ({
        type: "staff",
        key: staff.id,
        staff_id: staff.id,
        name: staff.full_name,
        email: staff.email,
        role: staff.role,
        department: staff.department,
      })),
  ];
  if (!recipients.length) {
    throw new Error("No valid business or staff recipients were found for this send.");
  }

  const results = [];
  for (const recipient of recipients) {
    const personalizedSubject = renderEmailTemplate(subject, recipient);
    const personalizedBody = renderEmailTemplate(body, recipient);
    try {
      const delivery = await transporter.sendMail({
        from: formatEmailFrom(config),
        replyTo: stringOrDefault(payload.reply_to, config.reply_to),
        to: recipient.email,
        cc: stringOrDefault(payload.cc),
        bcc: stringOrDefault(payload.bcc),
        subject: personalizedSubject,
        text: personalizedBody,
        html: buildEmailHtml(personalizedBody),
      });
      results.push({
        type: recipient.type,
        slug: recipient.slug,
        staff_id: recipient.staff_id,
        recipient_name: recipient.name,
        email: recipient.email,
        ok: true,
        message_id: delivery.messageId,
      });
    } catch (error) {
      results.push({
        type: recipient.type,
        slug: recipient.slug,
        staff_id: recipient.staff_id,
        recipient_name: recipient.name,
        email: recipient.email,
        ok: false,
        error: error.message,
      });
    }
  }

  const sentCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - sentCount;
  const logEntry = {
    id: generateId(),
    created_at: new Date().toISOString(),
    subject,
    sent_count: sentCount,
    failed_count: failedCount,
    recipients: results,
  };
  appendEmailLogEntry(logEntry);

  return {
    sent_count: sentCount,
    failed_count: failedCount,
    results,
    snapshot: buildEmailSnapshot(),
  };
}

async function sendBusinessRegistrationConfirmation(record, options = {}) {
  const config = getEmailConfig();
  if (!isEmailConfigReady(config)) {
    throw new Error("Configure SMTP host, port, and from address before sending business confirmation emails.");
  }

  const recipientEmail = stringOrDefault(record?.contact?.email);
  if (!recipientEmail) {
    throw new Error("Business email is missing.");
  }

  const transporter = createEmailTransporter(config);
  await transporter.verify();

  const idCard = buildBusinessIdCardPayload(record);
  const subject = `Registration confirmed: ${record.name} (${record.id})`;
  const textLines = [
    `Namaste ${record.name},`,
    "",
    "Your business registration has been confirmed in EduData Admin.",
    `Business ID: ${record.id}`,
    `Institution Head: ${idCard.holder_name || "Not set"}${idCard.holder_role ? ` (${idCard.holder_role})` : ""}`,
    `Location: ${idCard.location || "Not set"}`,
    "",
    options.includeIdCard === false ? "" : "Your ID card summary is included below in this email.",
    "",
    "You can reply to this email if any registration detail needs correction.",
  ].filter(Boolean);
  const htmlParts = [
    `<p>Namaste <strong>${escapeHtmlText(record.name)}</strong>,</p>`,
    `<p>Your business registration has been confirmed in EduData Admin.</p>`,
    `<p><strong>Business ID:</strong> ${escapeHtmlText(record.id)}<br><strong>Location:</strong> ${escapeHtmlText(idCard.location || "Not set")}</p>`,
  ];
  if (options.includeIdCard !== false) {
    htmlParts.push(renderBusinessIdCardHtml(idCard));
  }
  htmlParts.push("<p>You can reply to this email if any registration detail needs correction.</p>");

  const delivery = await transporter.sendMail({
    from: formatEmailFrom(config),
    replyTo: config.reply_to || undefined,
    to: recipientEmail,
    subject,
    text: textLines.join("\n"),
    html: htmlParts.join(""),
  });

  const sentAt = new Date().toISOString();
  appendEmailLogEntry({
    id: generateId(),
    created_at: sentAt,
    subject,
    sent_count: 1,
    failed_count: 0,
    recipients: [
      {
        type: "business",
        slug: record.slug,
        recipient_name: record.name,
        email: recipientEmail,
        ok: true,
        message_id: delivery.messageId,
      },
    ],
  });

  return {
    email: recipientEmail,
    message_id: delivery.messageId,
    sent_at: sentAt,
  };
}

async function sendBusinessIdCardEmail(record) {
  const config = getEmailConfig();
  if (!isEmailConfigReady(config)) {
    throw new Error("Configure SMTP host, port, and from address before sending ID cards.");
  }

  const recipientEmail = stringOrDefault(record?.contact?.email);
  if (!recipientEmail) {
    throw new Error("Business email is missing.");
  }

  const transporter = createEmailTransporter(config);
  await transporter.verify();

  const idCard = buildBusinessIdCardPayload(record);
  const subject = `Institution ID Card: ${record.name} (${record.id})`;
  const delivery = await transporter.sendMail({
    from: formatEmailFrom(config),
    replyTo: config.reply_to || undefined,
    to: recipientEmail,
    subject,
    text: [
      `Institution ID Card for ${record.name}`,
      `Business ID: ${idCard.business_id}`,
      `Institution Head: ${idCard.holder_name || "Not set"}${idCard.holder_role ? ` (${idCard.holder_role})` : ""}`,
      `Location: ${idCard.location || "Not set"}`,
      idCard.notes ? `Notes: ${idCard.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p>Institution ID card for <strong>${escapeHtmlText(record.name)}</strong>.</p>`,
      renderBusinessIdCardHtml(idCard),
    ].join(""),
  });

  const sentAt = new Date().toISOString();
  appendEmailLogEntry({
    id: generateId(),
    created_at: sentAt,
    subject,
    sent_count: 1,
    failed_count: 0,
    recipients: [
      {
        type: "business",
        slug: record.slug,
        recipient_name: record.name,
        email: recipientEmail,
        ok: true,
        message_id: delivery.messageId,
      },
    ],
  });

  return {
    email: recipientEmail,
    message_id: delivery.messageId,
    sent_at: sentAt,
  };
}

function addDaysUtc(date, dayCount) {
  return new Date(date.getTime() + dayCount * 86400000);
}

function filePathFor(dir, slug) {
  return path.join(dir, `${slug}.json`);
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

function safeStat(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function writeJson(filePath, value, spacing = 2) {
  const output = spacing == null ? JSON.stringify(value) : JSON.stringify(value, null, spacing);
  fs.writeFileSync(filePath, output);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function sanitizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function buildEnvConfigSnapshot() {
  return {
    admin: buildEnvTargetSnapshot("admin"),
    user: buildEnvTargetSnapshot("user"),
  };
}

function buildEnvTargetSnapshot(target) {
  const config = ENV_CONFIG_SCHEMA[target];
  if (!config) {
    throw new Error(`Unknown env target: ${target}`);
  }

  const fileValues = loadEnvFile(config.file_path);
  return {
    title: config.title,
    description: config.description,
    restart_note: config.restart_note,
    file_path: config.file_path,
    values: collectEnvTargetValues(target, fileValues),
    sections: config.sections.map((section) => ({
      title: section.title,
      description: section.description,
      fields: section.fields.map((field) => ({
        ...field,
        value: stringOrDefault(fileValues[field.key], ""),
      })),
    })),
  };
}

function collectEnvTargetValues(target, sourceValues = {}) {
  const config = ENV_CONFIG_SCHEMA[target];
  const values = {};
  for (const section of config.sections) {
    for (const field of section.fields) {
      values[field.key] = stringOrDefault(sourceValues[field.key], "");
    }
  }
  return values;
}

function saveEnvConfigSnapshot(payload) {
  const nextAdmin = Object.prototype.hasOwnProperty.call(payload, "admin")
    ? saveEnvTargetConfig("admin", payload.admin)
    : buildEnvTargetSnapshot("admin");
  const nextUser = Object.prototype.hasOwnProperty.call(payload, "user")
    ? saveEnvTargetConfig("user", payload.user)
    : buildEnvTargetSnapshot("user");

  return {
    admin: nextAdmin,
    user: nextUser,
  };
}

function saveEnvTargetConfig(target, nextValues) {
  const config = ENV_CONFIG_SCHEMA[target];
  if (!config) {
    throw new Error(`Unknown env target: ${target}`);
  }

  const currentValues = loadEnvFile(config.file_path);
  const allowedKeys = new Set(
    config.sections.flatMap((section) => section.fields.map((field) => field.key))
  );
  const mergedValues = { ...currentValues };

  for (const section of config.sections) {
    for (const field of section.fields) {
      mergedValues[field.key] = normalizeEnvString(nextValues?.[field.key]);
    }
  }

  writeEnvConfigFile(config.file_path, config, mergedValues, allowedKeys, currentValues);
  return buildEnvTargetSnapshot(target);
}

function writeEnvConfigFile(filePath, config, values, allowedKeys, currentValues) {
  const lines = [
    `# ${config.title}`,
    `# ${config.description}`,
    `# ${config.restart_note}`,
    "",
  ];

  for (const section of config.sections) {
    lines.push(`# ${section.title}`);
    if (section.description) {
      lines.push(`# ${section.description}`);
    }
    for (const field of section.fields) {
      if (field.example) {
        lines.push(`# Example: ${field.example}`);
      }
      if (field.description) {
        lines.push(`# ${field.description}`);
      }
      lines.push(`${field.key}=${stringOrDefault(values[field.key], "")}`);
      lines.push("");
    }
  }

  const extraEntries = Object.entries(currentValues || {})
    .filter(([key]) => !allowedKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  if (extraEntries.length) {
    lines.push("# Additional values");
    for (const [key, value] of extraEntries) {
      lines.push(`${key}=${stringOrDefault(value, "")}`);
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function normalizeEnvString(value) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(normalized);
}

function normalizeRoutePath(value, fallback = "/user") {
  const normalized = String(value || fallback || "/user")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash || "/user";
}

function normalizeRepoSubpath(value, fallback = "") {
  const raw = String(value || fallback || "").trim().replace(/\\/g, "/");
  const normalized = raw.replace(/^\.?\//, "").replace(/\/{2,}/g, "/");
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Invalid repo subpath "${raw}". Use a path inside the target repository.`);
  }

  return segments.join("/") || String(fallback || "").trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStringArray(value) {
  return ensureArray(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function sanitizeBusinessTags(value) {
  return cleanStringArray(value).filter(
    (tag) => String(tag || "").trim().toLowerCase() !== "featured-campus"
  );
}

function getDistrictCatalogRecord(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? DISTRICT_LOOKUP.get(normalized) || null : null;
}

function normalizeZone(value, fallbackDistrict = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (ZONE_NAMES[normalized]) {
    return normalized;
  }
  return getDistrictCatalogRecord(fallbackDistrict)?.zone_id || "";
}

function normalizeProvince(value) {
  const normalized = String(value || "").trim();
  if (PROVINCE_NAMES[normalized]) {
    return normalized;
  }
  return "";
}

function resolveProvinceFromDistrict(provinceValue, districtValue) {
  const normalized = normalizeProvince(provinceValue);
  if (normalized) {
    return normalized;
  }
  return String(getDistrictCatalogRecord(districtValue)?.province_id || "");
}

function resolveZoneFromDistrict(zoneValue, districtValue) {
  const normalized = normalizeZone(zoneValue, districtValue);
  if (normalized) {
    return normalized;
  }
  return String(getDistrictCatalogRecord(districtValue)?.zone_id || "");
}

function buildLocationLabels(record) {
  const district = stringOrDefault(record?.district);
  const zoneId = stringOrDefault(record?.zone).toLowerCase();
  const provinceId = stringOrDefault(record?.province);
  const zoneName = ZONE_NAMES[zoneId] || "";
  const provinceName = PROVINCE_NAMES[provinceId] || "";
  return {
    zone_name: zoneName,
    province_name: provinceName,
    location_label: [district, provinceName].filter(Boolean).join(", "),
    location_full_label: [district, zoneName, provinceName].filter(Boolean).join(", "),
  };
}

function buildLocationCatalogSnapshot() {
  return {
    provinces: PROVINCES,
    zones: ZONES,
    districts: DISTRICT_CATALOG,
    totals: {
      provinces: PROVINCES.length,
      zones: ZONES.length,
      districts: DISTRICT_CATALOG.length,
    },
  };
}

function sanitizeRegistrationSummary(record) {
  return {
    status: stringOrDefault(record?.status, "registered"),
    confirmation_email_enabled: normalizeBoolean(record?.confirmation_email_enabled, true),
    send_id_card_email: normalizeBoolean(record?.send_id_card_email, true),
    confirmation_email_sent_at: stringOrDefault(record?.confirmation_email_sent_at),
    confirmation_email_error: stringOrDefault(record?.confirmation_email_error),
    created_at: stringOrDefault(record?.created_at),
    updated_at: stringOrDefault(record?.updated_at),
  };
}

function buildRegistrationSummary(source, fallback, options = {}) {
  const normalized = sanitizeRegistrationSummary({
    ...(fallback || {}),
    ...(source || {}),
    confirmation_email_enabled:
      source && Object.prototype.hasOwnProperty.call(source, "send_confirmation_email")
        ? source.send_confirmation_email
        : fallback?.confirmation_email_enabled,
  });
  return {
    ...normalized,
    created_at: stringOrDefault(normalized.created_at, options.createdAt || ""),
    updated_at: stringOrDefault(options.updatedAt, normalized.updated_at),
  };
}

function sanitizeInstitutionHeadSummary(record) {
  return {
    name: stringOrDefault(record?.name),
    role: stringOrDefault(record?.role, "Institution Head"),
    email: stringOrDefault(record?.email),
    phone: stringOrDefault(record?.phone),
    notes: stringOrDefault(record?.notes),
  };
}

function buildInstitutionHeadSummary(source, fallback, contact) {
  const contactPhones = cleanStringArray(contact?.phone);
  return sanitizeInstitutionHeadSummary({
    ...(fallback || {}),
    ...(source || {}),
    email: source?.email ?? fallback?.email ?? contact?.email,
    phone: source?.phone ?? fallback?.phone ?? contactPhones[0],
  });
}

function sanitizeIdCardSummary(record, businessId = "") {
  const normalizedStatus = String(record?.status || "").trim().toLowerCase();
  const hasHolder = Boolean(record?.holder_name || record?.head_name);
  return {
    business_id: stringOrDefault(record?.business_id, businessId),
    title: stringOrDefault(record?.title, "Institution ID Card"),
    subtitle: stringOrDefault(record?.subtitle, "Business registration profile"),
    template: stringOrDefault(record?.template, "default"),
    holder_name: stringOrDefault(record?.holder_name),
    holder_role: stringOrDefault(record?.holder_role, "Institution Head"),
    photo_url: stringOrDefault(record?.photo_url),
    notes: stringOrDefault(record?.notes),
    status: ["draft", "complete"].includes(normalizedStatus)
      ? normalizedStatus
      : (businessId || record?.business_id) && hasHolder ? "complete" : "draft",
    generated_at: stringOrDefault(record?.generated_at),
    updated_at: stringOrDefault(record?.updated_at),
    last_sent_at: stringOrDefault(record?.last_sent_at),
  };
}

function buildIdCardSummary(source, fallback, options = {}) {
  const merged = sanitizeIdCardSummary(
    {
      ...(fallback || {}),
      ...(source || {}),
      business_id: options.businessId || source?.business_id || fallback?.business_id,
      holder_name:
        source?.holder_name ??
        source?.head_name ??
        fallback?.holder_name ??
        options.institutionHead?.name,
      holder_role:
        source?.holder_role ??
        source?.head_role ??
        fallback?.holder_role ??
        options.institutionHead?.role,
    },
    options.businessId
  );
  const holderName = stringOrDefault(merged.holder_name, options.institutionHead?.name);
  return {
    ...merged,
    business_id: stringOrDefault(options.businessId, merged.business_id),
    subtitle: stringOrDefault(
      merged.subtitle,
      options.businessName ? `${options.businessName} registration profile` : "Business registration profile"
    ),
    holder_name: holderName,
    holder_role: stringOrDefault(
      merged.holder_role,
      stringOrDefault(options.institutionHead?.role, "Institution Head")
    ),
    status: options.businessId && holderName ? "complete" : "draft",
    generated_at: stringOrDefault(merged.generated_at, options.createdAt || ""),
    updated_at: stringOrDefault(options.updatedAt, merged.updated_at),
  };
}

function generateBusinessRegistrationId() {
  const year = new Date().getUTCFullYear();
  const prefix = `EDU-${year}`;
  const usedIds = new Set(
    basicCards.map((card) => stringOrDefault(card.id)).filter(Boolean)
  );

  let sequence = 1;
  for (const id of usedIds) {
    const match = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`).exec(id);
    if (match) {
      sequence = Math.max(sequence, Number.parseInt(match[1], 10) + 1);
    }
  }

  let candidate = `${prefix}-${String(sequence).padStart(4, "0")}`;
  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}-${String(sequence).padStart(4, "0")}`;
  }
  return candidate;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeFloat(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeDateInput(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringOrDefault(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeRequestPath(value) {
  const normalized = String(value || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  if (!normalized) {
    return "/";
  }
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash === "/" ? "/" : withLeadingSlash.replace(/\/+$/, "");
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function restrictPrivateAdminSurface(req, res, next) {
  const requestPath = normalizeRequestPath(req.path);
  if (isPublicAdminRequestPath(requestPath)) {
    return next();
  }

  if (!canAccessPrivateAdmin(req)) {
    return denyPrivateAdminRequest(req, res, requestPath);
  }

  return next();
}

function canAccessPrivateAdmin(req) {
  return ALLOW_REMOTE_ADMIN_ACCESS || isLocalAdminRequest(req);
}

function isPublicAdminRequestPath(requestPath) {
  return isPublicApiRequestPath(requestPath) || isPublicUserRequestPath(requestPath);
}

function isPublicApiRequestPath(requestPath) {
  return (
    requestPath === "/api/public/list" ||
    requestPath === "/api/public/meta" ||
    requestPath.startsWith("/api/public/get/")
  );
}

function isPublicUserRequestPath(requestPath) {
  if (!HAS_USER_DIST) {
    return false;
  }
  return requestPath === USER_STATIC_ROUTE || requestPath.startsWith(`${USER_STATIC_ROUTE}/`);
}

function denyPrivateAdminRequest(req, res, requestPath = normalizeRequestPath(req.path)) {
  const message =
    "Admin access is restricted to local requests. Public user routes remain available.";

  if (req.method === "GET" && HAS_USER_DIST && (requestPath === "/" || requestPath === "/index.html")) {
    return res.redirect(USER_STATIC_ROUTE);
  }

  if (String(req.headers.accept || "").toLowerCase().includes("text/html")) {
    return res.status(403).type("text/plain").send(message);
  }

  return res.status(403).json({
    success: false,
    error: message,
  });
}

function isLocalAdminRequest(req) {
  const remoteAddress = String(req.socket?.remoteAddress || "").trim();
  return (
    remoteAddress === "::1" ||
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

function scheduleAdminShutdown(reason = "Shutdown requested.") {
  if (!adminServer || adminShutdownScheduled) {
    return;
  }

  adminShutdownScheduled = true;
  setTimeout(() => {
    console.log(reason);
    adminServer.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      for (const socket of adminSockets) {
        try {
          socket.destroy();
        } catch {}
      }
    }, 300);
  }, 120);
}

migrateLegacyPayments();

adminServer = app.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`EduData XP admin running at http://${displayHost}:${PORT}`);
  console.log(
    `Remote admin access: ${ALLOW_REMOTE_ADMIN_ACCESS ? "enabled" : "disabled (localhost only)"}`
  );
  console.log(`Basic card index: ${BASIC_INDEX_FILE}`);
  console.log(`Detailed data: ${DETAILED_DIR}`);
  console.log(`Expenses file: ${EXPENSES_FILE}`);
  if (HAS_USER_DIST) {
    console.log(`Public user route: http://${displayHost}:${PORT}${USER_STATIC_ROUTE}`);
  }
});

adminServer.on("connection", (socket) => {
  adminSockets.add(socket);
  socket.on("close", () => {
    adminSockets.delete(socket);
  });
});
