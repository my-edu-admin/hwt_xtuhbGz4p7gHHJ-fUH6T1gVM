const fs = require("fs");
const path = require("path");
const LOCATION_CATALOG = require("../config/location-catalog");
const { buildFlutterOutput } = require("./generator-flutter");
const { buildWebsitePages, buildWebsiteStyles } = require("./generator-website");
const {
  cleanStringArray,
  ensureArray,
  normalizeFloat,
  normalizeHexColor,
  normalizeInteger,
  normalizeUrl,
  readJson,
  sanitizePathSegment,
  sanitizeSlug,
  stringOrDefault,
  writeJson,
} = require("./generator-utils");

const LOCATION_ZONE_NAMES = Object.fromEntries(
  (Array.isArray(LOCATION_CATALOG?.zones) ? LOCATION_CATALOG.zones : []).map((zone) => [
    String(zone.id || "").trim().toLowerCase(),
    stringOrDefault(zone.name),
  ])
);
const LOCATION_PROVINCE_NAMES = Object.fromEntries(
  (Array.isArray(LOCATION_CATALOG?.provinces) ? LOCATION_CATALOG.provinces : []).map((province) => [
    String(province.id || "").trim(),
    stringOrDefault(province.name),
  ])
);

const WEBSITE_PAGE_FILES = [
  ["Home Page", "index.html"],
  ["Academics Page", "academics.html"],
  ["People Page", "people.html"],
  ["Media Page", "media.html"],
  ["Updates Page", "updates.html"],
  ["Admissions Page", "admissions.html"],
  ["Contact Page", "contact.html"],
];

function createGeneratorStudio(options = {}) {
  const userDataRoot = path.resolve(String(options.userDataRoot || ""));
  const userOutRoot = path.resolve(String(options.userOutRoot || ""));

  if (!userDataRoot || !userOutRoot) {
    throw new Error("Generator Studio requires userDataRoot and userOutRoot.");
  }

  fs.mkdirSync(userDataRoot, { recursive: true });
  fs.mkdirSync(userOutRoot, { recursive: true });

  return {
    loadBusinessStudio(businessRecord) {
      const business = normalizeBusinessRecord(businessRecord);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      const savedWebsite = readJson(paths.websiteFormPath, null);
      const savedApp = readJson(paths.appFormPath, null);
      const manifest = readJson(paths.manifestPath, null);
      const website = normalizeWebsiteData(savedWebsite || buildDefaultWebsiteData(business), business);
      const app = normalizeAppData(savedApp || buildDefaultAppData(business), business);

      return {
        business,
        website,
        app,
        saved_at: stringOrDefault(manifest?.saved_at),
        paths: describePaths(paths),
      };
    },

    getBusinessStatus(businessRecord) {
      const business = normalizeBusinessRecord(businessRecord);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      return {
        business,
        paths: describePaths(paths),
      };
    },

    saveBusinessStudio(businessRecord, payload) {
      const business = normalizeBusinessRecord(businessRecord);
      const studioData = normalizeStudioPayload(business, payload);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      persistStudioData(paths, business, studioData);
      return {
        business,
        website: studioData.website,
        app: studioData.app,
        saved_at: studioData.saved_at,
        paths: describePaths(paths),
      };
    },

    buildWebsite(businessRecord, payload) {
      const business = normalizeBusinessRecord(businessRecord);
      const studioData = normalizeStudioPayload(business, payload);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      persistStudioData(paths, business, studioData);
      buildWebsiteOutput(paths, business, studioData.website);
      return {
        business,
        website: studioData.website,
        app: studioData.app,
        saved_at: studioData.saved_at,
        paths: describePaths(paths),
      };
    },

    buildApp(businessRecord, payload) {
      const business = normalizeBusinessRecord(businessRecord);
      const studioData = normalizeStudioPayload(business, payload);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      persistStudioData(paths, business, studioData);
      const flutter = buildFlutterOutput(paths, business, studioData.app);
      return {
        business,
        website: studioData.website,
        app: studioData.app,
        saved_at: studioData.saved_at,
        paths: describePaths(paths),
        flutter,
      };
    },

    deleteTarget(businessRecord, target) {
      const business = normalizeBusinessRecord(businessRecord);
      const paths = resolveStudioPaths(userDataRoot, userOutRoot, business);
      deleteStudioTarget(paths, target);
      return {
        ...this.loadBusinessStudio(businessRecord),
        deleted_target: normalizeDeleteTarget(target),
      };
    },
  };
}

function normalizeStudioPayload(business, payload) {
  const source = payload || {};
  return {
    website: normalizeWebsiteData(source.website, business),
    app: normalizeAppData(source.app, business),
    saved_at: new Date().toISOString(),
  };
}

function normalizeBusinessRecord(record) {
  const source = record || {};
  const slug = sanitizeSlug(source.slug);
  const id = stringOrDefault(source.id, slug || "business");
  const name = stringOrDefault(source.name, slug || "Business");
  const zoneId = stringOrDefault(source.zone).toLowerCase();
  const provinceId = stringOrDefault(source.province);
  const zoneName = stringOrDefault(source.zone_name, LOCATION_ZONE_NAMES[zoneId]);
  const provinceName = stringOrDefault(source.province_name, LOCATION_PROVINCE_NAMES[provinceId]);
  const districtName = stringOrDefault(source.district);
  const derivedLocationLabel = [districtName, provinceName || zoneName].filter(Boolean).join(", ");

  if (!slug) {
    throw new Error("A valid business slug is required.");
  }

  return {
    id,
    slug,
    name,
    type: stringOrDefault(source.type),
    affiliation: stringOrDefault(source.affiliation),
    zone: stringOrDefault(source.zone),
    zone_name: zoneName,
    province_name: provinceName,
    location_label: stringOrDefault(source.location_label, stringOrDefault(source.location_full_label, derivedLocationLabel)),
    description: stringOrDefault(source.description),
    programs: cleanStringArray(source.programs),
    facilities: cleanStringArray(source.facilities),
    level: cleanStringArray(source.level),
    field: cleanStringArray(source.field),
    logo: stringOrDefault(source.logo || source.media?.logo),
    cover: stringOrDefault(source.cover || source.media?.cover),
    media: {
      gallery: cleanUrlArray(source.media?.gallery),
      videos: normalizeVideoList(source.media?.videos),
    },
    stats: {
      students: normalizeInteger(source.stats?.students),
      faculty: normalizeInteger(source.stats?.faculty),
      rating: normalizeFloat(source.stats?.rating),
    },
    contact: {
      address: stringOrDefault(source.contact?.address),
      phone: cleanStringArray(source.contact?.phone),
      email: stringOrDefault(source.contact?.email),
      website: normalizeUrl(source.contact?.website),
      map: {
        lat: normalizeFloat(source.contact?.map?.lat),
        lng: normalizeFloat(source.contact?.map?.lng),
      },
    },
    social: normalizeSocialLinks(source.social),
    updated_at: stringOrDefault(source.updated_at),
    created_at: stringOrDefault(source.created_at),
  };
}

function resolveStudioPaths(userDataRoot, userOutRoot, business) {
  const folderName = buildBusinessFolderName(business);
  const dataDir = path.join(userDataRoot, folderName);
  const outputDir = path.join(userOutRoot, folderName);
  return {
    folder_name: folderName,
    dataDir,
    outputDir,
    manifestPath: path.join(dataDir, "generator-manifest.json"),
    websiteFormPath: path.join(dataDir, "website-form.json"),
    appFormPath: path.join(dataDir, "app-form.json"),
    websiteDir: path.join(outputDir, "website"),
    websiteIndexPath: path.join(outputDir, "website", "index.html"),
    websiteStylesPath: path.join(outputDir, "website", "styles.css"),
    websiteDataSnapshotPath: path.join(outputDir, "website", "site-data.json"),
    flutterProjectDir: path.join(outputDir, "flutter_app"),
    flutterMainPath: path.join(outputDir, "flutter_app", "lib", "main.dart"),
    flutterManifestPath: path.join(outputDir, "flutter_app", "android", "app", "src", "main", "AndroidManifest.xml"),
    flutterPubspecPath: path.join(outputDir, "flutter_app", "pubspec.yaml"),
    apkDir: path.join(outputDir, "apk"),
    apkPath: path.join(outputDir, "apk", `${folderName}-release.apk`),
    apkLogPath: path.join(outputDir, "apk", "build.log"),
  };
}

function describePaths(paths) {
  const managedFiles = buildManagedFiles(paths);
  const generatedFiles = managedFiles.filter((item) => item.exists);
  const nonGeneratedFiles = managedFiles.filter((item) => !item.exists);

  return {
    folder_name: paths.folder_name,
    data_dir: paths.dataDir,
    output_dir: paths.outputDir,
    manifest_path: paths.manifestPath,
    website_form_path: paths.websiteFormPath,
    app_form_path: paths.appFormPath,
    website_dir: paths.websiteDir,
    website_index_path: paths.websiteIndexPath,
    flutter_project_dir: paths.flutterProjectDir,
    apk_dir: paths.apkDir,
    apk_path: paths.apkPath,
    managed_files: managedFiles,
    generated_files: generatedFiles,
    non_generated_files: nonGeneratedFiles,
    generated_count: generatedFiles.length,
    non_generated_count: nonGeneratedFiles.length,
    has_website_form: fs.existsSync(paths.websiteFormPath),
    has_app_form: fs.existsSync(paths.appFormPath),
    has_website: fs.existsSync(paths.websiteIndexPath),
    has_website_assets: fs.existsSync(paths.websiteStylesPath) && fs.existsSync(paths.websiteDataSnapshotPath),
    has_flutter_project: fs.existsSync(paths.flutterProjectDir),
    has_flutter_source: fs.existsSync(paths.flutterMainPath),
    has_apk: fs.existsSync(paths.apkPath),
  };
}

function buildManagedFiles(paths) {
  const websiteFiles = WEBSITE_PAGE_FILES.map(([label, filename]) => ({
    group: "Website Output",
    label,
    path: path.join(paths.websiteDir, filename),
  }));

  const items = [
    { group: "Studio Data", label: "Generator Manifest", path: paths.manifestPath },
    { group: "Studio Data", label: "Website Form JSON", path: paths.websiteFormPath },
    { group: "Studio Data", label: "App Form JSON", path: paths.appFormPath },
    ...websiteFiles,
    { group: "Website Output", label: "Website Stylesheet", path: paths.websiteStylesPath },
    { group: "Website Output", label: "Website Data Snapshot", path: paths.websiteDataSnapshotPath },
    { group: "App Output", label: "Flutter Main Source", path: paths.flutterMainPath },
    { group: "App Output", label: "Android Manifest", path: paths.flutterManifestPath },
    { group: "App Output", label: "Flutter Pubspec", path: paths.flutterPubspecPath },
    { group: "App Output", label: "APK Build Log", path: paths.apkLogPath },
    { group: "App Output", label: "Release APK", path: paths.apkPath },
  ];

  return items.map((item) => ({
    ...item,
    exists: fs.existsSync(item.path),
  }));
}

function normalizeDeleteTarget(target) {
  const normalized = stringOrDefault(target).trim().toLowerCase();
  if (!["website", "app", "all"].includes(normalized)) {
    throw new Error("Generator delete target must be website, app, or all.");
  }
  return normalized;
}

function deleteStudioTarget(paths, target) {
  const deleteTarget = normalizeDeleteTarget(target);

  if (deleteTarget === "website" || deleteTarget === "all") {
    removePath(paths.websiteFormPath);
    removePath(paths.websiteDir);
  }

  if (deleteTarget === "app" || deleteTarget === "all") {
    removePath(paths.appFormPath);
    removePath(paths.flutterProjectDir);
    removePath(paths.apkDir);
  }

  removePath(paths.manifestPath);
  removeIfEmpty(paths.dataDir);
  removeIfEmpty(paths.outputDir);
}

function removePath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

function removeIfEmpty(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  try {
    if (fs.statSync(targetPath).isDirectory() && fs.readdirSync(targetPath).length === 0) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup failures for optional generated folders.
  }
}

function persistStudioData(paths, business, studioData) {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.outputDir, { recursive: true });
  writeJson(paths.websiteFormPath, studioData.website);
  writeJson(paths.appFormPath, studioData.app);
  writeJson(paths.manifestPath, {
    version: 1,
    generated_by: "generator-studio",
    saved_at: studioData.saved_at,
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      folder_name: paths.folder_name,
      updated_at: business.updated_at,
      created_at: business.created_at,
    },
    files: describePaths(paths),
  });
}

function buildWebsiteOutput(paths, business, websiteData) {
  fs.mkdirSync(paths.websiteDir, { recursive: true });
  fs.writeFileSync(paths.websiteStylesPath, buildWebsiteStyles(websiteData), "utf8");
  const pages = buildWebsitePages(business, websiteData);
  for (const [filename, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(paths.websiteDir, filename), html, "utf8");
  }
  writeJson(paths.websiteDataSnapshotPath, {
    generated_at: new Date().toISOString(),
    business: { id: business.id, slug: business.slug, name: business.name },
    website: websiteData,
  });
}

function buildDefaultWebsiteData(business) {
  return {
    site_title: business.name,
    hero_kicker: [business.type, business.location_label].filter(Boolean).join(" · "),
    hero_title: business.name,
    hero_summary:
      business.description ||
      `${business.name} presents its learning culture, academic profile, staff, campus media, and public updates across a polished multi-page website.`,
    about_title: `Why ${business.name}`,
    about_body:
      business.description ||
      `${business.name} is designed as a focused learning space with clear communication, visible outcomes, and a strong support system for learners and families.`,
    principal_name: "",
    principal_role: "Academic Lead",
    principal_message: `Welcome to ${business.name}. Use this section to introduce the institute philosophy, learner promise, and the atmosphere you want parents and students to feel before visiting.`,
    admissions_title: "Admissions & Enrollment",
    admissions_body:
      "Explain the admission cycle, required documents, scholarship opportunities, interview flow, and any intake deadlines here.",
    cta_title: "Start The Conversation",
    cta_body:
      "Invite prospective families or learners to call, visit, message, or book an appointment with your admissions team.",
    primary_cta_label: "Call Admissions",
    primary_cta_url: business.contact.phone[0] ? `tel:${business.contact.phone[0]}` : "",
    secondary_cta_label: "Visit Website",
    secondary_cta_url: business.contact.website,
    theme_seed: chooseThemeSeed(business),
    logo_url: business.logo,
    cover_url: business.cover,
    gallery: business.media.gallery,
    videos: business.media.videos,
    playlists: [],
    programs: business.programs.length ? business.programs : business.field,
    facilities: business.facilities,
    achievements: buildDefaultAchievements(business),
    staff: [],
    testimonials: [],
    faqs: [],
    extra_sections: [],
    contact: {
      address: business.contact.address,
      phone: business.contact.phone[0] || "",
      email: business.contact.email,
      website: business.contact.website,
      map_url: buildMapUrl(business),
    },
    social: business.social,
  };
}

function buildDefaultAppData(business) {
  return {
    app_name: business.name,
    app_tagline: [business.type, business.location_label].filter(Boolean).join(" · "),
    intro_title: `Inside ${business.name}`,
    intro_body:
      business.description ||
      `${business.name} is presented here as a complete institute profile with multiple app screens for overview, academics, people, media, and public updates.`,
    director_name: "",
    director_role: "Academic Lead",
    director_message: `Use this message to introduce the institute, your academic direction, and the learner experience you want to present inside the app.`,
    admissions_note:
      "Add enrollment rules, deadlines, seat limits, fee guidance, and the next step a student should take.",
    contact_headline: "Reach The Institute",
    theme_seed: chooseThemeSeed(business),
    logo_url: business.logo,
    hero_image_url: business.cover || business.media.gallery[0] || "",
    gallery: business.media.gallery,
    videos: business.media.videos,
    programs: business.programs.length ? business.programs : business.field,
    facilities: business.facilities,
    highlights: buildDefaultHighlights(business),
    quick_facts: buildDefaultQuickFacts(business),
    notices: [],
    staff: [],
    contact: {
      address: business.contact.address,
      phone: business.contact.phone[0] || "",
      email: business.contact.email,
      website: business.contact.website,
    },
    social: business.social,
  };
}

function normalizeWebsiteData(input, business) {
  const source = input || {};
  return {
    site_title: stringOrDefault(source.site_title, business.name),
    hero_kicker: stringOrDefault(source.hero_kicker),
    hero_title: stringOrDefault(source.hero_title, business.name),
    hero_summary: stringOrDefault(source.hero_summary, business.description),
    about_title: stringOrDefault(source.about_title, `Why ${business.name}`),
    about_body: stringOrDefault(source.about_body, business.description),
    principal_name: stringOrDefault(source.principal_name),
    principal_role: stringOrDefault(source.principal_role, "Academic Lead"),
    principal_message: stringOrDefault(source.principal_message),
    admissions_title: stringOrDefault(source.admissions_title, "Admissions & Enrollment"),
    admissions_body: stringOrDefault(source.admissions_body),
    cta_title: stringOrDefault(source.cta_title, "Start The Conversation"),
    cta_body: stringOrDefault(source.cta_body),
    primary_cta_label: stringOrDefault(source.primary_cta_label, "Contact Institute"),
    primary_cta_url: normalizeUrl(source.primary_cta_url),
    secondary_cta_label: stringOrDefault(source.secondary_cta_label, "Learn More"),
    secondary_cta_url: normalizeUrl(source.secondary_cta_url),
    theme_seed: normalizeHexColor(source.theme_seed, chooseThemeSeed(business)),
    logo_url: normalizeUrl(source.logo_url || business.logo),
    cover_url: normalizeUrl(source.cover_url || business.cover),
    gallery: source.gallery === undefined ? business.media.gallery : cleanUrlArray(source.gallery),
    videos: source.videos === undefined ? business.media.videos : normalizeVideoList(source.videos),
    playlists: normalizePlaylistList(source.playlists),
    programs: source.programs === undefined ? (business.programs.length ? business.programs : business.field) : cleanStringArray(source.programs),
    facilities: source.facilities === undefined ? business.facilities : cleanStringArray(source.facilities),
    achievements: source.achievements === undefined ? buildDefaultAchievements(business) : normalizeMetricList(source.achievements),
    staff: normalizeStaffList(source.staff),
    testimonials: normalizeTestimonials(source.testimonials),
    faqs: normalizeFaqList(source.faqs),
    extra_sections: normalizeTextBlockList(source.extra_sections),
    contact: {
      address: stringOrDefault(source.contact?.address, business.contact.address),
      phone: stringOrDefault(source.contact?.phone, business.contact.phone[0]),
      email: stringOrDefault(source.contact?.email, business.contact.email),
      website: normalizeUrl(source.contact?.website || business.contact.website),
      map_url: normalizeUrl(source.contact?.map_url || buildMapUrl(business)),
    },
    social: normalizeSocialLinks(source.social || business.social),
  };
}

function normalizeAppData(input, business) {
  const source = input || {};
  return {
    app_name: stringOrDefault(source.app_name, business.name),
    app_tagline: stringOrDefault(source.app_tagline),
    intro_title: stringOrDefault(source.intro_title, `Inside ${business.name}`),
    intro_body: stringOrDefault(source.intro_body, business.description),
    director_name: stringOrDefault(source.director_name),
    director_role: stringOrDefault(source.director_role, "Academic Lead"),
    director_message: stringOrDefault(source.director_message),
    admissions_note: stringOrDefault(source.admissions_note),
    contact_headline: stringOrDefault(source.contact_headline, "Reach The Institute"),
    theme_seed: normalizeHexColor(source.theme_seed, chooseThemeSeed(business)),
    logo_url: normalizeUrl(source.logo_url || business.logo),
    hero_image_url: normalizeUrl(source.hero_image_url || business.cover),
    gallery: source.gallery === undefined ? business.media.gallery : cleanUrlArray(source.gallery),
    videos: source.videos === undefined ? business.media.videos : normalizeVideoList(source.videos),
    playlists: normalizePlaylistList(source.playlists),
    programs: source.programs === undefined ? (business.programs.length ? business.programs : business.field) : cleanStringArray(source.programs),
    facilities: source.facilities === undefined ? business.facilities : cleanStringArray(source.facilities),
    highlights: source.highlights === undefined ? buildDefaultHighlights(business) : normalizeTextBlockList(source.highlights),
    quick_facts: source.quick_facts === undefined ? buildDefaultQuickFacts(business) : normalizeMetricList(source.quick_facts),
    notices: cleanStringArray(source.notices),
    staff: normalizeStaffList(source.staff),
    contact: {
      address: stringOrDefault(source.contact?.address, business.contact.address),
      phone: stringOrDefault(source.contact?.phone, business.contact.phone[0]),
      email: stringOrDefault(source.contact?.email, business.contact.email),
      website: normalizeUrl(source.contact?.website || business.contact.website),
    },
    social: normalizeSocialLinks(source.social || business.social),
  };
}

function normalizeVideoList(input) {
  return ensureArray(input)
    .map((item) => {
      if (typeof item === "string") {
        const parts = item.split("|").map((value) => String(value || "").trim());
        return {
          title: stringOrDefault(parts[1] ? parts[0] : "", "Campus Video"),
          url: normalizeUrl(parts[1] || parts[0]),
        };
      }
      return {
        title: stringOrDefault(item?.title, "Campus Video"),
        url: normalizeUrl(item?.url),
      };
    })
    .filter((item) => item.url);
}

function normalizeStaffList(input) {
  return ensureArray(input)
    .map((item) => ({
      name: stringOrDefault(item?.name),
      role: stringOrDefault(item?.role),
      image: normalizeUrl(item?.image),
      bio: stringOrDefault(item?.bio),
    }))
    .filter((item) => item.name || item.role || item.image || item.bio);
}

function normalizePlaylistList(input) {
  return ensureArray(input)
    .map((item) => ({
      title: stringOrDefault(item?.title),
      url: normalizeUrl(item?.url),
      description: stringOrDefault(item?.description),
    }))
    .filter((item) => item.title || item.url || item.description);
}

function normalizeTestimonials(input) {
  return ensureArray(input)
    .map((item) => ({
      name: stringOrDefault(item?.name),
      role: stringOrDefault(item?.role),
      quote: stringOrDefault(item?.quote),
    }))
    .filter((item) => item.name || item.role || item.quote);
}

function normalizeFaqList(input) {
  return ensureArray(input)
    .map((item) => ({
      question: stringOrDefault(item?.question),
      answer: stringOrDefault(item?.answer),
    }))
    .filter((item) => item.question || item.answer);
}

function normalizeMetricList(input) {
  return ensureArray(input)
    .map((item) => ({
      value: stringOrDefault(item?.value),
      label: stringOrDefault(item?.label),
    }))
    .filter((item) => item.value || item.label);
}

function normalizeTextBlockList(input) {
  return ensureArray(input)
    .map((item) => ({
      title: stringOrDefault(item?.title),
      body: stringOrDefault(item?.body),
    }))
    .filter((item) => item.title || item.body);
}

function normalizeSocialLinks(input) {
  const source = input || {};
  return {
    facebook: normalizeUrl(source.facebook),
    instagram: normalizeUrl(source.instagram),
    youtube: normalizeUrl(source.youtube),
    twitter: normalizeUrl(source.twitter),
  };
}

function buildDefaultAchievements(business) {
  const items = [];
  if (business.stats.students) items.push({ value: String(business.stats.students), label: "Learners" });
  if (business.stats.faculty) items.push({ value: String(business.stats.faculty), label: "Staff Members" });
  if (business.stats.rating) items.push({ value: String(business.stats.rating), label: "Profile Rating" });
  if (business.programs.length) items.push({ value: String(business.programs.length), label: "Programs" });
  return items.slice(0, 4);
}

function buildDefaultHighlights(business) {
  const items = [];
  if (business.type) items.push({ title: "Institute Type", body: business.type });
  if (business.affiliation) items.push({ title: "Affiliation", body: business.affiliation });
  if (business.location_label) items.push({ title: "Location", body: business.location_label });
  if (business.level.length) items.push({ title: "Learning Levels", body: business.level.join(", ") });
  return items;
}

function buildDefaultQuickFacts(business) {
  const items = [];
  if (business.location_label) items.push({ value: business.location_label, label: "Location" });
  if (business.programs.length) items.push({ value: String(business.programs.length), label: "Programs" });
  if (business.stats.students) items.push({ value: String(business.stats.students), label: "Learners" });
  if (business.stats.faculty) items.push({ value: String(business.stats.faculty), label: "Staff" });
  return items;
}

function buildMapUrl(business) {
  const { lat, lng } = business.contact.map;
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const query = [business.name, business.contact.address, business.location_label].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function chooseThemeSeed(business) {
  const type = String(business.type || "").toLowerCase();
  if (type.includes("university")) return "#214f7a";
  if (type.includes("college")) return "#7e5a2d";
  if (type.includes("training")) return "#16605a";
  if (type.includes("school")) return "#355da8";
  return "#4b5563";
}

function buildBusinessFolderName(business) {
  const safeName = sanitizePathSegment(business.name || business.slug || "business");
  const safeId = sanitizePathSegment(business.id || business.slug || "record");
  return `${safeName}-${safeId}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function cleanUrlArray(value) {
  return ensureArray(value)
    .map((item) => normalizeUrl(item))
    .filter(Boolean);
}

module.exports = {
  createGeneratorStudio,
};
