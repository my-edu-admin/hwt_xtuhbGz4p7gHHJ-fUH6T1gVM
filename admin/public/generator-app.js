(function () {
  const generatorState = {
    search: "",
    province: "",
    district: "",
    page: 1,
    pageSize: 10,
    selectedSlug: null,
    studioData: null,
    activeTab: "website",
    busy: false,
  };

  state.generatorStudio = generatorState;

  const websiteFieldIds = [
    "site_title",
    "hero_kicker",
    "hero_title",
    "hero_summary",
    "about_title",
    "about_body",
    "principal_name",
    "principal_role",
    "principal_message",
    "admissions_title",
    "admissions_body",
    "cta_title",
    "cta_body",
    "primary_cta_label",
    "primary_cta_url",
    "secondary_cta_label",
    "secondary_cta_url",
    "theme_seed",
    "logo_url",
    "cover_url",
  ];

  const appFieldIds = [
    "app_name",
    "app_tagline",
    "intro_title",
    "intro_body",
    "director_name",
    "director_role",
    "director_message",
    "admissions_note",
    "contact_headline",
    "theme_seed",
    "logo_url",
    "hero_image_url",
  ];

  const formReadyIds = [
    "generatorBusinessSearch",
    "generatorBusinessProvince",
    "generatorBusinessDistrict",
    "generatorWebsiteTab",
    "generatorAppTab",
    "generatorLoadBtn",
    "generatorSaveBtn",
    "generatorBuildWebsiteBtn",
    "generatorCopyBtn",
    "generatorBuildAppBtn",
  ];

  window.openGeneratorApp = function openGeneratorApp() {
    openApp("generator");
  };

  window.loadGeneratorStudioApp = async function loadGeneratorStudioApp({ loading } = {}) {
    if (!state.businesses.length) {
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, loading });
    }

    populateProvinceSelect("generatorBusinessProvince", "All provinces");
    populateDistrictSelect(
      "generatorBusinessDistrict",
      generatorState.province,
      "",
      generatorState.district,
      "All districts",
      state.businesses
    );
    setValue("generatorBusinessProvince", generatorState.province);
    setValue("generatorBusinessDistrict", generatorState.district);
    renderGeneratorBusinessList();
    syncGeneratorButtons();

    const preferredSlug = generatorState.selectedSlug || state.selectedSlug || state.paymentSlug;
    if (preferredSlug) {
      await loadGeneratorBusiness(preferredSlug, { silent: true, loading });
      return;
    }

    renderGeneratorSelectedBusiness();
    renderGeneratorPaths();
    setGeneratorStatus("Select a business to load its website and app studio data.");
  };

  window.selectGeneratorBusiness = function selectGeneratorBusiness(slug) {
    void loadGeneratorBusiness(slug);
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!formReadyIds.every((id) => document.getElementById(id))) {
      return;
    }

    document.getElementById("generatorBusinessSearch").addEventListener("input", (event) => {
      generatorState.search = event.target.value.trim();
      generatorState.page = 1;
      renderGeneratorBusinessList();
    });
    populateProvinceSelect("generatorBusinessProvince", "All provinces");
    populateDistrictSelect("generatorBusinessDistrict", "", "", "", "All districts", state.businesses);
    document.getElementById("generatorBusinessProvince").addEventListener("change", (event) => {
      generatorState.province = event.target.value;
      generatorState.district = "";
      populateDistrictSelect(
        "generatorBusinessDistrict",
        generatorState.province,
        "",
        "",
        "All districts",
        state.businesses
      );
      generatorState.page = 1;
      renderGeneratorBusinessList();
    });
    document.getElementById("generatorBusinessDistrict").addEventListener("change", (event) => {
      generatorState.district = event.target.value;
      generatorState.page = 1;
      renderGeneratorBusinessList();
    });
    document.getElementById("generatorWebsiteTab").addEventListener("click", () => switchGeneratorTab("website"));
    document.getElementById("generatorAppTab").addEventListener("click", () => switchGeneratorTab("app"));
    document.getElementById("generatorLoadBtn").addEventListener("click", () => {
      const slug = state.selectedSlug || state.paymentSlug || generatorState.selectedSlug;
      if (!slug) {
        toast("⚠️ No Business", "Select a business in Generator Studio or Administration first.", "error");
        return;
      }
      void loadGeneratorBusiness(slug);
    });
    document.getElementById("generatorSaveBtn").addEventListener("click", () => void saveGeneratorStudio());
    document.getElementById("generatorBuildWebsiteBtn").addEventListener("click", () => void requestGeneratorBuild("website"));
    document.getElementById("generatorCopyBtn").addEventListener("click", copyWebsiteDataToApp);
    document.getElementById("generatorBuildAppBtn").addEventListener("click", () => void requestGeneratorBuild("app"));

    switchGeneratorTab("website");
    renderGeneratorBusinessList();
    renderGeneratorSelectedBusiness();
    renderGeneratorPaths();
    syncGeneratorButtons();
  });

  function switchGeneratorTab(tab) {
    generatorState.activeTab = tab === "app" ? "app" : "website";
    document.getElementById("generatorWebsiteTab").classList.toggle("active", generatorState.activeTab === "website");
    document.getElementById("generatorAppTab").classList.toggle("active", generatorState.activeTab === "app");
    document.getElementById("generatorWebsitePanel").classList.toggle("hidden", generatorState.activeTab !== "website");
    document.getElementById("generatorAppPanel").classList.toggle("hidden", generatorState.activeTab !== "app");
  }

  function renderGeneratorBusinessList() {
    const container = document.getElementById("generatorBusinessList");
    const pagination = document.getElementById("generatorBusinessPagination");
    if (!container) {
      return;
    }

    const query = generatorState.search.toLowerCase();
    const matches = state.businesses
      .filter((business) => {
        if (generatorState.province && String(business.province || "") !== generatorState.province) {
          return false;
        }
        if (generatorState.district && String(business.district || "") !== generatorState.district) {
          return false;
        }
        if (!query) {
          return true;
        }
        return String(business.search_text || "").includes(query);
      });
    const totalPages = Math.max(1, Math.ceil(matches.length / generatorState.pageSize));
    generatorState.page = Math.min(Math.max(1, generatorState.page), totalPages);
    const startIndex = (generatorState.page - 1) * generatorState.pageSize;
    const visibleItems = matches.slice(startIndex, startIndex + generatorState.pageSize);

    container.innerHTML = visibleItems.length
      ? visibleItems
          .map(
            (business) => `
              <button type="button" class="generator-business-item ${business.slug === generatorState.selectedSlug ? "active" : ""}" onclick="selectGeneratorBusiness('${escapeText(business.slug)}')">
                <div class="generator-business-title">${escapeText(business.name)}</div>
                <div class="generator-business-meta">${escapeText(business.id || "No ID")} · ${escapeText(business.slug)}</div>
                <div class="generator-business-copy">${escapeText(business.location_label || "No location")} · ${escapeText(business.type || "Type not set")}</div>
                <div class="generator-business-copy">${escapeText(business.affiliation || "No affiliation")}</div>
              </button>
            `
          )
          .join("")
      : `<div class="generator-selected-card">No businesses matched the current search.</div>`;

    if (pagination) {
      pagination.innerHTML = matches.length
        ? `
            <span class="generator-pagination-copy">${escapeText(`${matches.length} businesses · page ${generatorState.page}/${totalPages}`)}</span>
            <div class="generator-pagination-actions">
              <button type="button" class="tb-btn" ${generatorState.page <= 1 ? "disabled" : ""} onclick="changeGeneratorPage(-1)">Prev</button>
              <button type="button" class="tb-btn" ${generatorState.page >= totalPages ? "disabled" : ""} onclick="changeGeneratorPage(1)">Next</button>
            </div>
          `
        : "";
    }
  }

  function renderGeneratorSelectedBusiness() {
    const container = document.getElementById("generatorSelectedBusiness");
    if (!container) {
      return;
    }

    const business = generatorState.studioData?.business;
    if (!business) {
      container.className = "generator-selected-card";
      container.textContent = "Select a business to load website and app generator data.";
      return;
    }

    container.className = "generator-selected-card";
    container.innerHTML = `
      <div class="generator-selected-title">${escapeText(business.name)}</div>
      <div class="generator-selected-copy">${escapeText(business.id || "No ID")} · ${escapeText(business.slug)}</div>
      <div class="generator-selected-copy">${escapeText(business.location_label || "No location")}</div>
      <div class="generator-selected-copy">${escapeText(business.type || "Type not set")} · ${escapeText(business.affiliation || "No affiliation")}</div>
      <div class="generator-selected-copy">Saved: ${escapeText(generatorState.studioData.saved_at || "Not saved yet")}</div>
      <div class="generator-selected-copy">Files: ${escapeText(String(generatorState.studioData?.paths?.generated_count || 0))} generated · ${escapeText(String(generatorState.studioData?.paths?.non_generated_count || 0))} pending</div>
      <div class="generator-selected-copy">Website: ${generatorState.studioData?.paths?.has_website ? "generated" : "missing"} · APK: ${generatorState.studioData?.paths?.has_apk ? "generated" : "missing"}</div>
    `;
  }

  function renderGeneratorPaths() {
    const container = document.getElementById("generatorPathList");
    if (!container) {
      return;
    }
    container.innerHTML = buildGeneratorFileStatusMarkup();
  }

  function renderGeneratorFileCard(item, tone, statusLabel) {
    return `
      <div class="generator-path-card ${escapeText(tone)}">
        <div class="generator-path-title">${escapeText(item.label || "Managed File")}</div>
        <div class="generator-path-copy">${escapeText(item.group || "File")} · ${escapeText(statusLabel)}</div>
        <code>${escapeText(item.path || "Not available yet")}</code>
      </div>
    `;
  }

  async function loadGeneratorBusiness(slug, options = {}) {
    const normalizedSlug = String(slug || "").trim();
    if (!normalizedSlug || generatorState.busy) {
      return;
    }

    if (options.loading) {
      options.loading.update(35, "Loading studio data...", `Reading generator data for ${normalizedSlug}`);
    }

    try {
      setGeneratorBusy(true);
      const response = await fetch(`/api/generator/business/${encodeURIComponent(normalizedSlug)}`);
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load generator data.");
      }

      applyStudioPayload(payload.data);
      generatorState.selectedSlug = normalizedSlug;
      renderGeneratorBusinessList();
      if (!options.silent) {
        toast("✅ Generator Ready", `Loaded Generator Studio data for ${payload.data.business.name}.`, "success");
      }
      setGeneratorStatus(`Loaded Generator Studio data for ${payload.data.business.name}.`);
    } catch (error) {
      toast("❌ Generator Error", error.message, "error");
      setGeneratorStatus("Unable to load generator data.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function saveGeneratorStudio() {
    if (!generatorState.selectedSlug || generatorState.busy) {
      return;
    }

    try {
      setGeneratorBusy(true);
      const data = await postGeneratorPayload("/api/generator/save");
      applyStudioPayload(data);
      toast("💾 Saved", "Generator Studio data saved into user_data.", "success");
      setGeneratorStatus("Generator Studio data saved.");
    } catch (error) {
      toast("❌ Save Error", error.message, "error");
      setGeneratorStatus("Generator Studio save failed.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function buildGeneratorWebsite() {
    if (!generatorState.selectedSlug || generatorState.busy) {
      return;
    }

    try {
      setGeneratorBusy(true);
      const data = await postGeneratorPayload("/api/generator/build/website");
      applyStudioPayload(data);
      toast("🌐 Website Built", "Website output was generated in user_out.", "success");
      setGeneratorStatus(`Website built at ${data.paths.website_index_path}`);
    } catch (error) {
      toast("❌ Website Build Error", error.message, "error");
      setGeneratorStatus("Website build failed.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function buildGeneratorApp() {
    if (!generatorState.selectedSlug || generatorState.busy) {
      return;
    }

    try {
      setGeneratorBusy(true);
      const data = await postGeneratorPayload("/api/generator/build/app");
      applyStudioPayload(data);
      toast("📱 APK Built", "Flutter APK was built and copied into user_out.", "success");
      setGeneratorStatus(`APK built at ${data.flutter?.apk_path || data.paths.apk_path}`);
    } catch (error) {
      toast("❌ APK Build Error", error.message, "error");
      setGeneratorStatus("Flutter APK build failed.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function requestGeneratorBuild(target) {
    if (!generatorState.selectedSlug || generatorState.busy) {
      return;
    }

    const paths = generatorState.studioData?.paths || {};
    const shouldConfirm =
      target === "website"
        ? Boolean(paths.has_website_form || paths.has_website || paths.has_website_assets)
        : Boolean(paths.has_app_form || paths.has_flutter_project || paths.has_apk);

    if (!shouldConfirm) {
      if (target === "website") {
        await buildGeneratorWebsite();
      } else {
        await buildGeneratorApp();
      }
      return;
    }

    showModal({
      title: target === "website" ? "Rewrite Website Files" : "Rewrite App Files",
      icon: "⚠️",
      body: `
        Existing managed ${escapeText(target)} files were found for <b>${escapeText(generatorState.studioData?.business?.name || generatorState.selectedSlug)}</b>.<br><br>
        Continue only if you want Generator Studio to rewrite the current ${escapeText(target)} data and output.
      `,
      confirmLabel: "Rewrite",
      confirmClass: "primary",
      onConfirm: async () => {
        if (target === "website") {
          await buildGeneratorWebsite();
        } else {
          await buildGeneratorApp();
        }
      }
    });
  }

  window.showGeneratorFileStatus = function showGeneratorFileStatus() {
    if (!generatorState.selectedSlug || !generatorState.studioData?.paths) {
      toast("⚠️ No Business", "Load a business before opening Generator Studio file status.", "error");
      return;
    }

    showModal({
      title: `${generatorState.studioData.business.name} File Status`,
      icon: "📁",
      body: buildGeneratorFileStatusMarkup(),
      confirmLabel: "Close",
      hideCancel: true,
      size: "wide"
    });
  };

  window.requestGeneratorDelete = function requestGeneratorDelete(target) {
    if (!generatorState.selectedSlug || generatorState.busy) {
      return;
    }

    const label =
      target === "website"
        ? "website studio data and generated website files"
        : target === "app"
          ? "app studio data, Flutter project, and APK files"
          : "all Generator Studio data and outputs";

    showModal({
      title: "Delete Generator Files",
      icon: "🗑️",
      body: `Delete <b>${escapeText(label)}</b> for <b>${escapeText(generatorState.studioData?.business?.name || generatorState.selectedSlug)}</b>? This removes the generated files from disk.`,
      confirmLabel: "Delete",
      confirmClass: "danger",
      onConfirm: async () => {
        await deleteGeneratorTarget(target);
      }
    });
  };

  async function deleteGeneratorTarget(target) {
    try {
      setGeneratorBusy(true);
      const response = await fetch("/api/generator/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: generatorState.selectedSlug,
          target
        })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to delete generator files.");
      }
      applyStudioPayload(payload.data);
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: true });
      toast("🧹 Generator Cleaned", `Deleted ${target} data for ${payload.data.business.name}.`, "success");
      setGeneratorStatus(`Deleted ${target} generator files for ${payload.data.business.name}.`);
    } catch (error) {
      toast("❌ Delete Error", error.message, "error");
      setGeneratorStatus("Generator delete failed.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  function buildGeneratorFileStatusMarkup() {
    const paths = generatorState.studioData?.paths;
    if (!paths) {
      return "Select a business to see the managed Generator Studio files.";
    }

    const folders = [
      ["Studio Data", paths.data_dir],
      ["Generated Output", paths.output_dir],
      ["Flutter Project", paths.flutter_project_dir]
    ];
    const generatedFiles = Array.isArray(paths.generated_files) ? paths.generated_files : [];
    const pendingFiles = Array.isArray(paths.non_generated_files) ? paths.non_generated_files : [];

    return `
      <div class="generator-file-section">
        <div class="generator-file-section-title">Managed Folders</div>
        <div class="generator-file-card-grid">
          ${folders
            .map(
              ([label, value]) => `
                <div class="generator-path-card folder">
                  <div class="generator-path-title">${escapeText(label)}</div>
                  <div class="generator-path-copy">${escapeText(value ? "Ready" : "Pending")}</div>
                  <code>${escapeText(value || "Not available yet")}</code>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="generator-file-section">
        <div class="generator-file-section-title">Generated Files (${escapeText(String(generatedFiles.length))})</div>
        <div class="generator-file-card-grid">
          ${
            generatedFiles.length
              ? generatedFiles.map((item) => renderGeneratorFileCard(item, "generated", "Generated")).join("")
              : `<div class="generator-path-card pending"><div class="generator-path-title">No generated files yet</div><div class="generator-path-copy">Save or build this business to create managed studio files.</div></div>`
          }
        </div>
      </div>
      <div class="generator-file-section">
        <div class="generator-file-section-title">Not Generated Yet (${escapeText(String(pendingFiles.length))})</div>
        <div class="generator-file-card-grid">
          ${
            pendingFiles.length
              ? pendingFiles.map((item) => renderGeneratorFileCard(item, "pending", "Pending")).join("")
              : `<div class="generator-path-card generated"><div class="generator-path-title">All managed files are present</div><div class="generator-path-copy">This business already has the full Generator Studio data and output set.</div></div>`
          }
        </div>
      </div>
    `;
  }

  function copyWebsiteDataToApp() {
    if (!generatorState.selectedSlug) {
      toast("⚠️ No Business", "Load a business before copying website data into the app form.", "error");
      return;
    }

    const website = collectWebsiteFormData();
    fillAppForm({
      app_name: website.site_title,
      app_tagline: website.hero_kicker,
      intro_title: website.hero_title,
      intro_body: website.about_body || website.hero_summary,
      director_name: website.principal_name,
      director_role: website.principal_role,
      director_message: website.principal_message,
      admissions_note: website.admissions_body,
      contact_headline: website.cta_title,
      theme_seed: website.theme_seed,
      logo_url: website.logo_url,
      hero_image_url: website.cover_url,
      gallery: website.gallery,
      videos: website.videos,
      playlists: [],
      programs: website.programs,
      facilities: website.facilities,
      highlights: website.extra_sections.length
        ? website.extra_sections
        : website.achievements.map((item) => ({ title: item.label, body: item.value })),
      quick_facts: website.achievements,
      notices: website.testimonials.map((item) => [item.name, item.quote].filter(Boolean).join(": ")).filter(Boolean),
      staff: website.staff,
      contact: {
        address: website.contact.address,
        phone: website.contact.phone,
        email: website.contact.email,
        website: website.contact.website,
      },
      social: website.social,
    });
    switchGeneratorTab("app");
    toast("🧩 Copied", "Website form data was copied into the app form for editing.", "success");
    setGeneratorStatus("Website form data copied into the app builder.");
  }

  function collectGeneratorPayload() {
    return {
      slug: generatorState.selectedSlug,
      website: collectWebsiteFormData(),
      app: collectAppFormData(),
    };
  }

  function collectWebsiteFormData() {
    const data = {};
    websiteFieldIds.forEach((field) => {
      data[field] = getValue(`gw_${field}`);
    });
    data.gallery = splitLines(getValue("gw_gallery"));
    data.videos = parsePipedList(getValue("gw_videos"), ["title", "url"]);
    data.programs = splitLines(getValue("gw_programs"));
    data.facilities = splitLines(getValue("gw_facilities"));
    data.achievements = parsePipedList(getValue("gw_achievements"), ["value", "label"]);
    data.staff = parsePipedList(getValue("gw_staff"), ["name", "role", "image", "bio"]);
    data.testimonials = parsePipedList(getValue("gw_testimonials"), ["name", "role", "quote"]);
    data.faqs = parsePipedList(getValue("gw_faqs"), ["question", "answer"]);
    data.extra_sections = parsePipedList(getValue("gw_extra_sections"), ["title", "body"]);
    data.contact = {
      address: getValue("gw_contact_address"),
      phone: getValue("gw_contact_phone"),
      email: getValue("gw_contact_email"),
      website: getValue("gw_contact_website"),
      map_url: getValue("gw_contact_map_url"),
    };
    data.social = collectSocial("gw");
    return data;
  }

  function collectAppFormData() {
    const data = {};
    appFieldIds.forEach((field) => {
      data[field] = getValue(`ga_${field}`);
    });
    data.gallery = splitLines(getValue("ga_gallery"));
    data.videos = parsePipedList(getValue("ga_videos"), ["title", "url"]);
    data.playlists = parsePipedList(getValue("ga_playlists"), ["title", "url", "description"]);
    data.programs = splitLines(getValue("ga_programs"));
    data.facilities = splitLines(getValue("ga_facilities"));
    data.highlights = parsePipedList(getValue("ga_highlights"), ["title", "body"]);
    data.quick_facts = parsePipedList(getValue("ga_quick_facts"), ["value", "label"]);
    data.notices = splitLines(getValue("ga_notices"));
    data.staff = parsePipedList(getValue("ga_staff"), ["name", "role", "image", "bio"]);
    data.contact = {
      address: getValue("ga_contact_address"),
      phone: getValue("ga_contact_phone"),
      email: getValue("ga_contact_email"),
      website: getValue("ga_contact_website"),
    };
    data.social = collectSocial("ga");
    return data;
  }

  function fillWebsiteForm(data) {
    websiteFieldIds.forEach((field) => setValue(`gw_${field}`, data?.[field] || (field === "theme_seed" ? "#355da8" : "")));
    setValue("gw_gallery", joinLines(data?.gallery));
    setValue("gw_videos", joinPipeLines(data?.videos, ["title", "url"]));
    setValue("gw_programs", joinLines(data?.programs));
    setValue("gw_facilities", joinLines(data?.facilities));
    setValue("gw_achievements", joinPipeLines(data?.achievements, ["value", "label"]));
    setValue("gw_staff", joinPipeLines(data?.staff, ["name", "role", "image", "bio"]));
    setValue("gw_testimonials", joinPipeLines(data?.testimonials, ["name", "role", "quote"]));
    setValue("gw_faqs", joinPipeLines(data?.faqs, ["question", "answer"]));
    setValue("gw_extra_sections", joinPipeLines(data?.extra_sections, ["title", "body"]));
    setValue("gw_contact_address", data?.contact?.address || "");
    setValue("gw_contact_phone", data?.contact?.phone || "");
    setValue("gw_contact_email", data?.contact?.email || "");
    setValue("gw_contact_website", data?.contact?.website || "");
    setValue("gw_contact_map_url", data?.contact?.map_url || "");
    fillSocial("gw", data?.social);
  }

  function fillAppForm(data) {
    appFieldIds.forEach((field) => setValue(`ga_${field}`, data?.[field] || (field === "theme_seed" ? "#355da8" : "")));
    setValue("ga_gallery", joinLines(data?.gallery));
    setValue("ga_videos", joinPipeLines(data?.videos, ["title", "url"]));
    setValue("ga_playlists", joinPipeLines(data?.playlists, ["title", "url", "description"]));
    setValue("ga_programs", joinLines(data?.programs));
    setValue("ga_facilities", joinLines(data?.facilities));
    setValue("ga_highlights", joinPipeLines(data?.highlights, ["title", "body"]));
    setValue("ga_quick_facts", joinPipeLines(data?.quick_facts, ["value", "label"]));
    setValue("ga_notices", joinLines(data?.notices));
    setValue("ga_staff", joinPipeLines(data?.staff, ["name", "role", "image", "bio"]));
    setValue("ga_contact_address", data?.contact?.address || "");
    setValue("ga_contact_phone", data?.contact?.phone || "");
    setValue("ga_contact_email", data?.contact?.email || "");
    setValue("ga_contact_website", data?.contact?.website || "");
    fillSocial("ga", data?.social);
  }

  function applyStudioPayload(data) {
    generatorState.studioData = data;
    generatorState.selectedSlug = data?.business?.slug || generatorState.selectedSlug;
    fillWebsiteForm(data?.website || {});
    fillAppForm(data?.app || {});
    renderGeneratorSelectedBusiness();
    renderGeneratorPaths();
    renderGeneratorBusinessList();
    syncGeneratorButtons();
  }

  function collectSocial(prefix) {
    return {
      facebook: getValue(`${prefix}_social_facebook`),
      instagram: getValue(`${prefix}_social_instagram`),
      youtube: getValue(`${prefix}_social_youtube`),
      twitter: getValue(`${prefix}_social_twitter`),
    };
  }

  function fillSocial(prefix, social) {
    setValue(`${prefix}_social_facebook`, social?.facebook || "");
    setValue(`${prefix}_social_instagram`, social?.instagram || "");
    setValue(`${prefix}_social_youtube`, social?.youtube || "");
    setValue(`${prefix}_social_twitter`, social?.twitter || "");
  }

  async function postGeneratorPayload(url) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectGeneratorPayload()),
    });
    const payload = await readJsonResponse(response);

    if (payload?.data) {
      applyStudioPayload(payload.data);
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: true });
    }
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Generator request failed.");
    }
    return payload.data;
  }

  window.changeGeneratorPage = function changeGeneratorPage(direction) {
    generatorState.page = Math.max(1, generatorState.page + Number(direction || 0));
    renderGeneratorBusinessList();
  };

  window.recheckGeneratorFilesystem = async function recheckGeneratorFilesystem() {
    await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: true });
    if (generatorState.selectedSlug) {
      await loadGeneratorBusiness(generatorState.selectedSlug, { silent: true });
    } else {
      renderGeneratorBusinessList();
    }
    toast("🔄 Rechecked", "Generator Studio paths were re-read from disk.", "success");
  };

  function setGeneratorBusy(isBusy) {
    generatorState.busy = Boolean(isBusy);
    syncGeneratorButtons();
  }

  function syncGeneratorButtons() {
    const hasBusiness = Boolean(generatorState.selectedSlug || state.selectedSlug || state.paymentSlug);
    ["generatorLoadBtn", "generatorSaveBtn", "generatorBuildWebsiteBtn", "generatorCopyBtn", "generatorBuildAppBtn"].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }
      const needsLoadedBusiness = id !== "generatorLoadBtn";
      element.disabled = generatorState.busy || (needsLoadedBusiness ? !generatorState.selectedSlug : !hasBusiness);
      element.classList.toggle("is-busy", generatorState.busy);
    });

    document.querySelectorAll("[data-generator-requires-business]").forEach((element) => {
      element.disabled = generatorState.busy || !generatorState.selectedSlug;
    });
  }

  function setGeneratorStatus(message) {
    const status = document.getElementById("generatorStatus");
    if (status) {
      status.textContent = message;
    }
  }

  function getValue(id) {
    return String(document.getElementById(id)?.value || "").trim();
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value || "";
    }
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parsePipedList(value, keys) {
    return splitLines(value).map((line) => {
      const parts = line.split("|").map((item) => item.trim());
      const next = {};
      keys.forEach((key, index) => {
        next[key] = parts[index] || "";
      });
      return next;
    });
  }

  function joinLines(values) {
    return Array.isArray(values) ? values.filter(Boolean).join("\n") : "";
  }

  function joinPipeLines(items, keys) {
    return Array.isArray(items)
      ? items
          .map((item) => keys.map((key) => String(item?.[key] || "").trim()).join(" | ").replace(/(\s\|\s)+$/g, ""))
          .filter(Boolean)
          .join("\n")
      : "";
  }

  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch {
      return { success: false, error: "Unexpected server response." };
    }
  }

  function escapeText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
