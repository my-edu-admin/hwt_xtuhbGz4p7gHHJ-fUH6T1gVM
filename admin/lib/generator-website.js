const {
  cleanStringArray,
  ensureArray,
  isMeaningfulText,
  meaningfulStringOrDefault,
  normalizeHexColor,
  normalizeUrl,
  stringOrDefault,
} = require("./generator-utils");

const PAGE_DEFINITIONS = [
  { file: "index.html", key: "home", label: "Home" },
  { file: "academics.html", key: "academics", label: "Academics" },
  { file: "people.html", key: "people", label: "People" },
  { file: "media.html", key: "media", label: "Media" },
  { file: "updates.html", key: "updates", label: "Updates" },
  { file: "admissions.html", key: "admissions", label: "Admissions" },
  { file: "contact.html", key: "contact", label: "Contact" },
];

function buildWebsitePages(business, websiteData) {
  const site = createSiteContext(business, websiteData);
  return {
    "index.html": buildPage(
      site,
      "home",
      `${site.siteTitle} | ${business.name}`,
      site.heroSummary,
      "Overview",
      site.heroTitle,
      site.heroSummary,
      site.heroMeta,
      {
        title: "Institute at a glance",
        copy: "Admissions, academics, people, media, and direct contact routes stay reachable from the first screen.",
      },
      [
        renderStatsSection(site),
        renderAboutSection(site),
        renderPageDirectorySection(),
        renderHighlightsSection(site),
        renderExtraSections(site),
        renderClosingCtaSection(site),
      ].join(""),
    ),
    "academics.html": buildPage(
      site,
      "academics",
      `Academics and campus overview | ${business.name}`,
      "Programs, facilities, and measurable strengths presented in a structure parents and students can evaluate quickly.",
      "Academics",
      "Academic pathways and learning environment",
      "Programs, facilities, and measurable strengths presented in a structure parents and students can evaluate quickly.",
      [site.heroMeta[0], countLabel(site.programs.length || 0, "program"), countLabel(site.facilities.length || 0, "facility", "facilities")],
      {
        title: "Study environment",
        copy: "Academic structure, infrastructure, and outcomes arranged in a direct, readable layout.",
      },
      [
        renderProgramFacilitySection(site),
        renderAchievementsSection(site, "Performance Snapshot"),
        renderExtraSections(site),
        renderClosingCtaSection(site),
      ].join(""),
    ),
    "people.html": buildPage(
      site,
      "people",
      `Leadership, staff, and community | ${business.name}`,
      "Leadership, staff, and public trust signals presented with compact profiles instead of oversized cards.",
      "People",
      "Leadership, staff, and community",
      "Leadership, staff, and public trust signals presented with compact profiles instead of oversized cards.",
      [site.heroMeta[0], countLabel(site.staff.length, "staff profile")],
      {
        title: "Human side of the institute",
        copy: "Leadership is presented first, with the working team shown in smaller profile cards underneath.",
      },
      [renderLeadershipSection(site), renderStaffSection(site), renderTestimonialsSection(site)].join(""),
    ),
    "media.html": buildPage(
      site,
      "media",
      `Gallery, logo, and video stories | ${business.name}`,
      "Visual storytelling with the institute logo, gallery, and playable video embeds in one page.",
      "Media",
      "Gallery, logo, and video stories",
      "Visual storytelling with the institute logo, gallery, and playable video embeds in one page.",
      [site.heroMeta[0], countLabel(site.gallery.length, "gallery asset"), countLabel(site.videos.length, "video")],
      {
        title: "Visual storytelling",
        copy: "The logo, gallery, and video channel are arranged together so the institute identity reads clearly on every screen.",
      },
      [renderLogoSection(site), renderGallerySection(site), renderVideoSection(site)].join(""),
    ),
    "updates.html": buildPage(
      site,
      "updates",
      `Official updates and channels | ${business.name}`,
      "Direct visitors toward the institute channels that already carry public updates and announcements.",
      "Updates",
      "Official updates and channels",
      "Direct visitors toward the institute channels that already carry public updates and announcements.",
      [site.heroMeta[0], countLabel(site.socialLinks.filter((item) => item.url).length, "live link")],
      {
        title: "Public presence",
        copy: "Live links, missing channels, and direct response actions are grouped into one clean bulletin view.",
      },
      [renderSocialSection(site), renderExtraSections(site), renderClosingCtaSection(site)].join(""),
    ),
    "admissions.html": buildPage(
      site,
      "admissions",
      `Admissions and enrollment | ${business.name}`,
      "Entry process, documents, and next actions laid out without burying the contact options.",
      "Admissions",
      site.admissionsTitle,
      site.admissionsBody,
      [site.heroMeta[0], site.primaryAction.label],
      {
        title: "Enrollment guidance",
        copy: "Contact actions stay visible at the top and at the bottom so the page remains useful on mobile.",
      },
      [renderAdmissionsSection(site), renderFaqSection(site), renderClosingCtaSection(site)].join(""),
    ),
    "contact.html": buildPage(
      site,
      "contact",
      `Contact and location | ${business.name}`,
      "Every primary contact route, public link, and map handoff gathered in one place.",
      "Contact",
      "Contact, location, and quick actions",
      "Every primary contact route, public link, and map handoff gathered in one place.",
      [site.heroMeta[0], site.contact.phone || site.contact.email || "Contact ready"],
      {
        title: "Reach the institute",
        copy: "Call, email, open the map, or continue to the institute website from one page.",
      },
      [renderContactSection(site), renderSocialSection(site)].join(""),
    ),
  };
}

function buildWebsiteStyles(websiteData) {
  const seed = normalizeHexColor(websiteData?.theme_seed, "#355da8");
  const seedRgb = hexToRgb(seed);
  return buildStylesheet(seed, seedRgb);
}

function createSiteContext(business, websiteData) {
  websiteData = websiteData || {};
  const programs = cleanStringArray(websiteData.programs);
  const facilities = cleanStringArray(websiteData.facilities);
  const siteTitle = stringOrDefault(websiteData.site_title, business.name);
  const heroKicker = stringOrDefault(
    websiteData.hero_kicker,
    [business.type, business.location_label].filter(Boolean).join(" · ")
  );
  const heroTitle = stringOrDefault(websiteData.hero_title, business.name);
  const heroSummary = meaningfulStringOrDefault(
    websiteData.hero_summary,
    buildHeroSummaryFallback(business, programs, facilities),
    { minLength: 8 }
  );
  const coverUrl = normalizeUrl(websiteData.cover_url || websiteData.gallery?.[0] || websiteData.logo_url || "");
  const gallery = ensureArray(websiteData.gallery).map((item) => normalizeUrl(item)).filter(Boolean);
  const videos = normalizeVideos(websiteData.videos);
  const socialLinks = buildSocialLinks(websiteData);
  const leadership = resolveLeadership(websiteData, business);
  const staff = filterStaffForGrid(websiteData.staff, leadership);
  const primaryAction = resolvePrimaryAction(websiteData);
  const secondaryAction = resolveSecondaryAction(websiteData);
  const heroMeta = [
    heroKicker,
    business.affiliation,
    programs.length ? countLabel(programs.length, "program") : "",
    facilities.length ? countLabel(facilities.length, "facility", "facilities") : "",
  ].filter(Boolean);

  return {
    business,
    siteTitle,
    heroKicker,
    heroTitle,
    heroSummary,
    aboutTitle: stringOrDefault(websiteData.about_title, `Why ${business.name}`),
    aboutBody: meaningfulStringOrDefault(
      websiteData.about_body,
      buildAboutBodyFallback(business, programs, facilities, heroSummary),
      { minLength: 8 }
    ),
    admissionsTitle: stringOrDefault(websiteData.admissions_title, "Admissions & Enrollment"),
    admissionsBody: meaningfulStringOrDefault(
      websiteData.admissions_body,
      buildAdmissionsBodyFallback(),
      { minLength: 8 }
    ),
    ctaTitle: stringOrDefault(websiteData.cta_title, "Start The Conversation"),
    ctaBody: meaningfulStringOrDefault(websiteData.cta_body, buildCtaBodyFallback(business), {
      minLength: 8,
    }),
    primaryAction,
    secondaryAction,
    headerActions: [primaryAction, secondaryAction].filter(Boolean),
    logoUrl: normalizeUrl(websiteData.logo_url),
    coverUrl,
    gallery,
    videos,
    programs,
    facilities,
    achievements: ensureArray(websiteData.achievements).filter((item) => item?.value || item?.label),
    staff,
    testimonials: ensureArray(websiteData.testimonials).filter((item) => item?.name || item?.quote),
    faqs: ensureArray(websiteData.faqs).filter((item) => item?.question || item?.answer),
    extraSections: ensureArray(websiteData.extra_sections).filter((item) => item?.title || item?.body),
    contact: {
      address: stringOrDefault(websiteData.contact?.address),
      phone: stringOrDefault(websiteData.contact?.phone),
      email: stringOrDefault(websiteData.contact?.email),
      website: normalizeUrl(websiteData.contact?.website),
      mapUrl: normalizeUrl(websiteData.contact?.map_url),
    },
    socialLinks,
    leadership,
    heroMeta,
  };
}

function buildHeroSummaryFallback(business, programs, facilities) {
  const programText = programs.length
    ? countLabel(programs.length, "program")
    : "a clear academic profile";
  const facilityText = facilities.length
    ? `${countLabel(facilities.length, "facility", "facilities")} visible on the campus profile`
    : "a guided campus overview";
  const locationText = business.location_label ? ` in ${business.location_label}` : "";

  return `${business.name} presents ${programText}, ${facilityText}, and direct contact routes${locationText} so families and learners can evaluate the institute quickly.`;
}

function buildAboutBodyFallback(business, programs, facilities, heroSummary) {
  const facilityLead = facilities.length
    ? `Facilities such as ${facilities.slice(0, 3).join(", ")}`
    : `${business.name} is designed as a focused learning space`;
  const programLead = programs.length
    ? `while ${programs.slice(0, 2).join(" and ")} stay easy to scan`
    : "with academic information kept easy to scan";
  const summaryTail = meaningfulStringOrDefault(heroSummary, "", { minLength: 8 });

  return `${facilityLead} stay visible, ${programLead}, and parents can move from overview to action without friction.${summaryTail ? ` ${summaryTail}` : ""}`;
}

function buildLeadershipMessageFallback(business) {
  return `Welcome to ${business.name}. Use this section to explain the institute philosophy, learner promise, and the experience you want families to understand before visiting.`;
}

function buildAdmissionsBodyFallback() {
  return "Explain the admission cycle, required documents, scholarship opportunities, interview flow, seat availability, and any intake deadlines here.";
}

function buildCtaBodyFallback(business) {
  return `Invite prospective families or learners to call, visit, message, or open the public website for ${business.name} from one clear action area.`;
}

function buildStaffBioFallback(staff, business) {
  const roleText = stringOrDefault(staff.role);
  if (roleText) {
    return `${stringOrDefault(staff.name, "This staff member")} serves as ${roleText} at ${business.name}.`;
  }
  return `${stringOrDefault(staff.name, "This staff member")} supports the daily learning experience at ${business.name}.`;
}

function countLabel(value, singular, plural = `${singular}s`) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildPage(
  site,
  pageKey,
  title,
  description,
  heroEyebrow,
  heroTitle,
  heroSummary,
  heroMeta,
  heroOverlay,
  bodyMarkup
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="site-shell">
    ${renderHeader(site, pageKey)}
    ${renderHero(site, heroEyebrow, heroTitle, heroSummary, heroMeta, heroOverlay)}
    <main class="page-main">
      ${bodyMarkup}
    </main>
    ${renderFooter(site)}
  </div>
</body>
</html>`;
}

function renderHeader(site, pageKey) {
  const desktopLinks = renderNavLinks(pageKey, "nav-links");
  const mobileLinks = renderNavLinks(pageKey, "nav-links nav-links-mobile");
  const actions = renderHeaderActions(site.headerActions);

  return `
    <header class="site-header">
      <nav class="site-nav">
        <div class="site-nav-top">
          <a class="brand" href="./index.html">
            ${renderBrandMark(site.logoUrl, site.business.name, "brand-logo", "brand-logo-fallback")}
            <div class="brand-copy">
              <strong>${escapeHtml(site.business.name)}</strong>
              <span>${escapeHtml(site.heroKicker)}</span>
            </div>
          </a>
          ${actions}
          <details class="nav-menu">
            <summary class="nav-toggle">Menu</summary>
            <div class="nav-sheet">
              <div class="nav-sheet-header">
                <strong>${escapeHtml(site.business.name)}</strong>
                <span class="muted">${escapeHtml(site.heroKicker)}</span>
              </div>
              ${mobileLinks}
              <div class="nav-sheet-actions">
                ${renderActionButtons(site.headerActions, "nav-cta")}
              </div>
            </div>
          </details>
        </div>
        <div class="nav-desktop">
          ${desktopLinks}
        </div>
      </nav>
    </header>
  `;
}

function renderHero(site, eyebrow, title, summary, meta, overlay) {
  return `
    <section class="page-hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(summary)}</p>
        <div class="hero-actions">
          ${renderActionButtons(site.headerActions, "cta")}
        </div>
        <div class="hero-meta">
          ${ensureArray(meta)
            .filter(Boolean)
            .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
            .join("")}
        </div>
      </div>
      ${renderHeroMedia(site, overlay)}
    </section>
  `;
}

function renderHeroMedia(site, overlay) {
  return `
    <div class="hero-media">
      ${
        site.coverUrl
          ? `<img src="${escapeHtml(site.coverUrl)}" alt="${escapeHtml(site.business.name)} cover">`
          : `<div class="page-media-fallback">${escapeHtml(makeInitials(site.business.name))}</div>`
      }
      <div class="hero-overlay">
        <strong>${escapeHtml(overlay.title)}</strong>
        <span>${escapeHtml(overlay.copy)}</span>
      </div>
    </div>
  `;
}

function renderFooter(site) {
  return `
    <footer class="footer">
      <div class="footer-brand">
        <strong>${escapeHtml(site.business.name)}</strong>
        <span>${escapeHtml(site.contact.address || site.business.location_label || site.heroKicker)}</span>
      </div>
      <div class="footer-actions">
        ${renderActionButtons(site.headerActions, "cta")}
      </div>
    </footer>
  `;
}

function renderStatsSection(site) {
  if (!site.achievements.length) {
    return "";
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Quick View</p>
        <h2>Facts that land fast</h2>
      </div>
      <div class="stats-grid">
        ${site.achievements
          .map(
            (item) => `
              <article class="stat-card">
                <strong>${escapeHtml(item.value || "")}</strong>
                <div class="panel-copy">${escapeHtml(item.label || "Metric")}</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAboutSection(site) {
  return `
    <section class="section-shell section-split">
      <div class="section-head">
        <p class="eyebrow">Overview</p>
        <h2>${escapeHtml(site.aboutTitle)}</h2>
      </div>
      <div class="section-copy">
        <p>${escapeHtml(site.aboutBody)}</p>
        ${renderLeadershipCard(site.leadership)}
      </div>
    </section>
  `;
}

function renderPageDirectorySection() {
  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Explore</p>
        <h2>Navigate the complete institute story</h2>
      </div>
      <div class="link-grid">
        ${[
          {
            file: "./academics.html",
            badge: "Programs",
            title: "Academic pathways and learning environment",
            copy: "Programs, facilities, outcomes, and the academic promise in one page.",
          },
          {
            file: "./people.html",
            badge: "Team",
            title: "Leadership, faculty, and community voice",
            copy: "Leadership first, then a compact staff layout and testimonial section.",
          },
          {
            file: "./media.html",
            badge: "Media",
            title: "Gallery, logo, and video stories",
            copy: "Visual identity, campus imagery, and playable videos in a dedicated page.",
          },
          {
            file: "./updates.html",
            badge: "Updates",
            title: "Official social presence and current activity",
            copy: "Point visitors toward the institute channels already carrying public updates.",
          },
        ]
          .map(
            (item) => `
              <a class="page-link-card" href="${item.file}">
                <span class="inline-badge">${escapeHtml(item.badge)}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.copy)}</p>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHighlightsSection(site) {
  const panels = [
    {
      badge: "Admissions",
      copy: site.admissionsBody || "Add admissions guidance to explain the intake flow, documents, and deadlines.",
    },
    {
      badge: "Facilities",
      copy: site.facilities.length ? site.facilities.join(", ") : "List labs, library, transport, sports, or campus resources here.",
    },
    {
      badge: "Programs",
      copy: site.programs.length ? site.programs.join(", ") : "Programs will appear here once they are added in Generator Studio.",
    },
  ];

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Highlights</p>
        <h2>Why families move closer</h2>
      </div>
      <div class="panel-grid">
        ${panels
          .map(
            (panel) => `
              <article class="feature-panel">
                <span class="inline-badge">${escapeHtml(panel.badge)}</span>
                <div class="panel-copy">${escapeHtml(panel.copy)}</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAchievementsSection(site, heading) {
  if (!site.achievements.length) {
    return "";
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Strengths</p>
        <h2>${escapeHtml(heading)}</h2>
      </div>
      <div class="stats-grid">
        ${site.achievements
          .map(
            (item) => `
              <article class="stat-card">
                <strong>${escapeHtml(item.value || "")}</strong>
                <div class="panel-copy">${escapeHtml(item.label || "Metric")}</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProgramFacilitySection(site) {
  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Academics</p>
        <h2>Programs and facilities</h2>
      </div>
      <div class="panel-grid">
        <article class="feature-panel">
          <span class="inline-badge">Programs</span>
          ${
            site.programs.length
              ? `<ul class="feature-list">${site.programs
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}</ul>`
              : `<div class="empty-panel">Add programs in Generator Studio to populate this section.</div>`
          }
        </article>
        <article class="feature-panel">
          <span class="inline-badge">Facilities</span>
          ${
            site.facilities.length
              ? `<ul class="feature-list">${site.facilities
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}</ul>`
              : `<div class="empty-panel">Add facilities in Generator Studio to populate this section.</div>`
          }
        </article>
      </div>
    </section>
  `;
}

function renderLeadershipSection(site) {
  return `
    <section class="section-shell section-split">
      <div class="section-head">
        <p class="eyebrow">Leadership</p>
        <h2>Institutional voice and direction</h2>
      </div>
      <div class="section-copy">
        ${renderLeadershipCard(site.leadership)}
      </div>
    </section>
  `;
}

function renderLeadershipCard(leadership) {
  return `
    <div class="feature-panel leadership-card">
      <div class="leadership-visual">
        ${
          leadership.image
            ? `<img class="leadership-avatar" src="${escapeHtml(leadership.image)}" alt="${escapeHtml(leadership.name)}">`
            : `<div class="leadership-avatar-fallback">${escapeHtml(makeFallbackLabel(leadership.name, "Leadership"))}</div>`
        }
        <span class="inline-badge">Leadership</span>
      </div>
      <div class="leadership-text">
        <div>
          <strong>${escapeHtml(leadership.name)}</strong>
          <div class="meta-line">${escapeHtml(leadership.role)}</div>
        </div>
        <div class="panel-copy">${escapeHtml(leadership.message)}</div>
      </div>
    </div>
  `;
}

function renderStaffSection(site) {
  if (!site.staff.length) {
    return `
      <section class="section-shell">
        <div class="section-head">
          <p class="eyebrow">Staff</p>
          <h2>Meet the people behind the institute</h2>
        </div>
        <div class="empty-panel">Add staff profiles in Generator Studio to generate compact staff cards here.</div>
      </section>
    `;
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Staff</p>
        <h2>Meet the people behind the institute</h2>
      </div>
      <div class="staff-grid">
        ${site.staff
          .map(
            (staff) => `
              <article class="staff-card">
                ${
                  staff.image
                    ? `<img class="staff-avatar" src="${escapeHtml(staff.image)}" alt="${escapeHtml(staff.name || "Staff member")}">`
                    : `<div class="staff-avatar-fallback">${escapeHtml(makeFallbackLabel(staff.name, "Staff"))}</div>`
                }
                <div class="staff-body">
                  <div>
                    <h3>${escapeHtml(staff.name || "Staff Member")}</h3>
                    <span class="staff-role">${escapeHtml(staff.role || "Role not set")}</span>
                  </div>
                  <div class="panel-copy">${escapeHtml(isMeaningfulText(staff.bio, { minLength: 8 }) ? staff.bio : buildStaffBioFallback(staff, site.business))}</div>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTestimonialsSection(site) {
  if (!site.testimonials.length) {
    return `
      <section class="section-shell">
        <div class="section-head">
          <p class="eyebrow">Testimonials</p>
          <h2>Community voice</h2>
        </div>
        <div class="empty-panel">Add testimonials in Generator Studio to show the institute through the voice of students, parents, or alumni.</div>
      </section>
    `;
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Testimonials</p>
        <h2>Community voice</h2>
      </div>
      <div class="quote-grid">
        ${site.testimonials
          .map(
            (item) => `
              <article class="quote-card">
                <span class="inline-badge">${escapeHtml(item.role || "Testimonial")}</span>
                <p>${escapeHtml(item.quote || "")}</p>
                <strong>${escapeHtml(item.name || "Community voice")}</strong>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLogoSection(site) {
  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Identity</p>
        <h2>Logo and brand mark</h2>
      </div>
      <div class="logo-mark-card">
        ${renderBrandMark(site.logoUrl, site.business.name, "logo-mark", "logo-mark-fallback")}
        <div class="contact-copy">
          <span class="inline-badge">Logo</span>
          <div class="panel-copy">
            ${escapeHtml(
              site.logoUrl
                ? "The generated media page surfaces the institute logo first so the brand is visible before the gallery."
                : "No logo URL is set yet, so the page shows an initials-based brand mark fallback."
            )}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderGallerySection(site) {
  if (!site.gallery.length) {
    return `
      <section class="section-shell">
        <div class="section-head">
          <p class="eyebrow">Gallery</p>
          <h2>Campus and atmosphere</h2>
        </div>
        <div class="empty-panel">Add gallery URLs in Generator Studio to generate image cards here.</div>
      </section>
    `;
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Gallery</p>
        <h2>Campus and atmosphere</h2>
      </div>
      <div class="media-grid">
        ${site.gallery
          .map(
            (imageUrl, index) => `
              <article class="gallery-card">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${site.business.name} media ${index + 1}`)}">
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderVideoSection(site) {
  const youtubeCard = site.socialLinks.find((item) => item.label === "YouTube" && item.url);
  if (!site.videos.length && !youtubeCard) {
    return `
      <section class="section-shell">
        <div class="section-head">
          <p class="eyebrow">Videos</p>
          <h2>YouTube and video stories</h2>
        </div>
        <div class="empty-panel">Add YouTube or other public video links in Generator Studio to generate video cards here.</div>
      </section>
    `;
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Videos</p>
        <h2>YouTube and video stories</h2>
      </div>
      <div class="video-grid video-grid-featured">
        ${
          youtubeCard
            ? `
              <article class="video-card channel-feature-card">
                <span class="inline-badge">Channel</span>
                <div class="meta-line">${escapeHtml(youtubeCard.title)}</div>
                <div class="panel-copy">${escapeHtml(youtubeCard.copy)}</div>
                <a class="map-link" href="${escapeHtml(youtubeCard.url)}" target="_blank" rel="noreferrer">Open YouTube</a>
              </article>
            `
            : ""
        }
        ${site.videos
          .map((video) => {
            const embedUrl = buildEmbedUrl(video.url);
            return `
              <article class="video-card">
                <span class="inline-badge">Video</span>
                <div class="meta-line">${escapeHtml(video.title || "Campus Video")}</div>
                ${
                  embedUrl
                    ? `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(video.title || "Campus Video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
                    : `<a class="map-link" href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">Open Video</a>`
                }
                <div class="meta-line">${escapeHtml(video.url)}</div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderAdmissionsSection(site) {
  return `
    <section class="section-shell section-split">
      <div class="section-head">
        <p class="eyebrow">Enrollment</p>
        <h2>${escapeHtml(site.admissionsTitle)}</h2>
      </div>
      <div class="section-copy">
        <p>${escapeHtml(site.admissionsBody || "Add detailed admissions guidance in Generator Studio to populate this section.")}</p>
        <div class="cta-row">
          ${renderActionButtons(site.headerActions, "cta")}
        </div>
      </div>
    </section>
  `;
}

function renderFaqSection(site) {
  if (!site.faqs.length) {
    return `
      <section class="section-shell">
        <div class="section-head">
          <p class="eyebrow">FAQ</p>
          <h2>Common questions</h2>
        </div>
        <div class="empty-panel">Add question and answer pairs in Generator Studio to generate the FAQ section.</div>
      </section>
    `;
  }

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">FAQ</p>
        <h2>Common questions</h2>
      </div>
      <div class="faq-list">
        ${site.faqs
          .map(
            (item) => `
              <article class="faq-item">
                <div class="faq-question">${escapeHtml(item.question || "Question")}</div>
                <div class="faq-answer">${escapeHtml(item.answer || "")}</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderContactSection(site) {
  const items = [
    site.contact.phone
      ? { badge: "Phone", title: site.contact.phone, href: `tel:${site.contact.phone}` }
      : null,
    site.contact.email
      ? { badge: "Email", title: site.contact.email, href: `mailto:${site.contact.email}` }
      : null,
    site.contact.website
      ? { badge: "Website", title: site.contact.website, href: site.contact.website }
      : null,
    site.contact.address
      ? { badge: "Address", title: site.contact.address, href: site.contact.mapUrl || "" }
      : null,
  ].filter(Boolean);

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Contact</p>
        <h2>Reach the institute directly</h2>
      </div>
      <div class="contact-grid">
        ${items.length
          ? items
              .map(
                (item) => `
                  <article class="contact-card">
                    <span class="inline-badge">${escapeHtml(item.badge)}</span>
                    <strong>${escapeHtml(item.title)}</strong>
                    ${
                      item.href
                        ? `<a href="${escapeHtml(item.href)}" ${linkTargetAttr(item.href)}>Open</a>`
                        : `<div class="panel-copy">No quick link available.</div>`
                    }
                  </article>
                `
              )
              .join("")
          : `<div class="empty-panel">Add contact details in Generator Studio to populate this page.</div>`}
      </div>
      ${
        site.contact.mapUrl
          ? `
            <div class="map-card">
              <span class="inline-badge">Map</span>
              <div class="panel-copy">${escapeHtml(site.contact.address || "Open the map link for location guidance.")}</div>
              <a class="map-link" href="${escapeHtml(site.contact.mapUrl)}" target="_blank" rel="noreferrer">Open Map</a>
            </div>
          `
          : ""
      }
    </section>
  `;
}

function renderSocialSection(site) {
  const liveLinks = site.socialLinks.filter((item) => item.url);
  const pendingLinks = site.socialLinks.filter((item) => !item.url);
  const liveLabels = liveLinks.map((item) => item.label).join(" · ");

  return `
    <section class="section-shell">
      <div class="section-head">
        <p class="eyebrow">Channels</p>
        <h2>Official public channels</h2>
      </div>
      <div class="channel-summary-grid">
        <article class="feature-panel">
          <span class="inline-badge">Live now</span>
          <strong>${escapeHtml(`${liveLinks.length} public link${liveLinks.length === 1 ? "" : "s"}`)}</strong>
          <div class="panel-copy">${escapeHtml(liveLinks.length ? `Currently connected: ${liveLabels}.` : "Connect the website or social profiles in Generator Studio to surface live public channels here.")}</div>
        </article>
        <article class="feature-panel">
          <span class="inline-badge">Video reach</span>
          <strong>${escapeHtml(site.videos.length ? `${countLabel(site.videos.length, "playable video")}` : liveLinks.some((item) => item.label === "YouTube") ? "YouTube linked" : "Video link pending")}</strong>
          <div class="panel-copy">${escapeHtml(liveLinks.some((item) => item.label === "YouTube") ? "The YouTube channel is already visible in the media page and can drive public updates." : "Add a YouTube link to surface public talks, event clips, or campus walkthroughs.")}</div>
        </article>
        <article class="feature-panel">
          <span class="inline-badge">Direct response</span>
          <strong>${escapeHtml(site.contact.phone || site.contact.email || "Contact page ready")}</strong>
          <div class="panel-copy">Keep important public notices paired with a direct phone, email, or website action.</div>
        </article>
      </div>
      ${
        liveLinks.length
          ? `
            <div class="channel-group">
              <div class="channel-group-head">
                <strong>Live channels</strong>
                <span>${escapeHtml("Links that visitors can open right now")}</span>
              </div>
              <div class="social-grid">
                ${renderSocialCards(liveLinks)}
              </div>
            </div>
          `
          : ""
      }
      ${
        pendingLinks.length
          ? `
            <div class="channel-group channel-group-muted">
              <div class="channel-group-head">
                <strong>Setup next</strong>
                <span>${escapeHtml("Visible placeholders for channels that still need real public links")}</span>
              </div>
              <div class="social-grid">
                ${renderSocialCards(pendingLinks)}
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}

function renderSocialCards(items) {
  return ensureArray(items)
    .map(
      (item) => `
        ${
          item.url
            ? `<a class="social-link-card ${item.available ? "" : "unavailable"}" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">`
            : `<article class="social-link-card unavailable">`
        }
          <div class="social-top">
            <span class="social-symbol">${escapeHtml(item.symbol)}</span>
            <span class="inline-badge">${escapeHtml(item.label)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.copy)}</p>
          <span class="social-status">${escapeHtml(item.status)}</span>
        ${item.url ? `</a>` : `</article>`}
      `
    )
    .join("");
}

function renderExtraSections(site) {
  if (!site.extraSections.length) {
    return "";
  }

  return site.extraSections
    .map(
      (item) => `
        <section class="section-shell section-split">
          <div class="section-head">
            <p class="eyebrow">More</p>
            <h2>${escapeHtml(item.title || "Additional Section")}</h2>
          </div>
          <div class="section-copy">
            <p>${escapeHtml(item.body || "")}</p>
          </div>
        </section>
      `
    )
    .join("");
}

function renderClosingCtaSection(site) {
  return `
    <section class="section-shell section-split">
      <div class="section-head">
        <p class="eyebrow">Next step</p>
        <h2>${escapeHtml(site.ctaTitle)}</h2>
      </div>
      <div class="section-copy">
        <p>${escapeHtml(site.ctaBody || "Invite visitors to call, message, or open the contact page from here.")}</p>
        <div class="cta-row">
          ${renderActionButtons(site.headerActions, "cta")}
        </div>
      </div>
    </section>
  `;
}

function resolveLeadership(websiteData, business) {
  const staff = normalizeStaffList(websiteData.staff);
  const principalName = stringOrDefault(websiteData.principal_name).toLowerCase();
  const namedMatch = staff.find((item) => principalName && item.name.toLowerCase() === principalName);
  const roleMatch =
    namedMatch ||
    staff.find((item) => /principal|director|head|lead|chair|founder/i.test(item.role || ""));
  const selected = roleMatch || staff[0] || null;

  return {
    name: stringOrDefault(websiteData.principal_name, selected?.name || "Institute Lead"),
    role: stringOrDefault(websiteData.principal_role, selected?.role || "Academic Lead"),
    image: normalizeUrl(websiteData.principal_image_url || selected?.image || websiteData.logo_url),
    message: meaningfulStringOrDefault(
      websiteData.principal_message,
      buildLeadershipMessageFallback(business),
      { minLength: 8 }
    ),
    sourceSignature:
      selected && selected.name && selected.role
        ? makeStaffSignature(selected)
        : "",
  };
}

function filterStaffForGrid(staffInput, leadership) {
  const staff = normalizeStaffList(staffInput);
  const filtered = staff.filter((item) => makeStaffSignature(item) !== leadership.sourceSignature);
  return filtered.length ? filtered : staff;
}

function normalizeStaffList(value) {
  return ensureArray(value)
    .map((item) => ({
      name: stringOrDefault(item?.name),
      role: stringOrDefault(item?.role),
      image: normalizeUrl(item?.image),
      bio: meaningfulStringOrDefault(item?.bio),
    }))
    .filter((item) => item.name || item.role || item.image || item.bio);
}

function normalizeVideos(value) {
  return ensureArray(value)
    .map((item) => ({
      title: stringOrDefault(item?.title, "Campus Video"),
      url: normalizeUrl(item?.url || item),
    }))
    .filter((item) => item.url);
}

function resolvePrimaryAction(websiteData) {
  const primarySource =
    normalizeUrl(websiteData.primary_cta_url) ||
    (stringOrDefault(websiteData.contact?.phone)
      ? `tel:${stringOrDefault(websiteData.contact?.phone)}`
      : "");

  return {
    label: stringOrDefault(websiteData.primary_cta_label, "Call Admissions"),
    url: primarySource || "./contact.html",
    variant: "primary",
  };
}

function resolveSecondaryAction(websiteData) {
  const fallbackUrl =
    normalizeUrl(websiteData.secondary_cta_url) ||
    normalizeUrl(websiteData.contact?.website) ||
    "./contact.html";

  return {
    label: stringOrDefault(websiteData.secondary_cta_label, "Contact Institute"),
    url: fallbackUrl,
    variant: "secondary",
  };
}

function renderHeaderActions(actions) {
  const markup = renderActionButtons(actions, "nav-cta");
  return markup ? `<div class="nav-actions">${markup}</div>` : "";
}

function renderActionButtons(actions, className) {
  return ensureArray(actions)
    .filter((item) => item?.url)
    .map(
      (item) =>
        `<a class="${className} ${item.variant || "secondary"}" href="${escapeHtml(item.url)}" ${linkTargetAttr(item.url)}>${escapeHtml(item.label || "Open")}</a>`
    )
    .join("");
}

function renderNavLinks(pageKey, className) {
  return `
    <div class="${className}">
      ${PAGE_DEFINITIONS.map(
        (page) =>
          `<a class="${page.key === pageKey ? "active" : ""}" href="./${page.file}">${escapeHtml(page.label)}</a>`
      ).join("")}
    </div>
  `;
}

function renderBrandMark(url, name, imageClassName, fallbackClassName) {
  if (url) {
    return `<img class="${imageClassName}" src="${escapeHtml(url)}" alt="${escapeHtml(name)} logo">`;
  }
  return `<div class="${fallbackClassName}">${escapeHtml(makeInitials(name))}</div>`;
}

function buildSocialLinks(websiteData) {
  const social = websiteData.social || {};
  const firstVideoInput = ensureArray(websiteData.videos)[0];
  const firstVideoUrl = normalizeUrl(firstVideoInput?.url || firstVideoInput);
  const items = [
    {
      label: "Website",
      symbol: "Web",
      title: "Official Website",
      copy: "Primary website or external public page for the institute.",
      url: normalizeUrl(websiteData.contact?.website),
    },
    {
      label: "Facebook",
      symbol: "Fb",
      title: "Facebook Updates",
      copy: "Use the Facebook page for notices, image posts, and public updates.",
      url: normalizeUrl(social.facebook),
    },
    {
      label: "Instagram",
      symbol: "Ig",
      title: "Instagram Highlights",
      copy: "Visual updates, campus snapshots, and short-form stories.",
      url: normalizeUrl(social.instagram),
    },
    {
      label: "YouTube",
      symbol: "Yt",
      title: "YouTube Channel",
      copy: "Video stories, public presentations, and campus footage.",
      url: normalizeUrl(social.youtube || firstVideoUrl),
    },
    {
      label: "Twitter / X",
      symbol: "X",
      title: "X Feed",
      copy: "Short-form announcements and public-facing updates.",
      url: normalizeUrl(social.twitter),
    },
  ];

  return items.map((item) => ({
    ...item,
    available: Boolean(item.url),
    status: item.url ? "Live link available" : "Add this link in Generator Studio",
  }));
}

function buildEmbedUrl(url) {
  const input = String(url || "").trim();
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
    if (host.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.toString();
      }
      const videoId = parsed.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
  } catch {
    return "";
  }

  return "";
}

function linkTargetAttr(url) {
  const value = String(url || "").trim();
  if (
    !value ||
    value.startsWith("./") ||
    value.startsWith("/") ||
    value.startsWith("#") ||
    /^(tel:|mailto:)/i.test(value)
  ) {
    return 'target="_self" rel="noreferrer"';
  }
  return 'target="_blank" rel="noreferrer"';
}

function makeInitials(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase() || "")
      .join("") || "GS"
  );
}

function makeFallbackLabel(value, fallback) {
  return String(value || fallback || "Profile")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

function makeStaffSignature(staff) {
  return [staff?.name, staff?.role, staff?.image]
    .map((item) => String(item || "").trim().toLowerCase())
    .join("|");
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "#355da8").replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildStylesheet(seed, seedRgb) {
  return `@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap");

:root {
  --seed: ${seed};
  --seed-rgb: ${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b};
  --seed-soft: rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, 0.14);
  --seed-softer: rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, 0.08);
  --seed-outline: rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, 0.22);
  --ink: #122235;
  --ink-soft: #304258;
  --muted: #66788f;
  --surface: rgba(255, 255, 255, 0.74);
  --surface-strong: rgba(255, 255, 255, 0.88);
  --border: rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, 0.18);
  --shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
  --shadow-soft: 0 14px 34px rgba(15, 23, 42, 0.08);
  --radius-card: 30px;
  --radius-media: 34px;
  --radius-pill: 999px;
  --max: 1240px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: "Manrope", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,.96), transparent 24rem),
    radial-gradient(circle at top right, rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, .12), transparent 20rem),
    linear-gradient(180deg, #f7efe6 0%, #edf4ff 45%, #f5f8fc 100%);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255,255,255,.16), transparent 38%),
    repeating-linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.05) 1px, transparent 1px, transparent 128px);
  opacity: .56;
}
img { display: block; max-width: 100%; }
a { color: inherit; }

.site-shell {
  position: relative;
  z-index: 1;
  width: min(calc(100vw - 26px), var(--max));
  margin: 0 auto;
  padding: 22px 0 60px;
}

.site-header {
  position: sticky;
  top: 16px;
  z-index: 30;
  margin-bottom: 22px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 34px;
  background: rgba(255,255,255,.8);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-soft);
}

.site-nav,
.site-nav-top,
.brand,
.hero-actions,
.hero-meta,
.cta-row,
.nav-actions,
.footer-actions,
.social-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.site-nav {
  display: grid;
  gap: 14px;
}

.site-nav-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
}

.brand {
  min-width: 0;
  text-decoration: none;
  flex-wrap: nowrap;
}

.brand-logo,
.brand-logo-fallback,
.leadership-avatar-fallback,
.staff-avatar-fallback,
.logo-mark-fallback,
.page-media-fallback {
  display: grid;
  place-items: center;
}

.brand-logo,
.brand-logo-fallback {
  width: 58px;
  height: 58px;
  border-radius: 20px;
  object-fit: cover;
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(255,255,255,.66));
  border: 1px solid rgba(255,255,255,.92);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
}

.brand-logo-fallback,
.leadership-avatar-fallback,
.staff-avatar-fallback,
.logo-mark-fallback,
.page-media-fallback {
  color: var(--seed);
  font-weight: 800;
}

.brand-copy,
.hero-copy,
.section-copy,
.staff-body,
.contact-copy,
.footer,
.footer-brand {
  min-width: 0;
}

.brand-copy {
  display: grid;
  gap: 4px;
}

.brand-copy strong,
.hero-copy h1,
.section-head h2,
.page-link-card h3,
.staff-card h3,
.quote-card strong,
.contact-card strong,
.leadership-text strong,
.social-link-card h3,
.footer-brand strong {
  font-family: "Sora", "Segoe UI", sans-serif;
}

.brand-copy strong {
  display: block;
  font-size: clamp(1rem, 1.25vw, 1.12rem);
  line-height: 1.24;
  overflow-wrap: anywhere;
}

.brand-copy span,
.section-copy,
.panel-copy,
.meta-line,
.muted,
.page-link-card p,
.social-link-card p,
.footer,
.contact-copy,
.staff-role,
.faq-answer,
.footer-brand span,
.social-status {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.nav-desktop {
  min-width: 0;
  padding-top: 12px;
  border-top: 1px solid rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, .12);
}

.nav-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.nav-links {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  justify-content: flex-start;
  overflow-x: auto;
  padding: 8px;
  border-radius: 24px;
  background: rgba(255,255,255,.58);
  border: 1px solid rgba(255,255,255,.62);
  scrollbar-width: none;
}

.nav-links::-webkit-scrollbar {
  display: none;
}

.nav-links a,
.nav-cta,
.cta,
.map-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  text-decoration: none;
  font-weight: 800;
  white-space: nowrap;
  transition: transform .2s ease, background .2s ease, color .2s ease, box-shadow .2s ease;
}

.nav-links a {
  color: var(--ink-soft);
}

.nav-links a.active,
.nav-links a:hover {
  color: var(--seed);
  background: var(--seed-soft);
  transform: translateY(-1px);
}

.nav-cta,
.cta {
  border: 1px solid transparent;
}

.nav-cta.primary,
.cta.primary,
.map-link {
  color: #fff;
  background: linear-gradient(135deg, rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, .96), rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, .76));
  box-shadow: 0 16px 28px rgba(${seedRgb.r}, ${seedRgb.g}, ${seedRgb.b}, .28);
}

.nav-cta.secondary,
.cta.secondary {
  color: var(--seed);
  border-color: var(--border);
  background: rgba(255,255,255,.9);
}

.nav-cta:hover,
.cta:hover,
.map-link:hover {
  transform: translateY(-1px);
}

.nav-menu {
  display: none;
  margin-left: auto;
}

.nav-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,.86);
  color: var(--seed);
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

.nav-toggle::-webkit-details-marker { display: none; }
.nav-sheet { display: none; }

.page-hero,
.section-shell,
.feature-panel,
.page-link-card,
.stat-card,
.contact-card,
.social-link-card,
.staff-card,
.quote-card,
.faq-item,
.video-card,
.gallery-card,
.map-card,
.logo-mark-card {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: linear-gradient(180deg, var(--surface-strong), var(--surface));
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.page-hero {
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(340px, .92fr);
  gap: 22px;
  padding: 24px;
}

.hero-copy {
  padding: 10px 6px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--seed);
  text-transform: uppercase;
  letter-spacing: .2em;
  font-size: .74rem;
  font-weight: 800;
}

.hero-copy h1,
.section-head h2,
.page-link-card h3,
.social-link-card h3 {
  margin: 0;
  line-height: 1.03;
}

.hero-copy h1 {
  max-width: 11ch;
  font-size: clamp(2.5rem, 5vw, 5rem);
  overflow-wrap: anywhere;
}

.hero-copy .lede {
  max-width: 66ch;
  font-size: 1.03rem;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.hero-actions {
  margin-top: 26px;
}

.hero-meta {
  margin-top: 18px;
}

.chip {
  padding: 10px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: rgba(255,255,255,.76);
  color: var(--muted);
}

.hero-media {
  position: relative;
  min-height: clamp(340px, 35vw, 460px);
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-media);
  overflow: hidden;
}

.hero-media img,
.page-media-fallback {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.page-media-fallback {
  background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(255,255,255,.68));
  font-size: 3rem;
}

.hero-overlay {
  position: absolute;
  inset: auto 18px 18px 18px;
  padding: 18px;
  border: 1px solid rgba(255,255,255,.34);
  border-radius: 22px;
  background: rgba(14, 22, 35, .58);
  backdrop-filter: blur(16px);
  color: #fff;
}

.hero-overlay strong {
  display: block;
  margin-bottom: 4px;
}

.hero-overlay span {
  color: rgba(255,255,255,.8);
}

.page-main {
  display: grid;
  gap: 24px;
  margin-top: 24px;
}

.stats-grid,
.link-grid,
.panel-grid,
.channel-summary-grid,
.staff-grid,
.quote-grid,
.media-grid,
.video-grid,
.social-grid,
.contact-grid {
  display: grid;
  gap: 18px;
}

.stats-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.link-grid {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.panel-grid,
.channel-summary-grid,
.social-grid,
.contact-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.staff-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 290px));
  justify-content: center;
}

.quote-grid,
.media-grid,
.video-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.video-grid-featured {
  align-items: start;
}

.section-shell,
.feature-panel,
.page-link-card,
.social-link-card,
.video-card,
.contact-card,
.faq-item,
.staff-card,
.quote-card,
.map-card,
.logo-mark-card {
  padding: 24px;
}

.section-split {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.section-head h2 {
  font-size: clamp(1.95rem, 3vw, 3rem);
  max-width: 13ch;
}

.section-copy,
.panel-copy,
.feature-list,
.quote-card p,
.contact-card p,
.contact-copy {
  line-height: 1.78;
  font-size: 1rem;
}

.feature-list,
.faq-list {
  display: grid;
  gap: 14px;
}

.feature-list {
  margin: 0;
  padding-left: 18px;
}

.inline-badge {
  display: inline-flex;
  width: fit-content;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--seed-soft);
  color: var(--seed);
  font-size: .78rem;
  font-weight: 800;
}

.stat-card strong {
  display: block;
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.35rem);
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.stat-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  min-height: 128px;
}

.page-link-card,
.social-link-card,
.contact-card,
.faq-item,
.quote-card,
.feature-panel,
.video-card,
.map-card {
  display: grid;
  gap: 12px;
}

.page-link-card:hover,
.social-link-card:hover,
.feature-panel:hover {
  transform: translateY(-2px);
}

.leadership-card {
  display: grid;
  grid-template-columns: minmax(150px, 180px) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
}

.leadership-visual,
.leadership-text,
.staff-body {
  display: grid;
  gap: 12px;
}

.leadership-avatar,
.leadership-avatar-fallback {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 26px;
  object-fit: cover;
  background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(255,255,255,.68));
  border: 1px solid var(--seed-outline);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.leadership-avatar-fallback {
  padding: 18px;
  text-align: center;
  font-size: .95rem;
  line-height: 1.4;
}

.staff-card {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  max-width: 290px;
  width: 100%;
  padding: 18px;
}

.staff-avatar,
.staff-avatar-fallback {
  width: 80px;
  height: 80px;
  border-radius: 22px;
  object-fit: cover;
  background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(255,255,255,.68));
  border: 1px solid var(--seed-outline);
}

.staff-avatar-fallback {
  padding: 12px;
  text-align: center;
  line-height: 1.35;
}

.staff-card h3 {
  margin: 0;
  font-size: 1rem;
}

.staff-role,
.quote-card span {
  display: block;
  margin-top: 4px;
}

.gallery-card {
  overflow: hidden;
  display: flex;
  align-items: stretch;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-media);
  padding: 0;
}

.gallery-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-card iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 22px;
  background: #0f172a;
}

.channel-feature-card {
  align-content: start;
}

.channel-summary-grid,
.channel-group {
  display: grid;
  gap: 18px;
}

.channel-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.channel-group-head strong {
  font-family: "Sora", "Segoe UI", sans-serif;
  font-size: 1.05rem;
}

.channel-group-head span {
  color: var(--muted);
}

.channel-group-muted .channel-group-head strong {
  color: var(--ink-soft);
}

.logo-mark-card {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 22px;
  align-items: center;
}

.logo-mark,
.logo-mark-fallback {
  width: min(220px, 100%);
  aspect-ratio: 1 / 1;
  border-radius: 32px;
  object-fit: contain;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,.95), rgba(255,255,255,.72)),
    linear-gradient(135deg, var(--seed-soft), rgba(255,255,255,.86));
  border: 1px solid var(--seed-outline);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.logo-mark-fallback {
  padding: 22px;
  text-align: center;
  font-size: clamp(2rem, 4vw, 3rem);
}

.social-link-card {
  align-content: start;
  min-height: 240px;
  transition: transform .2s ease, box-shadow .2s ease;
}

.social-top {
  justify-content: flex-start;
}

.social-symbol {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-grid;
  place-items: center;
  background: var(--seed-soft);
  color: var(--seed);
  font-weight: 800;
}

.social-link-card.unavailable {
  opacity: .82;
  background: linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.58));
}

.social-status {
  font-weight: 700;
}

.contact-card a,
.social-link-card a {
  color: var(--seed);
  font-weight: 800;
  text-decoration: none;
}

.contact-card a:hover,
.social-link-card a:hover {
  text-decoration: underline;
}

.faq-question {
  font-weight: 800;
  color: var(--ink-soft);
}

.empty-panel {
  padding: 20px;
  border-radius: 24px;
  border: 1px dashed var(--seed-outline);
  background: var(--seed-softer);
  color: var(--muted);
  line-height: 1.7;
}

.footer {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.72));
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(18px);
}

@media (max-width: 1180px) {
  .nav-actions { gap: 8px; }
  .page-hero,
  .section-split,
  .leadership-card,
  .logo-mark-card {
    grid-template-columns: 1fr;
  }
  .hero-copy h1 { max-width: none; }
}

@media (max-width: 980px) {
  .site-header {
    padding: 12px 14px;
    border-radius: 28px;
  }

  .site-nav-top {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .nav-desktop {
    display: none;
  }

  .nav-actions {
    display: none;
  }

  .nav-menu {
    display: block;
  }

  .nav-menu[open]::before {
    content: "";
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, .24);
    backdrop-filter: blur(2px);
  }

  .nav-menu[open] .nav-sheet {
    display: grid;
  }

  .nav-sheet {
    position: fixed;
    top: 16px;
    right: 16px;
    bottom: 16px;
    width: min(86vw, 330px);
    padding: 18px;
    gap: 16px;
    align-content: start;
    border: 1px solid var(--border);
    border-radius: 28px;
    background: rgba(255,255,255,.94);
    backdrop-filter: blur(20px);
    box-shadow: var(--shadow);
  }

  .nav-sheet-header {
    display: grid;
    gap: 4px;
  }

  .nav-sheet-header strong {
    font-family: "Sora", "Segoe UI", sans-serif;
    font-size: 1rem;
  }

  .nav-links-mobile {
    display: grid;
    gap: 8px;
  }

  .nav-links-mobile a {
    justify-content: flex-start;
    padding-inline: 16px;
  }

  .nav-sheet-actions {
    display: grid;
    gap: 10px;
  }

  .nav-sheet-actions .nav-cta {
    width: 100%;
  }
}

@media (max-width: 760px) {
  .site-shell {
    width: min(calc(100vw - 16px), var(--max));
    padding-top: 12px;
  }

  .brand {
    gap: 10px;
  }

  .brand-logo,
  .brand-logo-fallback {
    width: 48px;
    height: 48px;
    border-radius: 16px;
  }

  .page-hero,
  .section-shell,
  .feature-panel,
  .page-link-card,
  .stat-card,
  .contact-card,
  .social-link-card,
  .staff-card,
  .quote-card,
  .faq-item,
  .video-card,
  .map-card,
  .logo-mark-card,
  .footer {
    padding: 18px;
  }

  .stats-grid,
  .link-grid,
  .panel-grid,
  .channel-summary-grid,
  .quote-grid,
  .media-grid,
  .video-grid,
  .social-grid,
  .contact-grid {
    grid-template-columns: 1fr;
  }

  .staff-grid {
    grid-template-columns: 1fr;
  }

  .staff-card {
    grid-template-columns: 72px minmax(0, 1fr);
    max-width: none;
  }

  .staff-avatar,
  .staff-avatar-fallback {
    width: 72px;
    height: 72px;
    border-radius: 18px;
  }

  .footer {
    flex-direction: column;
    align-items: flex-start;
  }
}`;
}

module.exports = {
  buildWebsitePages,
  buildWebsiteStyles,
};
