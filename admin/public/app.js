const FALLBACK_PLAN_CATALOG = {
  currency: "NPR",
  base_monthly_rate: 100,
  default_label: "monthly",
  plans: [
    {
      id: "monthly",
      label: "monthly",
      months: 1,
      discount_percent: 0,
      description: "1 month at the standard monthly rate.",
      amount: 100
    },
    {
      id: "yearly",
      label: "Yearly",
      months: 12,
      discount_percent: 10,
      description: "12 months with a 10% discount.",
      amount: 1080
    },
    {
      id: "six-months",
      label: "6 Months",
      months: 6,
      discount_percent: 5,
      description: "6 months with a 5% discount.",
      amount: 570
    }
  ]
};
const DEFAULT_PLAN = FALLBACK_PLAN_CATALOG.default_label;
const LEVELS = ["Pre-School", "School", "+2", "Diploma", "Bachelor", "Master", "PhD", "Certification"];
const FIELDS = [
  "Science",
  "Management",
  "Humanities",
  "Education",
  "Engineering",
  "Information Technology",
  "Computer Science",
  "Medical",
  "Nursing",
  "Pharmacy",
  "Public Health",
  "Law",
  "Agriculture",
  "Forestry",
  "Hospitality",
  "Tourism",
  "Arts",
  "Design"
];
const FACILITIES = ["Library", "Science Lab", "Computer Lab", "Canteen", "Sports Ground", "Hostel", "Auditorium", "Parking", "Medical Room", "Wi-Fi Campus"];
const TYPE_EMOJI = {
  School: "🏫",
  College: "🎓",
  University: "🏛️",
  "TVET Institute": "🔧",
  "Training Center": "📚",
  "Coaching Center": "✏️"
};
const APP_LABELS = {
  administration: "Administration",
  reports: "Reports",
  generator: "Generator Studio",
  source: "Source App",
  db: "DB Manager",
  notes: "Make Notes",
  config: "Config App",
  email: "Mail Center",
  calendar: "Calendar",
  staff: "Staff Manager",
  ids: "ID Manager",
  backup: "Backup Vault"
};
const LOCATION_CATALOG = globalThis.ADMIN_LOCATION_CATALOG || { provinces: [], zones: [], districts: [] };
const PROVINCES = Array.isArray(LOCATION_CATALOG.provinces) ? LOCATION_CATALOG.provinces : [];
const ZONES = Array.isArray(LOCATION_CATALOG.zones) ? LOCATION_CATALOG.zones : [];
const DISTRICT_CATALOG = Array.isArray(LOCATION_CATALOG.districts) ? LOCATION_CATALOG.districts : [];
const PROVINCE_NAMES = Object.fromEntries(PROVINCES.map((province) => [String(province.id), String(province.name)]));
const ZONE_NAMES = Object.fromEntries(ZONES.map((zone) => [String(zone.id), String(zone.name)]));
const LOCATION_TOTALS = Object.freeze({
  provinces: PROVINCES.length,
  zones: ZONES.length,
  districts: DISTRICT_CATALOG.length
});
const NEPAL_LOCATION_MINIMUMS = Object.freeze({
  zones: 14,
  districts: 77
});
const DISTRICT_LOOKUP = new Map(
  DISTRICT_CATALOG.map((district) => [String(district.name || "").trim().toLowerCase(), district])
);
const LIST_PAGE_SIZE = 100;
const LOADING_HIDE_DELAY_MS = 140;

const state = {
  businesses: [],
  directoryRevision: 0,
  filteredCache: {},
  pagination: {
    dashboard: 1,
    edit: 1,
    payments: 1
  },
  currentView: "dashboard",
  editorMode: "add",
  businessSaveBusy: false,
  businessSaveLabel: "",
  selectedSlug: null,
  paymentSlug: null,
  paymentRecord: null,
  paymentEditingId: null,
  modalAction: null,
  toastTimer: null,
  planCatalog: FALLBACK_PLAN_CATALOG,
  filters: {
    dashboard: { search: "", province: "", district: "", status: "all" },
    edit: { search: "", province: "", district: "", status: "all" },
    payments: { search: "", province: "", district: "", status: "all" }
  },
  shell: {
    activeApp: null,
    loading: null,
    loadingToken: 0
  },
  // Password protection removed - always authenticated
  reports: {
    period: "monthly",
    selectedYear: "",
    data: { rows: [], totals: {} },
    selectedKey: "",
    expenses: [],
    expenseEditingId: null,
    cache: {},
    inflight: {},
    token: 0
  },
  source: {
    snapshot: null
  },
  db: {
    snapshot: null
  },
  config: {
    snapshot: null
  },
  notes: {
    items: [],
    selectedId: null
  },
  email: {
    snapshot: null,
    selectedRecipients: [],
    sending: false,
    prefillRecipients: []
  },
  calendar: {
    snapshot: null,
    currentMonth: "",
    selectedDate: "",
    selectedEventId: null
  },
  staff: {
    snapshot: null,
    selectedId: null,
    paymentEditingId: null
  },
  idManager: {
    selectedSlug: null
  },
  backups: {
    selectedId: null,
    snapshot: null
  },
  formTags: {
    programs: [],
    tags: []
  }
};
window.adminState = state;

document.addEventListener("DOMContentLoaded", init);

let loadingHideTimer = 0;
let adminPaneResizeObserver = null;
let adminPaneSyncFrame = 0;
let desktopIconDrag = null;
const DESKTOP_ICON_STORAGE_KEY = "edudata-admin-desktop-icons";
const DESKTOP_ICON_GRID = Object.freeze({
  left: 18,
  top: 18,
  width: 108,
  height: 98,
  iconWidth: 92,
  iconHeight: 84
});

function delay(ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampPage(page, totalPages) {
  const maxPage = Math.max(1, Number.parseInt(totalPages, 10) || 1);
  const nextPage = Number.parseInt(page, 10) || 1;
  return Math.min(maxPage, Math.max(1, nextPage));
}

function getFilterSignature(key) {
  const filters = state.filters[key] || {};
  return [
    state.directoryRevision,
    filters.search || "",
    filters.province || "",
    filters.district || "",
    filters.status || "all"
  ].join("|");
}

function resetListPage(key) {
  state.pagination[key] = 1;
}

function resetAllListPages() {
  state.pagination.dashboard = 1;
  state.pagination.edit = 1;
  state.pagination.payments = 1;
}

function getPageCount(totalItems) {
  return Math.max(1, Math.ceil((Number(totalItems) || 0) / LIST_PAGE_SIZE));
}

function getPageSlice(items, key) {
  const totalItems = items.length;
  const totalPages = getPageCount(totalItems);
  const currentPage = clampPage(state.pagination[key] || 1, totalPages);
  state.pagination[key] = currentPage;
  const startIndex = (currentPage - 1) * LIST_PAGE_SIZE;
  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex: Math.min(startIndex + LIST_PAGE_SIZE, totalItems),
    pageItems: items.slice(startIndex, startIndex + LIST_PAGE_SIZE)
  };
}

function renderPager(containerId, key, totalItems) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  const totalPages = getPageCount(totalItems);
  const currentPage = clampPage(state.pagination[key] || 1, totalPages);
  state.pagination[key] = currentPage;

  if (totalItems <= LIST_PAGE_SIZE) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  const startIndex = (currentPage - 1) * LIST_PAGE_SIZE + 1;
  const endIndex = Math.min(currentPage * LIST_PAGE_SIZE, totalItems);
  container.classList.remove("hidden");
  container.innerHTML = `
    <button type="button" class="pager-btn" onclick="changeListPage('${key}', -1)" ${currentPage === 1 ? "disabled" : ""}>Prev</button>
    <div class="pagination-copy">Showing ${startIndex}-${endIndex} of ${totalItems} · page ${currentPage}/${totalPages}</div>
    <button type="button" class="pager-btn" onclick="changeListPage('${key}', 1)" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

function renderLoadingOverlay() {
  const overlay = document.getElementById("appLoadingOverlay");
  if (!overlay) {
    return;
  }

  const loading = state.shell.loading;
  overlay.classList.toggle("hidden", !loading);
  overlay.setAttribute("aria-hidden", loading ? "false" : "true");
  if (!loading) {
    return;
  }

  setElementText("appLoadingTitle", loading.title || "Opening app");
  setElementText("appLoadingMessage", loading.message || "Preparing workspace...");
  setElementText("appLoadingPercent", `${Math.max(0, Math.min(100, Math.round(loading.percent || 0)))}%`);
  setElementText("appLoadingDetail", loading.detail || "Please wait...");

  const bar = document.getElementById("appLoadingBar");
  if (bar) {
    bar.style.width = `${Math.max(0, Math.min(100, Math.round(loading.percent || 0)))}%`;
  }
}

// Password protection removed - no auth overlay needed
// function renderAuthOverlay() { ... }

// Password protection removed - always authenticated
async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return { success: false, error: "Unexpected server response." };
  }
}

async function bootstrapAdminDesktop() {
  // Password protection removed - boot directly to desktop (load plans, directory, apps)
  await loadPlanCatalog();
  await Promise.allSettled([
    refreshDirectory({ reloadReport: false, reloadPaymentRecord: false }),
    loadRevenueReport("monthly", { force: true }),
    loadExpenses({ silent: true }),
    loadSourceStatus({ silent: true }),
    loadDbStatus({ silent: true }),
    refreshNotes()
  ]);
}

// Password protection removed - login/logout deleted

function scrollContainerToTop(element, behavior = "auto") {
  if (!element) {
    return;
  }

  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: 0, behavior });
    return;
  }

  element.scrollTop = 0;
}

function scrollAdminSelectionToTop(view = state.currentView) {
  if (view === "editor") {
    scrollContainerToTop(document.getElementById("editorFormShell"));
    return;
  }

  if (view === "payments") {
    scrollContainerToTop(document.getElementById("paymentDetailShell"));
  }
}

function scrollPagedListToTop(key) {
  if (key === "dashboard") {
    scrollContainerToTop(document.querySelector("#dashboardView .table-wrap"));
    return;
  }

  if (key === "edit") {
    scrollContainerToTop(document.getElementById("editList"));
    return;
  }

  if (key === "payments") {
    scrollContainerToTop(document.querySelector("#paymentsView .table-wrap"));
  }
}

function queueAdministrationPaneSync() {
  if (adminPaneSyncFrame) {
    return;
  }

  adminPaneSyncFrame = window.requestAnimationFrame(() => {
    adminPaneSyncFrame = 0;
    syncAdministrationPaneHeight();
  });
}

function getActiveAdministrationLayout() {
  if (state.currentView !== "editor" && state.currentView !== "payments") {
    return null;
  }

  const activeView = document.getElementById(`${state.currentView}View`);
  return activeView ? activeView.querySelector(".editor-layout, .payments-layout") : null;
}

function syncAdministrationPaneHeight() {
  const mainContent = document.getElementById("mainContent");
  const app = document.getElementById("administrationApp");
  if (!mainContent || !app || app.classList.contains("hidden")) {
    return;
  }

  let nextHeight = Math.max(420, mainContent.clientHeight - 12);
  let nextOffset = 0;
  const layout = getActiveAdministrationLayout();
  if (layout) {
    const mainRect = mainContent.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    nextOffset = Math.max(0, layoutRect.top - mainRect.top);
    const remainingHeight = mainContent.clientHeight - nextOffset - 6;
    nextHeight = Math.max(420, remainingHeight);
  }

  app.style.setProperty("--admin-pane-height", `${nextHeight}px`);
  app.style.setProperty("--admin-pane-offset", `${nextOffset}px`);
}

function bindAdministrationLayoutObserver() {
  const mainContent = document.getElementById("mainContent");
  if (!mainContent) {
    return;
  }

  window.addEventListener("resize", queueAdministrationPaneSync);
  mainContent.addEventListener("scroll", queueAdministrationPaneSync, { passive: true });

  if ("ResizeObserver" in window) {
    adminPaneResizeObserver = new ResizeObserver(() => {
      queueAdministrationPaneSync();
    });
    adminPaneResizeObserver.observe(mainContent);
  }
}

function beginLoadingSession(appName, title, message) {
  if (loadingHideTimer) {
    window.clearTimeout(loadingHideTimer);
    loadingHideTimer = 0;
  }

  const token = state.shell.loadingToken + 1;
  state.shell.loadingToken = token;
  const session = {
    token,
    appName,
    title,
    message,
    detail: "Initializing...",
    percent: 0,
    isCurrent() {
      return state.shell.loadingToken === token;
    },
    update(percent, nextMessage, detail) {
      if (!this.isCurrent()) {
        return;
      }

      this.percent = percent;
      if (typeof nextMessage === "string" && nextMessage.trim()) {
        this.message = nextMessage;
      }
      if (typeof detail === "string") {
        this.detail = detail;
      }
      renderLoadingOverlay();
    },
    finish(nextMessage, detail) {
      if (!this.isCurrent()) {
        return;
      }

      if (typeof nextMessage === "string" && nextMessage.trim()) {
        this.message = nextMessage;
      }
      if (typeof detail === "string") {
        this.detail = detail;
      }
      this.percent = 100;
      renderLoadingOverlay();

      loadingHideTimer = window.setTimeout(() => {
        if (state.shell.loadingToken !== token) {
          return;
        }
        loadingHideTimer = 0;
        state.shell.loading = null;
        renderLoadingOverlay();
      }, LOADING_HIDE_DELAY_MS);
    },
    cancel() {
      if (state.shell.loadingToken !== token) {
        return;
      }
      if (loadingHideTimer) {
        window.clearTimeout(loadingHideTimer);
        loadingHideTimer = 0;
      }
      state.shell.loadingToken += 1;
      state.shell.loading = null;
      renderLoadingOverlay();
    }
  };
  state.shell.loading = session;
  renderLoadingOverlay();

  return session;
}

async function init() {
  buildChips("levelChips", LEVELS, "level");
  buildChips("fieldChips", FIELDS, "field");
  buildChips("facilityChips", FACILITIES, "facility");
  populateProvinceSelect("dashProvince", "All provinces");
  populateProvinceSelect("editProvince", "All provinces");
  populateProvinceSelect("payProvince", "All provinces");
  populateProvinceSelect("f_province", "Select province");
  populateZoneSelect("f_zone", "", "", "Select zone");
  populateDistrictSelect("dashDistrict", "", "", "", "All districts");
  populateDistrictSelect("editDistrict", "", "", "", "All districts");
  populateDistrictSelect("payDistrict", "", "", "", "All districts");
  populateDistrictSelect("f_district", "", "", "", "Select district");
  bindEvents();
  bindAdministrationLayoutObserver();
  resetBusinessForm();
  resetPaymentForm();
  resetExpenseForm();
  validateLocationCatalogCoverage();
  showDashboard();
  renderShell();
  initDesktopIcons();
  startClock();
  startCountdownTicker();
  // Password protection removed - boot directly
  await bootstrapAdminDesktop();
}

function bindEvents() {
  document.addEventListener("contextmenu", (event) => {
    if (typeof window.handleDesktopContextMenu === "function") {
      window.handleDesktopContextMenu(event);
    } else {
      event.preventDefault();
    }
  });

  // Password protection removed - authForm deleted

  document.getElementById("businessForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveBusiness();
  });
  document.getElementById("paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renewSelectedBusiness();
  });
  document.getElementById("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveExpense();
  });
  document.getElementById("reportBucketSelect").addEventListener("change", (event) => {
    selectReportBucket(event.target.value);
  });
  document.getElementById("reportYearSelect").addEventListener("change", (event) => {
    selectReportYear(event.target.value);
  });

  document.getElementById("f_name").addEventListener("input", autoSlug);
  document.getElementById("f_slug").addEventListener("input", () => {
    document.getElementById("f_slug").dataset.manual = document.getElementById("f_slug").value ? "true" : "false";
    updateSlugPreview();
  });
  document.getElementById("f_province").addEventListener("change", () => {
    const nextProvince = valueOf("f_province");
    const currentZone = valueOf("f_zone");
    const zoneOptions = getZoneOptions(nextProvince);
    const zoneStillValid = !currentZone || zoneOptions.some((zone) => zone.id === currentZone);
    populateZoneSelect("f_zone", nextProvince, zoneStillValid ? currentZone : "", "Select zone");
    populateDistrictSelect("f_district", nextProvince, zoneStillValid ? currentZone : "", "", "Select district");
    updateLocationCatalogSummary();
  });
  document.getElementById("f_zone").addEventListener("change", () => {
    populateDistrictSelect("f_district", valueOf("f_province"), valueOf("f_zone"), "", "Select district");
    updateLocationCatalogSummary();
  });
  document.getElementById("f_district").addEventListener("change", () => {
    const districtRecord = DISTRICT_LOOKUP.get(valueOf("f_district").toLowerCase());
    if (!districtRecord) {
      updateLocationCatalogSummary();
      return;
    }
    if (!valueOf("f_province")) {
      document.getElementById("f_province").value = String(districtRecord.province_id || "");
      populateZoneSelect("f_zone", valueOf("f_province"), valueOf("f_zone"), "Select zone");
    }
    if (!valueOf("f_zone")) {
      document.getElementById("f_zone").value = String(districtRecord.zone_id || "");
    }
    updateLocationCatalogSummary();
  });
  document.getElementById("f_plan").addEventListener("change", () => {
    syncPlanAmount("f_plan", "f_amount");
    updateSubscriptionPreview();
  });
  document.getElementById("p_plan").addEventListener("change", () => {
    syncPlanAmount("p_plan", "p_amount");
  });

  ["f_plan", "f_payment_status", "f_paid_at", "f_amount", "f_currency", "f_payment_method", "f_payment_reference"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateSubscriptionPreview);
    document.getElementById(id).addEventListener("change", updateSubscriptionPreview);
  });

  bindFilter("dashboard", "dashSearch", "dashProvince", "dashDistrict", "dashStatus", renderDashboard);
  bindFilter("edit", "editSearch", "editProvince", "editDistrict", "editStatus", renderEditList);
  bindFilter("payments", "paySearch", "payProvince", "payDistrict", "payStatus", renderPayments);

  document.getElementById("programInput").addEventListener("keydown", (event) => handleTagInput(event, "programs"));
  document.getElementById("tagInput").addEventListener("keydown", (event) => handleTagInput(event, "tags"));

  document.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) {
      chip.classList.toggle("selected");
      return;
    }

    const removeTag = event.target.closest("[data-remove-tag]");
    if (removeTag) {
      removeTagValue(removeTag.dataset.group, removeTag.dataset.removeTag);
      return;
    }

    const trigger = event.target.closest("[data-menu-trigger]");
    if (trigger) {
      toggleMenu(trigger.dataset.menuTrigger);
      return;
    }

    if (!event.target.closest(".menu-wrap")) {
      closeMenus();
    }
  });
}

function initDesktopIcons() {
  const workspace = document.querySelector(".desktop-workspace");
  const container = document.querySelector(".desktop-icons");
  if (!workspace || !container) {
    return;
  }

  const icons = [...container.querySelectorAll("[data-desktop-icon]")];
  if (!icons.length) {
    return;
  }

  const savedLayout = readDesktopIconLayout();
  applyDesktopIconLayout(icons, savedLayout, workspace);
  icons.forEach((icon) => {
    icon.addEventListener("pointerdown", beginDesktopIconDrag);
    icon.addEventListener("click", (event) => {
      if (icon.dataset.suppressClick === "true") {
        event.preventDefault();
        event.stopPropagation();
        icon.dataset.suppressClick = "false";
      }
    });
  });

  document.addEventListener("pointermove", moveDesktopIconDrag);
  document.addEventListener("pointerup", endDesktopIconDrag);
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 760) {
      return;
    }
    applyDesktopIconLayout(icons, readDesktopIconLayout(), workspace);
  });
}

function readDesktopIconLayout() {
  try {
    return JSON.parse(window.localStorage.getItem(DESKTOP_ICON_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeDesktopIconLayout(layout) {
  try {
    window.localStorage.setItem(DESKTOP_ICON_STORAGE_KEY, JSON.stringify(layout || {}));
  } catch {}
}

function applyDesktopIconLayout(icons, layout, workspace) {
  const bounds = workspace.getBoundingClientRect();
  icons.forEach((icon, index) => {
    const key = icon.dataset.desktopIcon || `icon-${index}`;
    const defaultPosition = {
      left: DESKTOP_ICON_GRID.left,
      top: DESKTOP_ICON_GRID.top + index * DESKTOP_ICON_GRID.height
    };
    const nextPosition = clampDesktopIconPosition(layout?.[key] || defaultPosition, bounds);
    icon.style.left = `${nextPosition.left}px`;
    icon.style.top = `${nextPosition.top}px`;
  });
}

function beginDesktopIconDrag(event) {
  if (window.innerWidth <= 760) {
    return;
  }

  const icon = event.currentTarget;
  const workspace = document.querySelector(".desktop-workspace");
  if (!icon || !workspace) {
    return;
  }

  const iconRect = icon.getBoundingClientRect();
  desktopIconDrag = {
    key: icon.dataset.desktopIcon || "",
    icon,
    workspace,
    offsetX: event.clientX - iconRect.left,
    offsetY: event.clientY - iconRect.top,
    moved: false
  };
  icon.classList.add("dragging");
  icon.setPointerCapture?.(event.pointerId);
}

function moveDesktopIconDrag(event) {
  if (!desktopIconDrag) {
    return;
  }

  const { icon, workspace, offsetX, offsetY } = desktopIconDrag;
  const workspaceRect = workspace.getBoundingClientRect();
  const nextPosition = clampDesktopIconPosition(
    {
      left: event.clientX - workspaceRect.left - offsetX,
      top: event.clientY - workspaceRect.top - offsetY
    },
    workspaceRect
  );

  desktopIconDrag.moved = true;
  icon.style.left = `${nextPosition.left}px`;
  icon.style.top = `${nextPosition.top}px`;
}

function endDesktopIconDrag() {
  if (!desktopIconDrag) {
    return;
  }

  const { icon, key, workspace } = desktopIconDrag;
  const workspaceRect = workspace.getBoundingClientRect();
  const snappedPosition = snapDesktopIconPosition(
    {
      left: Number.parseFloat(icon.style.left) || DESKTOP_ICON_GRID.left,
      top: Number.parseFloat(icon.style.top) || DESKTOP_ICON_GRID.top
    },
    workspaceRect
  );

  icon.style.left = `${snappedPosition.left}px`;
  icon.style.top = `${snappedPosition.top}px`;
  icon.classList.remove("dragging");
  icon.dataset.suppressClick = desktopIconDrag.moved ? "true" : "false";
  const layout = readDesktopIconLayout();
  layout[key] = snappedPosition;
  writeDesktopIconLayout(layout);
  desktopIconDrag = null;
}

function snapDesktopIconPosition(position, bounds) {
  const snapped = {
    left:
      DESKTOP_ICON_GRID.left +
      Math.round((Number(position.left) - DESKTOP_ICON_GRID.left) / DESKTOP_ICON_GRID.width) *
        DESKTOP_ICON_GRID.width,
    top:
      DESKTOP_ICON_GRID.top +
      Math.round((Number(position.top) - DESKTOP_ICON_GRID.top) / DESKTOP_ICON_GRID.height) *
        DESKTOP_ICON_GRID.height
  };
  return clampDesktopIconPosition(snapped, bounds);
}

function clampDesktopIconPosition(position, bounds) {
  const maxLeft = Math.max(DESKTOP_ICON_GRID.left, (bounds?.width || 0) - DESKTOP_ICON_GRID.iconWidth - 12);
  const maxTop = Math.max(DESKTOP_ICON_GRID.top, (bounds?.height || 0) - DESKTOP_ICON_GRID.iconHeight - 12);
  return {
    left: Math.min(maxLeft, Math.max(DESKTOP_ICON_GRID.left, Number(position.left) || DESKTOP_ICON_GRID.left)),
    top: Math.min(maxTop, Math.max(DESKTOP_ICON_GRID.top, Number(position.top) || DESKTOP_ICON_GRID.top))
  };
}

function bindFilter(key, searchId, provinceId, districtId, statusId, renderFn) {
  document.getElementById(searchId).addEventListener("input", (event) => {
    state.filters[key].search = event.target.value.trim();
    resetListPage(key);
    renderFn();
  });

  document.getElementById(provinceId).addEventListener("change", (event) => {
    state.filters[key].province = event.target.value;
    state.filters[key].district = "";
    refreshFilterDistrictOptions(key);
    resetListPage(key);
    renderFn();
  });

  document.getElementById(districtId).addEventListener("change", (event) => {
    state.filters[key].district = event.target.value;
    resetListPage(key);
    renderFn();
  });

  document.getElementById(statusId).addEventListener("change", (event) => {
    state.filters[key].status = event.target.value;
    resetListPage(key);
    renderFn();
  });
}

function buildChips(containerId, items, group) {
  document.getElementById(containerId).innerHTML = items
    .map((item) => `<button type="button" class="chip" data-group="${group}" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`)
    .join("");
}

function populateProvinceSelect(selectId, blankLabel) {
  const select = document.getElementById(selectId);
  select.innerHTML =
    `<option value="">${blankLabel}</option>` +
    PROVINCES.map((province) => `<option value="${province.id}">${province.name}</option>`).join("");
}

function populateZoneSelect(selectId, province, currentValue, blankLabel) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const options = getZoneOptions(province);
  const finalOptions =
    currentValue && !options.some((zone) => zone.id === currentValue)
      ? [...options, { id: currentValue, name: ZONE_NAMES[currentValue] || currentValue }]
      : options;
  select.innerHTML =
    `<option value="">${blankLabel}</option>` +
    finalOptions.map((zone) => `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`).join("");
  select.value = currentValue || "";
}

function populateDistrictSelect(selectId, province, zone, currentValue, blankLabel, sourceBusinesses) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const options = getDistrictOptions({ province, zone, sourceBusinesses });
  const finalOptions = currentValue && !options.includes(currentValue) ? [...options, currentValue].sort() : options;
  select.innerHTML =
    `<option value="">${blankLabel}</option>` +
    finalOptions.map((district) => `<option value="${escapeHtml(district)}">${escapeHtml(district)}</option>`).join("");
  select.value = currentValue || "";
}

function getZoneOptions(province = "") {
  const allowedZoneIds = new Set(
    DISTRICT_CATALOG
      .filter((district) => !province || String(district.province_id || "") === String(province || ""))
      .map((district) => String(district.zone_id || "").trim())
      .filter(Boolean)
  );

  return ZONES.filter((zone) => allowedZoneIds.has(zone.id));
}

function getOfficialDistrictOptions({ province = "", zone = "" } = {}) {
  return DISTRICT_CATALOG
    .filter((district) => {
      if (province && String(district.province_id || "") !== String(province)) {
        return false;
      }
      if (zone && String(district.zone_id || "") !== String(zone)) {
        return false;
      }
      return true;
    })
    .map((district) => district.name)
    .sort((left, right) => left.localeCompare(right));
}

function getDistrictOptions({ province = "", zone = "", sourceBusinesses = null } = {}) {
  const official = getOfficialDistrictOptions({ province, zone });

  const custom = (sourceBusinesses || state.businesses)
    .filter((business) => {
      if (province && String(business.province || "") !== String(province)) {
        return false;
      }
      if (zone && String(business.zone || "") !== String(zone)) {
        return false;
      }
      return true;
    })
    .map((business) => String(business.district || "").trim())
    .filter(Boolean);

  return [...new Set([...official, ...custom])].sort((left, right) => left.localeCompare(right));
}

function updateLocationCatalogSummary() {
  const summary = document.getElementById("locationCatalogSummary");
  if (!summary) {
    return;
  }

  const provinceId = valueOf("f_province");
  const zoneId = valueOf("f_zone");
  const provinceName = PROVINCE_NAMES[provinceId] || "";
  const zoneName = ZONE_NAMES[zoneId] || "";
  const visibleZoneCount = getZoneOptions(provinceId).length;
  const visibleDistrictCount = getOfficialDistrictOptions({ province: provinceId, zone: zoneId }).length;

  if (!provinceId) {
    summary.textContent = `Full Nepal catalog loaded: ${LOCATION_TOTALS.zones} zones and ${LOCATION_TOTALS.districts} districts. Leave province blank to browse the complete list.`;
    return;
  }

  if (!zoneId) {
    summary.textContent = `${provinceName} currently shows ${visibleZoneCount} zone${visibleZoneCount === 1 ? "" : "s"} and ${visibleDistrictCount} district${visibleDistrictCount === 1 ? "" : "s"}. Full catalog: ${LOCATION_TOTALS.zones} zones and ${LOCATION_TOTALS.districts} districts.`;
    return;
  }

  summary.textContent = `${zoneName}, ${provinceName} currently shows ${visibleDistrictCount} district${visibleDistrictCount === 1 ? "" : "s"}. Full catalog: ${LOCATION_TOTALS.zones} zones and ${LOCATION_TOTALS.districts} districts.`;
}

function validateLocationCatalogCoverage() {
  const issues = [];
  if (LOCATION_TOTALS.zones < NEPAL_LOCATION_MINIMUMS.zones) {
    issues.push(`zones: expected at least ${NEPAL_LOCATION_MINIMUMS.zones}, found ${LOCATION_TOTALS.zones}`);
  }
  if (LOCATION_TOTALS.districts < NEPAL_LOCATION_MINIMUMS.districts) {
    issues.push(`districts: expected at least ${NEPAL_LOCATION_MINIMUMS.districts}, found ${LOCATION_TOTALS.districts}`);
  }

  if (!issues.length) {
    return;
  }

  const message = `Location catalog looks incomplete (${issues.join("; ")}).`;
  console.warn(message);
  toast("⚠️ Location Catalog", message, "error");
}

function refreshFilterDistrictOptions(key) {
  const mapping = {
    dashboard: ["dashDistrict", "All districts"],
    edit: ["editDistrict", "All districts"],
    payments: ["payDistrict", "All districts"]
  };
  const [selectId, label] = mapping[key];
  populateDistrictSelect(selectId, state.filters[key].province, "", state.filters[key].district, label, state.businesses);
}

async function loadPlanCatalog() {
  try {
    const response = await fetch("/api/meta/plans");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load plan catalog.");
    }
    state.planCatalog = normalizePlanCatalog(payload.data);
  } catch {
    state.planCatalog = normalizePlanCatalog(FALLBACK_PLAN_CATALOG);
  }

  populatePlanSelect("f_plan");
  populatePlanSelect("p_plan");
}

function normalizePlanCatalog(catalog) {
  const baseMonthlyRate = Number(catalog?.base_monthly_rate) || 100;
  const currency = String(catalog?.currency || "NPR").trim() || "NPR";
  const plans = Array.isArray(catalog?.plans)
    ? catalog.plans
        .map((plan, index) => normalizePlanRecord(plan, index, currency, baseMonthlyRate))
        .filter(Boolean)
    : [];
  const fallbackPlans = FALLBACK_PLAN_CATALOG.plans.map((plan, index) =>
    normalizePlanRecord(plan, index, currency, baseMonthlyRate)
  );
  const normalizedPlans = plans.length ? plans : fallbackPlans;

  return {
    currency,
    base_monthly_rate: baseMonthlyRate,
    default_label: String(catalog?.default_label || normalizedPlans[0]?.label || DEFAULT_PLAN).trim(),
    plans: normalizedPlans
  };
}

function normalizePlanRecord(plan, index, currency, baseMonthlyRate) {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const label = String(plan.label || `Plan ${index + 1}`).trim();
  const months = Math.max(1, Number.parseInt(plan.months, 10) || 12);
  const discountPercent = Math.min(100, Math.max(0, Number(plan.discount_percent) || 0));

  return {
    id: slugify(plan.id || label) || `plan-${index + 1}`,
    label,
    months,
    discount_percent: discountPercent,
    description: String(plan.description || "").trim(),
    currency,
    amount: Number((baseMonthlyRate * months * (1 - discountPercent / 100)).toFixed(2))
  };
}

function getPlanList() {
  return state.planCatalog?.plans?.length ? state.planCatalog.plans : FALLBACK_PLAN_CATALOG.plans;
}

function getDefaultPlanLabel() {
  return state.planCatalog?.default_label || getPlanList()[0]?.label || DEFAULT_PLAN;
}

function getPlanDefinition(planLabel) {
  const normalized = slugify(planLabel);
  if (!normalized) {
    return getPlanList()[0] || null;
  }

  return (
    getPlanList().find(
      (plan) =>
        plan.id === normalized ||
        slugify(plan.label) === normalized ||
        normalized.includes(plan.id) ||
        normalized.includes(slugify(plan.label))
    ) ||
    getPlanList()[0] ||
    null
  );
}

function hasCatalogPlan(planLabel) {
  const normalized = slugify(planLabel);
  if (!normalized) {
    return false;
  }

  return getPlanList().some(
    (plan) => plan.id === normalized || slugify(plan.label) === normalized
  );
}

function populatePlanSelect(selectId) {
  const select = document.getElementById(selectId);
  const currentValue = select.value.trim();
  select.innerHTML = getPlanList()
    .map(
      (plan) =>
        `<option value="${escapeHtml(plan.label)}">${escapeHtml(
          `${plan.label} · ${plan.currency} ${plan.amount.toLocaleString()}`
        )}</option>`
    )
    .join("");
  setPlanSelectValue(selectId, currentValue || getDefaultPlanLabel());
}

function setPlanSelectValue(selectId, planLabel) {
  const select = document.getElementById(selectId);
  const nextValue = String(planLabel || "").trim() || getDefaultPlanLabel();
  const matchingOption = [...select.options].find(
    (option) => slugify(option.value) === slugify(nextValue)
  );

  if (!matchingOption && nextValue) {
    const option = document.createElement("option");
    option.value = nextValue;
    option.textContent = nextValue;
    select.append(option);
  }

  select.value = matchingOption?.value || nextValue;
}

function syncPlanAmount(planSelectId, amountInputId, options = {}) {
  const { force = true } = options;
  const plan = getPlanDefinition(valueOf(planSelectId));
  const amountInput = document.getElementById(amountInputId);
  if (!plan || !amountInput) {
    return;
  }

  if (force || !amountInput.value.trim()) {
    amountInput.value = String(plan.amount);
  }
}

async function refreshDirectory(options = {}) {
  const {
    reloadReport = true,
    reloadPaymentRecord = Boolean(state.paymentSlug && state.currentView === "payments"),
    loading = null,
    recheck = false
  } = options;
  setStatus("Loading directory data...", "");
  try {
    if (loading) {
      loading.update(8, "Reading directory file...", "Fetching business data");
      await delay(0);
    }

    const response = await fetch(recheck ? "/api/list?recheck=1" : "/api/list");
    if (loading) {
      loading.update(24, "Parsing directory data...", "Preparing cached records");
      await delay(0);
    }

    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load directory.");
    }

    state.businesses = payload.data || [];
    state.directoryRevision += 1;
    state.filteredCache = {};
    if (state.selectedSlug && !getBusinessBySlug(state.selectedSlug)) {
      state.selectedSlug = null;
    }
    if (state.paymentSlug && !getBusinessBySlug(state.paymentSlug)) {
      state.paymentSlug = null;
      state.paymentRecord = null;
    }
    if (loading) {
      loading.update(42, "Refreshing filters and counts...", "Updating page data");
      await delay(0);
    }
    refreshFilterDistrictOptions("dashboard");
    refreshFilterDistrictOptions("edit");
    refreshFilterDistrictOptions("payments");
    if (loading) {
      loading.update(58, "Updating statistics...", "Summarizing directory state");
      await delay(0);
    }
    updateStats();
    if (loading) {
      loading.update(70, "Rendering dashboard...", "Preparing list view");
      await delay(0);
    }
    renderDashboard();
    if (loading) {
      loading.update(82, "Rendering edit browser...", "Preparing editor list");
      await delay(0);
    }
    renderEditList();
    if (loading) {
      loading.update(92, "Rendering payments...", "Preparing payment center");
      await delay(0);
    }
    renderPayments();
    updateSelectedSummary();
    updatePaymentFocus();
    if (loading) {
      loading.finish("Directory ready.", `${state.businesses.length} businesses loaded`);
    }
    setStatus("Directory loaded.", `${state.businesses.length} businesses`);

    const followUpTasks = [];
    if (reloadReport) {
      followUpTasks.push(loadRevenueReport(state.reports.period, { force: true, silent: true }));
    }
    if (reloadPaymentRecord && state.paymentSlug) {
      followUpTasks.push(loadPaymentRecord(state.paymentSlug, true));
    }
    if (followUpTasks.length) {
      await Promise.allSettled(followUpTasks);
    }
  } catch (error) {
    if (loading && loading.isCurrent()) {
      loading.finish("Directory load failed.", error.message || "Using cached data.");
    }
    toast("❌ Load Error", error.message, "error");
    setStatus("Unable to load directory.", "");
  }
}

function renderShell() {
  const activeApp = state.shell.activeApp;
  document.getElementById("administrationApp").classList.toggle("hidden", activeApp !== "administration");
  document.getElementById("reportsApp").classList.toggle("hidden", activeApp !== "reports");
  document.getElementById("generatorApp").classList.toggle("hidden", activeApp !== "generator");
  document.getElementById("emailApp").classList.toggle("hidden", activeApp !== "email");
  document.getElementById("calendarApp").classList.toggle("hidden", activeApp !== "calendar");
  document.getElementById("staffApp").classList.toggle("hidden", activeApp !== "staff");
  document.getElementById("idManagerApp").classList.toggle("hidden", activeApp !== "ids");
  document.getElementById("backupApp").classList.toggle("hidden", activeApp !== "backup");
  document.getElementById("sourceApp").classList.toggle("hidden", activeApp !== "source");
  document.getElementById("dbApp").classList.toggle("hidden", activeApp !== "db");
  document.getElementById("configApp").classList.toggle("hidden", activeApp !== "config");
  document.getElementById("notesApp").classList.toggle("hidden", activeApp !== "notes");
  document.getElementById("taskbarAppLabel").textContent = activeApp ? APP_LABELS[activeApp] : "Desktop";
}

function openApp(appName) {
  // Password protection removed - always allow
  void openAppAsync(appName);
}

async function openAppAsync(appName) {
  const title = APP_LABELS[appName] || "App";
  const loading = beginLoadingSession(appName, `Opening ${title}`, "Preparing workspace...");

  try {
    switch (appName) {
      case "administration":
        loading.update(8, "Reading directory files...", "Fetching business data");
        await refreshDirectory({
          reloadReport: false,
          reloadPaymentRecord: false,
          loading
        });
        break;
      case "reports":
        loading.update(10, "Reading report data...", "Loading analytics tables");
        await Promise.allSettled([
          loadRevenueReport(state.reports.period || "monthly", { force: false }),
          loadExpenses({ silent: true })
        ]);
        break;
      case "generator":
        loading.update(10, "Loading generator studio...", "Preparing website and app builder");
        if (typeof window.loadGeneratorStudioApp === "function") {
          await window.loadGeneratorStudioApp({ loading });
        }
        break;
      case "email":
        loading.update(12, "Loading mail center...", "Reading email configuration and logs");
        await loadEmailSnapshot({ silent: true });
        break;
      case "calendar":
        loading.update(12, "Loading calendar...", "Reading reminders and schedule events");
        await loadCalendarSnapshot({ silent: true });
        break;
      case "staff":
        loading.update(12, "Loading staff manager...", "Reading employee and payroll records");
        await loadStaffSnapshot({ silent: true });
        break;
      case "ids":
        loading.update(12, "Loading ID manager...", "Reading registration IDs and card status");
        if (typeof window.loadIdManagerApp === "function") {
          await window.loadIdManagerApp({ loading });
        }
        break;
      case "backup":
        loading.update(12, "Loading backups...", "Reading backup snapshots");
        if (typeof window.loadBackupApp === "function") {
          await window.loadBackupApp({ loading });
        }
        break;
      case "source":
        loading.update(12, "Reading source status...", "Inspecting repository state");
        await loadSourceStatus({ silent: true });
        break;
      case "db":
        loading.update(12, "Reading database status...", "Inspecting sync state");
        await loadDbStatus({ silent: true });
        break;
      case "config":
        loading.update(12, "Reading environment settings...", "Inspecting configuration");
        await loadConfigStatus({ silent: true });
        break;
      case "notes":
        loading.update(12, "Reading notes...", "Loading saved notes");
        await refreshNotes();
        break;
      default:
        break;
    }

    if (!loading.isCurrent()) {
      return;
    }

    state.shell.activeApp = appName;
    renderShell();

    if (appName === "administration") {
      showDashboard();
    }

    if (appName !== "administration") {
      loading.finish(`Opened ${title}.`, "Workspace ready.");
    }
  } catch (error) {
    if (loading.isCurrent()) {
      loading.cancel();
    }
    toast("❌ App Error", error.message, "error");
  }
}

function closeApp(appName) {
  if (state.shell.loading && state.shell.loading.appName === appName) {
    state.shell.loading.cancel();
  }
  if (state.shell.activeApp === appName) {
    state.shell.activeApp = null;
  }
  renderShell();
}

function requestAdminShutdown() {
  showModal({
    title: "Exit Admin",
    icon: "⏻",
    body: "Close the admin app and stop the local server process?",
    confirmLabel: "Exit Admin",
    confirmClass: "danger",
    onConfirm: shutdownAdminApp
  });
}

async function shutdownAdminApp() {
  try {
    const response = await fetch("/api/admin/shutdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to stop the admin server.");
    }

    toast("🛑 Admin Closing", "The admin server is shutting down.", "success");
    setStatus("Admin shutdown requested.", "");
    setTimeout(() => {
      try {
        window.open("", "_self");
        window.close();
      } catch {}
      window.location.replace("about:blank");
    }, 450);
  } catch (error) {
    toast("❌ Shutdown Error", error.message, "error");
  }
}

function openAdministration() {
  openApp("administration");
}

function openReportsApp() {
  openApp("reports");
}

function openSourceApp() {
  openApp("source");
}

function openEmailApp() {
  openApp("email");
}

function openCalendarApp() {
  openApp("calendar");
}

function openStaffApp() {
  openApp("staff");
}

function openIdManagerApp() {
  openApp("ids");
}

function openBackupApp() {
  openApp("backup");
}

function openDbApp() {
  openApp("db");
}

function openConfigApp() {
  openApp("config");
}

function openNotesApp() {
  openApp("notes");
}

function invalidateRevenueReportCache() {
  state.reports.cache = {};
  state.reports.inflight = {};
  state.reports.token += 1;
}

function normalizeReportYearValue(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? String(parsed) : "";
}

function getReportCacheKey(period = state.reports.period, year = state.reports.selectedYear) {
  const normalizedYear = normalizeReportYearValue(year);
  return `${period}:${normalizedYear || "all"}`;
}

function buildRevenueReportUrl(period = state.reports.period, year = state.reports.selectedYear) {
  const params = new URLSearchParams();
  params.set("period", period);
  const normalizedYear = normalizeReportYearValue(year);
  if (normalizedYear) {
    params.set("year", normalizedYear);
  }
  return `/api/reports/analytics?${params.toString()}`;
}

async function fetchRevenueReportData(period = state.reports.period, year = state.reports.selectedYear) {
  const response = await fetch(buildRevenueReportUrl(period, year));
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error || "Unable to load business analytics.");
  }
  return payload.data || { rows: [], totals: {} };
}

async function loadRevenueReport(period = state.reports.period, options = {}) {
  const { force = false, silent = false } = options;
  const requestedYear = Object.prototype.hasOwnProperty.call(options, "year")
    ? normalizeReportYearValue(options.year)
    : normalizeReportYearValue(state.reports.selectedYear);
  state.reports.period = period;
  state.reports.selectedYear = requestedYear;
  updateReportPeriodButtons();
  const requestToken = state.reports.token;
  const cacheKey = getReportCacheKey(period, requestedYear);
  let request = null;

  if (!force && state.reports.cache[cacheKey]) {
    state.reports.data = state.reports.cache[cacheKey];
    state.reports.selectedYear = normalizeReportYearValue(state.reports.data.selected_year) || requestedYear;
    syncSelectedReportKey(state.reports.data.rows || []);
    renderRevenueReport();
    return state.reports.data;
  }

  try {
    request = state.reports.inflight[cacheKey];
    if (!request || force) {
      request = fetchRevenueReportData(period, requestedYear);
      state.reports.inflight[cacheKey] = request;
    }

    const data = await request;
    if (requestToken !== state.reports.token) {
      return data;
    }

    state.reports.cache[cacheKey] = data;
    if (state.reports.period === period && getReportCacheKey(period, state.reports.selectedYear) === cacheKey) {
      state.reports.selectedYear = normalizeReportYearValue(data.selected_year) || requestedYear;
      state.reports.data = data;
      syncSelectedReportKey(data.rows || []);
      renderRevenueReport();
    }
    return data;
  } catch (error) {
    if (!silent) {
      document.getElementById("reportStatus").textContent = error.message;
      toast("❌ Report Error", error.message, "error");
    }
    return null;
  } finally {
    if (state.reports.inflight[cacheKey] === request) {
      delete state.reports.inflight[cacheKey];
    }
  }
}

function syncSelectedReportKey(rows) {
  const availableRows = sortReportRowsForDisplay(rows);
  if (!availableRows.length) {
    state.reports.selectedKey = "";
    return;
  }

  const preferredKey =
    state.reports.period === "yearly"
      ? normalizeReportYearValue(state.reports.selectedYear) || state.reports.selectedKey
      : state.reports.selectedKey;
  const selectedExists = availableRows.some((row) => row.key === preferredKey);
  if (!selectedExists) {
    state.reports.selectedKey = getDefaultReportKey(availableRows);
  } else {
    state.reports.selectedKey = preferredKey;
  }

  if (state.reports.period === "yearly") {
    state.reports.selectedYear = normalizeReportYearValue(state.reports.selectedKey);
  }
}

async function selectReportYear(yearValue) {
  state.reports.selectedYear = normalizeReportYearValue(yearValue);
  state.reports.selectedKey = state.reports.period === "yearly" ? state.reports.selectedYear : "";
  if (state.reports.period === "yearly") {
    renderRevenueReport();
  } else {
    await loadRevenueReport(state.reports.period, { year: state.reports.selectedYear });
  }
  if (!state.reports.expenseEditingId) {
    resetExpenseForm();
  }
}

function selectReportBucket(key) {
  state.reports.selectedKey = String(key || "");
  if (state.reports.period === "yearly") {
    state.reports.selectedYear = normalizeReportYearValue(state.reports.selectedKey);
  } else if (state.reports.period === "monthly") {
    state.reports.selectedYear =
      normalizeReportYearValue(String(state.reports.selectedKey).slice(0, 4)) ||
      state.reports.selectedYear;
  }
  renderRevenueReport();
  if (!state.reports.expenseEditingId) {
    resetExpenseForm();
  }
}

function getSelectedReportRow(report = state.reports.data) {
  const rows = report?.rows || [];
  if (!rows.length) {
    return null;
  }

  return rows.find((row) => row.key === state.reports.selectedKey) || rows[0] || null;
}

function sortReportRowsForDisplay(rows) {
  return [...(rows || [])].sort((left, right) => left.start_at.localeCompare(right.start_at));
}

function hasReportActivity(rows) {
  return (rows || []).some(
    (row) => Number(row.revenue_total || 0) > 0 || Number(row.expense_total || 0) > 0
  );
}

function getCurrentReportBucketKey() {
  const currentKey = getReportBucketKeyForDate(todayString(), state.reports.period);
  if (state.reports.period !== "monthly") {
    return currentKey;
  }

  const selectedYear = normalizeReportYearValue(state.reports.selectedYear);
  return selectedYear && currentKey.startsWith(`${selectedYear}-`) ? currentKey : "";
}

function getDefaultReportKey(rows) {
  const orderedRows = sortReportRowsForDisplay(rows);
  const currentKey = getCurrentReportBucketKey();
  if (currentKey && orderedRows.some((row) => row.key === currentKey)) {
    return currentKey;
  }

  const activeRows = orderedRows.filter(
    (row) => Number(row.revenue_total || 0) > 0 || Number(row.expense_total || 0) > 0
  );
  const fallbackRow = activeRows[activeRows.length - 1] || orderedRows[orderedRows.length - 1] || orderedRows[0];
  return fallbackRow?.key || "";
}

function renderRevenueReport() {
  const report = state.reports.data || { rows: [], totals: {} };
  const rows = sortReportRowsForDisplay(report.rows || []);
  const reportHasActivity = hasReportActivity(rows);
  const availableYears = Array.isArray(report.available_years) ? report.available_years : [];
  const reportYear = normalizeReportYearValue(report.selected_year);
  const existingYear = normalizeReportYearValue(state.reports.selectedYear);
  state.reports.selectedYear =
    state.reports.period === "yearly"
      ? existingYear || reportYear || normalizeReportYearValue(availableYears[0])
      : reportYear || existingYear || normalizeReportYearValue(availableYears[0]);
  syncSelectedReportKey(rows);
  const selectedRow = getSelectedReportRow(report);
  const lifetimeSummary = report.totals?.lifetime || {};
  const activeSummary = selectedRow || {};
  if (state.reports.period === "yearly" && selectedRow?.key) {
    state.reports.selectedYear = normalizeReportYearValue(selectedRow.key);
  }

  document.getElementById("reportPeriodLabel").textContent = `${state.reports.period.toUpperCase()} CONSOLE`;
  document.getElementById("reportVisibleCount").textContent =
    state.reports.period === "yearly"
      ? `${rows.length} years tracked`
      : `${rows.length} months in ${state.reports.selectedYear || "view"}`;
  document.getElementById("reportCurrentRevenue").textContent = formatCurrencyBreakdown(activeSummary.revenue_breakdown);
  document.getElementById("reportCurrentExpenses").textContent = formatCurrencyBreakdown(activeSummary.expense_breakdown);
  document.getElementById("reportCurrentNet").textContent = formatCurrencyBreakdown(activeSummary.net_breakdown);
  document.getElementById("reportLifetimeNet").textContent = formatCurrencyBreakdown(lifetimeSummary.net_breakdown);
  document.getElementById("reportPaymentCount").textContent = String(activeSummary.payment_count || 0);
  document.getElementById("reportExpenseCount").textContent = String(activeSummary.expense_count || 0);
  document.getElementById("reportBusinessCount").textContent = String(activeSummary.business_count || 0);
  document.getElementById("reportSelectionSummary").textContent = selectedRow
    ? `${selectedRow.label} selected. ${formatDate(selectedRow.start_at)} to ${formatDate(selectedRow.end_at)}. ${state.reports.period === "monthly" ? "Use Year and Month to target a specific month." : "Use Year to target the annual report you want."}`
    : state.reports.selectedYear
      ? state.reports.period === "monthly"
        ? `Choose a month inside ${state.reports.selectedYear} to target a specific report.`
        : `Choose a year to focus the annual report summary.`
      : "Choose yearly or monthly mode to focus the report.";
  document.getElementById("reportExpenseScope").textContent = selectedRow
    ? `Expenses and staff payroll are filtered to ${selectedRow.label}. New manual expenses default inside this time window.`
    : "Expenses and staff payroll follow the selected report time.";
  document.getElementById("reportGridCaption").textContent =
    state.reports.period === "yearly"
      ? "Revenue graph is showing full years. Pick a year to focus the report and expense scope."
      : `Revenue graph is showing month boxes for ${state.reports.selectedYear || "the selected year"}. Pick a month to focus the report.`;
  document.getElementById("reportEmpty").classList.toggle("hidden", reportHasActivity);
  document.getElementById("reportStatus").textContent = selectedRow
    ? `Showing ${selectedRow.label} in ${state.reports.period} mode.`
    : "No payments or expenses are available for this report yet.";

  renderReportYearOptions(availableYears);
  renderReportBucketOptions(rows);
  renderReportConsole(selectedRow);
  renderReportChart(rows, selectedRow, reportHasActivity);
  document.getElementById("reportTableBody").innerHTML = rows
    .map(
      (row) => `
        <tr class="${row.key === state.reports.selectedKey ? "report-row-selected" : ""}" onclick="selectReportBucket('${escapeHtml(row.key)}')">
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(formatCurrencyBreakdown(row.revenue_breakdown))}</td>
          <td>${escapeHtml(formatCurrencyBreakdown(row.expense_breakdown))}</td>
          <td>${escapeHtml(formatCurrencyBreakdown(row.net_breakdown))}</td>
          <td>${escapeHtml(String(row.payment_count || 0))}</td>
          <td>${escapeHtml(String(row.expense_count || 0))}</td>
          <td>${escapeHtml(String(row.business_count || 0))}</td>
        </tr>
      `
    )
    .join("");

  renderExpenses();
}

function renderReportYearOptions(availableYears) {
  const select = document.getElementById("reportYearSelect");
  const years = availableYears.length ? availableYears : [new Date().getFullYear()];
  const fallbackYear = normalizeReportYearValue(years[0]);
  const selectedYear = normalizeReportYearValue(state.reports.selectedYear) || fallbackYear;

  select.innerHTML = years
    .map((year) => `<option value="${escapeHtml(String(year))}">${escapeHtml(String(year))}</option>`)
    .join("");
  select.value = selectedYear || "";
}

function renderReportBucketOptions(rows) {
  const monthField = document.getElementById("reportMonthField");
  const select = document.getElementById("reportBucketSelect");
  monthField.classList.toggle("hidden", state.reports.period === "yearly");
  select.disabled = state.reports.period === "yearly";
  if (state.reports.period === "yearly") {
    select.innerHTML = `<option value="">Month selector is only used in monthly mode</option>`;
    select.value = "";
    return;
  }

  if (!rows.length) {
    select.innerHTML = `<option value="">No months available</option>`;
    select.value = "";
    return;
  }

  select.innerHTML = rows
    .map((row) => `<option value="${escapeHtml(row.key)}">${escapeHtml(row.label)}</option>`)
    .join("");
  select.value = state.reports.selectedKey;
}

function renderReportConsole(selectedRow) {
  const consoleOutput = document.getElementById("reportConsoleOutput");
  const coverage = selectedRow
    ? `${formatDate(selectedRow.start_at)} -> ${formatDate(selectedRow.end_at)}`
    : "No timeframe selected";
  const focusTarget =
    state.reports.period === "monthly"
      ? `${state.reports.selectedYear || "latest"} / ${selectedRow?.label || "pick a month"}`
      : selectedRow?.label || state.reports.selectedYear || "pick a year";
  const marginText =
    selectedRow?.margin_percent === null || selectedRow?.margin_percent === undefined
      ? "No revenue yet"
      : `${selectedRow.margin_percent}%`;
  const topExpense = selectedRow?.top_expense_category
    ? `${selectedRow.top_expense_category.category} (${selectedRow.top_expense_category.share_percent}%)`
    : "No expense category yet";
  const lineItems = [
    ["mode", state.reports.period],
    ["focus", focusTarget],
    ["range", coverage],
    ["revenue", formatCurrencyBreakdown(selectedRow?.revenue_breakdown)],
    ["expenses", formatCurrencyBreakdown(selectedRow?.expense_breakdown)],
    ["payroll", formatCurrencyBreakdown(selectedRow?.payroll_breakdown)],
    ["net", `${formatCurrencyBreakdown(selectedRow?.net_breakdown)} | margin ${marginText}`],
    [
      "volume",
      `${selectedRow?.payment_count || 0} payments | ${selectedRow?.expense_count || 0} expenses | ${selectedRow?.payroll_count || 0} payroll | ${selectedRow?.business_count || 0} businesses`
    ],
    ["top expense", topExpense]
  ];

  consoleOutput.innerHTML = lineItems
    .map(
      ([label, value]) => `
        <div class="report-console-line">
          <span class="report-console-prompt">&gt;</span>
          <span class="report-console-key">${escapeHtml(label)}</span>
          <span class="report-console-sep">:</span>
          <span class="report-console-value">${escapeHtml(String(value || "NPR 0"))}</span>
        </div>
      `
    )
    .join("");
}

function renderReportChart(rows, selectedRow, reportHasActivity = true) {
  const chart = document.getElementById("reportChart");
  if (!rows.length || !reportHasActivity) {
    chart.innerHTML = "";
    return;
  }

  const maxValue = rows.reduce(
    (highest, row) =>
      Math.max(
        highest,
        Number(row.revenue_total || 0),
        Number(row.expense_total || 0),
        Math.abs(Number(row.net_total || 0))
      ),
    0
  );

  chart.innerHTML = rows
    .map((row) => {
      const isActive = selectedRow?.key === row.key;
      const coverage = `${formatDate(row.start_at)} to ${formatDate(row.end_at)}`;
      return `
        <button type="button" class="report-chart-row ${isActive ? "active" : ""}" onclick="selectReportBucket('${escapeHtml(row.key)}')">
          <div class="report-chart-head">
            <div>
              <div class="report-chart-title">${escapeHtml(row.label)}</div>
              <div class="report-chart-meta">${escapeHtml(coverage)}</div>
            </div>
            <span class="report-chart-badge ${row.net_total < 0 ? "loss" : "profit"}">${escapeHtml(row.net_total < 0 ? "LOSS" : "NET+")}</span>
          </div>
          <div class="report-grid-values">
            <div class="report-grid-value">
              <span class="report-grid-value-label">Revenue</span>
              <strong>${escapeHtml(formatCurrencyBreakdown(row.revenue_breakdown))}</strong>
            </div>
            <div class="report-grid-value">
              <span class="report-grid-value-label">Expenses</span>
              <strong>${escapeHtml(formatCurrencyBreakdown(row.expense_breakdown))}</strong>
            </div>
            <div class="report-grid-value">
              <span class="report-grid-value-label">Net</span>
              <strong>${escapeHtml(formatCurrencyBreakdown(row.net_breakdown))}</strong>
            </div>
          </div>
          <div class="report-bar-stack">
            ${buildReportBarLine("Revenue", row.revenue_total, maxValue, "revenue", formatCurrencyBreakdown(row.revenue_breakdown))}
            ${buildReportBarLine("Expenses", row.expense_total, maxValue, "expense", formatCurrencyBreakdown(row.expense_breakdown))}
            ${buildReportBarLine("Net", row.net_total, maxValue, row.net_total < 0 ? "loss" : "net", formatCurrencyBreakdown(row.net_breakdown))}
          </div>
          <div class="report-chart-footer">
            <span>${escapeHtml(String(row.payment_count || 0))} payments</span>
            <span>${escapeHtml(String(row.expense_count || 0))} expenses</span>
            <span>${escapeHtml(String(row.business_count || 0))} businesses</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function buildReportBarLine(label, value, maxValue, cssClass, displayValue) {
  const numericValue = Math.abs(Number(value || 0));
  const filledCount =
    maxValue > 0 && numericValue > 0 ? Math.max(Math.round((numericValue / maxValue) * 12), 1) : 0;
  const cells = Array.from({ length: 12 }, (_, index) =>
    `<span class="report-meter-cell ${index < filledCount ? `filled ${escapeHtml(cssClass)}` : ""}"></span>`
  ).join("");
  return `
    <div class="report-bar-line">
      <span class="report-bar-label">${escapeHtml(label)}</span>
      <div class="report-bar-track">
        ${cells}
      </div>
      <span class="summary-meta">${escapeHtml(displayValue)}</span>
    </div>
  `;
}

function updateReportPeriodButtons() {
  document.getElementById("reportMonthlyBtn").classList.toggle("active", state.reports.period === "monthly");
  document.getElementById("reportYearlyBtn").classList.toggle("active", state.reports.period === "yearly");
}

function buildReportCsvHeader() {
  return [
    "Period",
    "Revenue",
    "Expenses",
    "Net",
    "Payments",
    "Expense Entries",
    "Businesses",
    "Start Date",
    "End Date"
  ]
    .map(csvCell)
    .join(",");
}

function buildReportCsvRows(rows) {
  return (rows || []).map((row) =>
    [
      row.label,
      formatCurrencyBreakdown(row.revenue_breakdown),
      formatCurrencyBreakdown(row.expense_breakdown),
      formatCurrencyBreakdown(row.net_breakdown),
      row.payment_count,
      row.expense_count,
      row.business_count,
      formatDate(row.start_at),
      formatDate(row.end_at)
    ]
      .map(csvCell)
      .join(",")
  );
}

function downloadCsvFile(lines, filename) {
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportRevenueReport(period = state.reports.period) {
  try {
    const selectedYear = normalizeReportYearValue(state.reports.selectedYear);

    if (period === "yearly") {
      const yearlyData =
        state.reports.period === "yearly" && state.reports.data?.rows
          ? state.reports.data
          : await fetchRevenueReportData("yearly", selectedYear);
      const focusYear =
        selectedYear ||
        normalizeReportYearValue(yearlyData.selected_year) ||
        normalizeReportYearValue(getSelectedReportRow(yearlyData)?.key);
      const summaryRow =
        (yearlyData.rows || []).find((row) => row.key === focusYear) || getSelectedReportRow(yearlyData);
      const monthlyData = await fetchRevenueReportData("monthly", focusYear);
      const yearlyLines = [
        [ "Business Analytics Report", "Yearly" ].map(csvCell).join(","),
        [ "Selected Year", focusYear || "" ].map(csvCell).join(","),
        [ "Generated At", new Date().toISOString() ].map(csvCell).join(","),
        "",
        [ "Year Summary" ].map(csvCell).join(","),
        buildReportCsvHeader(),
        ...buildReportCsvRows(summaryRow ? [summaryRow] : []),
        "",
        [ "Monthly Breakdown" ].map(csvCell).join(","),
        buildReportCsvHeader(),
        ...buildReportCsvRows(monthlyData.rows || [])
      ];
      downloadCsvFile(
        yearlyLines,
        `business-analytics-yearly-${focusYear || "latest"}-${todayString()}.csv`
      );
      document.getElementById("reportStatus").textContent = `Yearly analytics exported for ${focusYear || "the selected year"}.`;
      return;
    }

    const data =
      state.reports.period === period && state.reports.data?.rows
        ? state.reports.data
        : await fetchRevenueReportData(period, selectedYear);
    const effectiveYear =
      selectedYear ||
      normalizeReportYearValue(data.selected_year) ||
      normalizeReportYearValue(data.available_years?.[0]);
    const csvLines = [
      [ "Business Analytics Report", `${period.charAt(0).toUpperCase()}${period.slice(1)}` ].map(csvCell).join(","),
      [ "Selected Year", effectiveYear || "" ].map(csvCell).join(","),
      [ "Generated At", new Date().toISOString() ].map(csvCell).join(","),
      "",
      buildReportCsvHeader(),
      ...buildReportCsvRows(data.rows || [])
    ];
    downloadCsvFile(
      csvLines,
      `business-analytics-${period}-${effectiveYear || "all"}-${todayString()}.csv`
    );
    document.getElementById("reportStatus").textContent = `${period} analytics exported.`;
  } catch (error) {
    toast("❌ Export Error", error.message, "error");
  }
}

function buildReportHighlightsMarkup(highlights, activeSummary, lifetimeSummary) {
  const activeMargin =
    activeSummary.margin_percent === null || activeSummary.margin_percent === undefined
      ? "No revenue yet"
      : `${activeSummary.margin_percent}%`;
  const averagePayment = activeSummary.payment_count
    ? formatCurrency(activeSummary.average_payment_value, state.planCatalog?.currency || "NPR")
    : "NPR 0";

  return [
    buildHighlightCard(
      "Best Net Period",
      highlights.strongest_net_period
        ? `${highlights.strongest_net_period.label} · ${formatCurrencyBreakdown(highlights.strongest_net_period.breakdown)}`
        : "No net-positive period yet."
    ),
    buildHighlightCard(
      "Highest Revenue",
      highlights.highest_revenue_period
        ? `${highlights.highest_revenue_period.label} · ${formatCurrencyBreakdown(highlights.highest_revenue_period.breakdown)}`
        : "No payment periods yet."
    ),
    buildHighlightCard(
      "Highest Expense",
      highlights.highest_expense_period
        ? `${highlights.highest_expense_period.label} · ${formatCurrencyBreakdown(highlights.highest_expense_period.breakdown)}`
        : "No expense periods yet."
    ),
    buildHighlightCard(
      "Active Margin",
      `${activeMargin} · Avg payment ${averagePayment}`
    ),
    buildHighlightCard(
      "Lifetime Revenue",
      formatCurrencyBreakdown(lifetimeSummary.revenue_breakdown)
    ),
    buildHighlightCard(
      "Lifetime Expenses",
      formatCurrencyBreakdown(lifetimeSummary.expense_breakdown)
    )
  ].join("");
}

function buildHighlightCard(title, body) {
  return `
    <div class="analysis-card">
      <div class="analysis-title">${escapeHtml(title)}</div>
      <div class="analysis-copy">${escapeHtml(body)}</div>
    </div>
  `;
}

function buildExpenseCategoryRows(categories) {
  const rows = (categories || []).slice(0, 8);
  if (!rows.length) {
    return "";
  }

  return rows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.category)}</td>
          <td>${escapeHtml(formatCurrency(item.amount, state.planCatalog?.currency || "NPR"))}</td>
          <td>${escapeHtml(String(item.entries || 0))}</td>
          <td>${escapeHtml(`${item.share_percent || 0}%`)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadExpenses(options = {}) {
  const { silent = false } = options;
  try {
    const response = await fetch("/api/reports/expenses");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load expenses.");
    }

    state.reports.expenses = payload.data || [];
    renderExpenses();
    return state.reports.expenses;
  } catch (error) {
    if (!silent) {
      toast("❌ Expense Error", error.message, "error");
    }
    document.getElementById("expensesStatus").textContent = error.message;
    return [];
  }
}

function renderExpenses() {
  const selectedRow = getSelectedReportRow();
  const expenses = getExpensesForSelectedReport();
  document.getElementById("expenseVisibleCount").textContent = `${expenses.length} entries`;
  document.getElementById("expenseEmpty").classList.toggle("hidden", expenses.length > 0);
  document.getElementById("expenseTableBody").innerHTML = expenses
    .map(
      (expense) => `
        <tr>
          <td>
            <div class="edit-title">${escapeHtml(expense.title)}</div>
            <div class="summary-meta">${escapeHtml(expense.notes || "No notes")}</div>
          </td>
          <td>
            <div>${escapeHtml(expense.category || "Operations")}</div>
            <div class="summary-meta">${escapeHtml(expense.source_label || "Expense")}</div>
          </td>
          <td>${escapeHtml(formatCurrency(expense.amount, expense.currency))}</td>
          <td>${escapeHtml(formatDate(expense.incurred_at))}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="row-btn" onclick="editExpense('${escapeHtml(expense.id)}')">${expense.source === "staff-payroll" ? "Open Payroll" : "Edit"}</button>
              <button type="button" class="row-btn warn" onclick="deleteExpense('${escapeHtml(expense.id)}')">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  if (!state.reports.expenseEditingId) {
    document.getElementById("expensesStatus").textContent = selectedRow
      ? expenses.length
        ? `Showing expenses and payroll for ${selectedRow.label}.`
        : `No expenses or payroll recorded for ${selectedRow.label}.`
      : expenses.length
        ? "Showing all recorded expenses and payroll."
        : "No expenses or payroll recorded yet.";
  }
}

function resetExpenseForm() {
  state.reports.expenseEditingId = null;
  document.getElementById("expenseId").value = "";
  document.getElementById("expenseTitle").value = "";
  document.getElementById("expenseCategory").value = "Operations";
  document.getElementById("expenseAmount").value = "";
  document.getElementById("expenseCurrency").value = state.planCatalog?.currency || "NPR";
  document.getElementById("expenseDate").value = getDefaultExpenseDate();
  document.getElementById("expenseNotes").value = "";
  document.getElementById("expenseDeleteBtn").classList.add("hidden");
  document.getElementById("expenseSubmitBtn").textContent = "Save Expense";
  const selectedRow = getSelectedReportRow();
  document.getElementById("expensesStatus").textContent = selectedRow
    ? `Add an expense for ${selectedRow.label}.`
    : "Add an expense to improve report accuracy.";
}

function fillExpenseForm(expense) {
  state.reports.expenseEditingId = expense.id;
  document.getElementById("expenseId").value = expense.id || "";
  document.getElementById("expenseTitle").value = expense.title || "";
  document.getElementById("expenseCategory").value = expense.category || "Operations";
  document.getElementById("expenseAmount").value = expense.amount ?? "";
  document.getElementById("expenseCurrency").value = expense.currency || state.planCatalog?.currency || "NPR";
  document.getElementById("expenseDate").value = toDateInput(expense.incurred_at) || todayString();
  document.getElementById("expenseNotes").value = expense.notes || "";
  document.getElementById("expenseDeleteBtn").classList.remove("hidden");
  document.getElementById("expenseSubmitBtn").textContent = "Update Expense";
  document.getElementById("expensesStatus").textContent = `Editing ${expense.title}.`;
}

function editExpense(expenseId) {
  const expense = (state.reports.expenses || []).find((item) => item.id === expenseId);
  if (!expense) {
    toast("⚠️ Missing Expense", "That expense record could not be found.", "error");
    return;
  }

  if (expense.source === "staff-payroll") {
    state.staff.pendingPaymentEdit = {
      staffId: expense.staff_id,
      paymentId: expense.payment_id
    };
    openApp("staff");
    document.getElementById("reportStatus").textContent = `Opening payroll entry for ${expense.staff_name || "staff member"}.`;
    return;
  }

  const matchingRow = (state.reports.data?.rows || []).find((row) => matchesExpenseToReportRow(expense, row));
  if (matchingRow) {
    state.reports.selectedKey = matchingRow.key;
    renderRevenueReport();
  }
  fillExpenseForm(expense);
}

async function saveExpense() {
  const payload = {
    id: valueOf("expenseId"),
    title: valueOf("expenseTitle"),
    category: valueOf("expenseCategory") || "Operations",
    amount: numberOrNull("expenseAmount"),
    currency: valueOf("expenseCurrency") || state.planCatalog?.currency || "NPR",
    incurred_at: valueOf("expenseDate"),
    notes: valueOf("expenseNotes")
  };

  try {
    const response = await fetch("/api/reports/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Unable to save expense.");
    }

    invalidateRevenueReportCache();
    await Promise.allSettled([
      loadExpenses({ silent: true }),
      loadRevenueReport(state.reports.period, { force: true, silent: true })
    ]);
    resetExpenseForm();
    toast(
      "💼 Expense Saved",
      payload.id ? "The expense record was updated." : "A new expense was added to reports.",
      "success"
    );
  } catch (error) {
    toast("❌ Expense Error", error.message, "error");
    document.getElementById("expensesStatus").textContent = error.message;
  }
}

function deleteCurrentExpense() {
  if (!state.reports.expenseEditingId) {
    toast("⚠️ No Expense", "Select an expense to delete first.", "error");
    return;
  }
  deleteExpense(state.reports.expenseEditingId);
}

function deleteExpense(expenseId) {
  const expense = (state.reports.expenses || []).find((item) => item.id === expenseId);
  if (!expense) {
    toast("⚠️ Missing Expense", "That expense record could not be found.", "error");
    return;
  }

  if (expense.source === "staff-payroll") {
    showModal({
      title: "Delete Payroll Entry",
      icon: "🗑️",
      body: `Delete <b>${escapeHtml(expense.title)}</b> from the payroll ledger? This removes the saved staff salary payment.`,
      confirmLabel: "Delete Payroll",
      confirmClass: "danger",
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/staff/payment/${encodeURIComponent(expense.staff_id)}/${encodeURIComponent(expense.payment_id)}`,
            { method: "DELETE" }
          );
          const payload = await response.json();
          if (!payload.success) {
            throw new Error(payload.error || "Unable to delete payroll entry.");
          }

          invalidateRevenueReportCache();
          await Promise.allSettled([
            loadExpenses({ silent: true }),
            loadRevenueReport(state.reports.period, { force: true, silent: true }),
            typeof loadStaffSnapshot === "function" ? loadStaffSnapshot({ silent: true }) : Promise.resolve()
          ]);
          document.getElementById("expensesStatus").textContent = "Payroll entry deleted.";
          toast("💼 Payroll Deleted", "The payroll entry was removed from reports and staff history.", "success");
        } catch (error) {
          toast("❌ Payroll Error", error.message, "error");
          document.getElementById("expensesStatus").textContent = error.message;
        }
      }
    });
    return;
  }

  showModal({
    title: "Delete Expense",
    icon: "🗑️",
    body: `Delete <b>${escapeHtml(expense.title)}</b> from the expense report ledger? This cannot be undone.`,
    confirmLabel: "Delete",
    confirmClass: "danger",
    onConfirm: async () => {
      try {
        const response = await fetch(`/api/reports/expenses/${expenseId}`, { method: "DELETE" });
        const payload = await response.json();
        if (!payload.success) {
          throw new Error(payload.error || "Unable to delete expense.");
        }

        invalidateRevenueReportCache();
        await Promise.allSettled([
          loadExpenses({ silent: true }),
          loadRevenueReport(state.reports.period, { force: true, silent: true })
        ]);
        resetExpenseForm();
        toast("🗑️ Expense Deleted", `${expense.title} was removed from analytics.`, "success");
      } catch (error) {
        toast("❌ Expense Error", error.message, "error");
        document.getElementById("expensesStatus").textContent = error.message;
      }
    }
  });
}

function getExpensesForSelectedReport() {
  const selectedRow = getSelectedReportRow();
  if (!selectedRow) {
    return state.reports.expenses || [];
  }

  return (state.reports.expenses || []).filter((expense) => matchesExpenseToReportRow(expense, selectedRow));
}

function matchesExpenseToReportRow(expense, row) {
  if (!expense || !row) {
    return false;
  }

  return getReportBucketKeyForDate(expense.incurred_at, state.reports.period) === row.key;
}

function getReportBucketKeyForDate(value, period) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  if (period === "yearly") {
    return String(year);
  }
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function getDefaultExpenseDate() {
  const selectedRow = getSelectedReportRow();
  if (!selectedRow) {
    return todayString();
  }

  const today = todayString();
  return getReportBucketKeyForDate(today, state.reports.period) === selectedRow.key
    ? today
    : toDateInput(selectedRow.start_at) || today;
}

function setElementText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setElementValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function setElementHtml(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = value;
  }
}

function buildRepoPathSummary(...paths) {
  return paths.filter(Boolean).join("\n");
}

function renderRepoStatusPanel(prefix, snapshot, options = {}) {
  const { defaultCommitMessage = "", sourcePaths = "", targetPaths = "" } = options;
  const files = snapshot.changed_files || [];
  setElementText(`${prefix}ModePill`, snapshot.is_clean ? "CLEAN" : "CHANGED");
  setElementText(`${prefix}BranchStat`, snapshot.branch || "-");
  setElementText(`${prefix}ChangedStat`, String(snapshot.changed_count || files.length || 0));
  setElementText(`${prefix}StagedStat`, String(snapshot.staged_count || 0));
  setElementText(`${prefix}AheadBehindStat`, `${snapshot.ahead || 0} / ${snapshot.behind || 0}`);
  setElementValue(`${prefix}RepoPath`, snapshot.repo_root || "");
  setElementValue(`${prefix}RemoteUrl`, snapshot.remote_url || "");
  setElementValue(`${prefix}SourcePaths`, sourcePaths);
  setElementValue(`${prefix}TargetPaths`, targetPaths);
  setElementText(`${prefix}FileCount`, `${files.length} files`);

  const emptyState = document.getElementById(`${prefix}FileEmpty`);
  if (emptyState) {
    emptyState.classList.toggle("hidden", files.length > 0);
  }

  const fileList = document.getElementById(`${prefix}FileList`);
  if (fileList) {
    fileList.innerHTML = files
      .map(
        (file) => `
          <div class="source-file-item">
            <div class="source-file-badge">${escapeHtml(file.status || "--")}</div>
            <div>
              <div class="source-file-path">${escapeHtml(file.path || "")}</div>
              <div class="source-file-meta">${escapeHtml(file.summary || "Tracked file change")}</div>
            </div>
          </div>
        `
      )
      .join("");
  }

  setElementText(`${prefix}Log`, snapshot.last_output || snapshot.status_text || "No git command has been run yet.");
  setElementText(
    `${prefix}ActionStatus`,
    snapshot.last_summary || snapshot.status_summary || "Repository control is ready."
  );
  setElementText(
    `${prefix}Status`,
    snapshot.status_summary || snapshot.last_summary || "Repository control is ready."
  );

  const commitField = document.getElementById(`${prefix}CommitMessage`);
  if (commitField && !commitField.value) {
    commitField.value = defaultCommitMessage;
  }
}

function setRepoPanelError(prefix, message) {
  setElementText(`${prefix}Status`, message);
  setElementText(`${prefix}ActionStatus`, message);
}

async function runRepoCommand({
  endpoint,
  payload = {},
  stateKey,
  prefix,
  renderFn,
  successTitle = "Git command completed.",
  errorFallback = "Git command failed.",
  successToastTitle = "Repository Updated",
  errorToastTitle = "Repository Error"
}) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || errorFallback);
    }

    state[stateKey].snapshot = data.data || null;
    renderFn();
    const summary = data.data?.last_summary || successTitle;
    setElementText(`${prefix}ActionStatus`, summary);
    setElementText(`${prefix}Status`, summary);
    toast(successToastTitle, summary, "success");
    return data.data;
  } catch (error) {
    setRepoPanelError(prefix, error.message);
    toast(errorToastTitle, error.message, "error");
    return null;
  }
}

async function loadSourceStatus(options = {}) {
  const { silent = false } = options;
  try {
    const response = await fetch("/api/source/status");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load source control status.");
    }

    state.source.snapshot = payload.data || null;
    renderSourceStatus();
    return state.source.snapshot;
  } catch (error) {
    setRepoPanelError("source", error.message);
    if (!silent) {
      toast("❌ Source Error", error.message, "error");
    }
    return null;
  }
}

function renderSourceStatus() {
  renderRepoStatusPanel("source", state.source.snapshot || {}, {
    defaultCommitMessage: buildDefaultSourceCommitMessage()
  });
}

function buildDefaultSourceCommitMessage() {
  return `Update directory data ${todayString()}`;
}

function getSourceCommitMessage() {
  return valueOf("sourceCommitMessage") || buildDefaultSourceCommitMessage();
}

function buildDefaultDbCommitMessage() {
  return `Sync business data ${todayString()}`;
}

function getDbCommitMessage() {
  return valueOf("dbCommitMessage") || buildDefaultDbCommitMessage();
}

async function loadDbStatus(options = {}) {
  const { silent = false } = options;
  try {
    const response = await fetch("/api/db/status");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load DB manager status.");
    }

    state.db.snapshot = payload.data || null;
    renderDbStatus();
    return state.db.snapshot;
  } catch (error) {
    setRepoPanelError("db", error.message);
    if (!silent) {
      toast("❌ DB Error", error.message, "error");
    }
    return null;
  }
}

function renderDbStatus() {
  const snapshot = state.db.snapshot || {};
  renderRepoStatusPanel("db", snapshot, {
    defaultCommitMessage: buildDefaultDbCommitMessage(),
    sourcePaths: buildRepoPathSummary(snapshot.source_basic_dir, snapshot.source_detailed_dir),
    targetPaths: buildRepoPathSummary(snapshot.target_basic_dir, snapshot.target_detailed_dir)
  });
}

function getConfigTargetMeta(target) {
  return target === "admin"
    ? {
      title: "Admin",
      infoId: "configAdminInfo",
      fieldsId: "configAdminFields"
    }
    : {
      title: "User",
      infoId: "configUserInfo",
      fieldsId: "configUserFields"
    };
}

function setConfigStatus(message, pill = "READY") {
  setElementText("configStatus", message);
  setElementText("configModePill", pill);
}

function renderConfigStatus() {
  renderConfigTarget("admin");
  renderConfigTarget("user");

  const adminNote = state.config.snapshot?.admin?.restart_note || "Restart the admin server after saving admin env.";
  const userNote = state.config.snapshot?.user?.restart_note || "Restart or rebuild the user app after saving user env.";
  setElementText("configGuideSummary", `${adminNote} ${userNote}`);
}

function renderConfigTarget(target) {
  const snapshot = state.config.snapshot?.[target];
  const meta = getConfigTargetMeta(target);
  if (!snapshot) {
    setElementText(meta.infoId, `Load the config to edit ${meta.title.toLowerCase()} settings.`);
    setElementHtml(meta.fieldsId, "");
    return;
  }

  setElementText(
    meta.infoId,
    `${snapshot.description} File: ${snapshot.file_path}. ${snapshot.restart_note}`
  );

  const markup = (snapshot.sections || [])
    .map(
      (section) => `
        <section class="config-section">
          <div class="config-section-head">
            <div class="config-section-title">${escapeHtml(section.title || "Section")}</div>
            <div class="config-section-copy">${escapeHtml(section.description || "")}</div>
          </div>
          <div class="config-field-grid">
            ${(section.fields || [])
              .map(
                (field) => `
                  <label class="config-field-card" for="config-${target}-${escapeHtml(field.key)}">
                    <span class="config-field-label">${escapeHtml(field.label || field.key)}</span>
                    <span class="config-key">${escapeHtml(field.key)}</span>
                    <input
                      id="config-${target}-${escapeHtml(field.key)}"
                      type="text"
                      data-config-target="${escapeHtml(target)}"
                      data-config-key="${escapeHtml(field.key)}"
                      value="${escapeHtml(field.value || "")}"
                      placeholder="${escapeHtml(field.placeholder || "")}"
                    />
                    <span class="config-field-copy">${escapeHtml(field.description || "")}</span>
                    <span class="config-example">Example: ${escapeHtml(field.example || "Leave blank to use local defaults")}</span>
                  </label>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");

  setElementHtml(
    meta.fieldsId,
    markup || '<div class="empty-state">No environment fields are configured for this target.</div>'
  );
}

function collectConfigTargetValues(target) {
  const values = {};
  document.querySelectorAll(`[data-config-target="${target}"][data-config-key]`).forEach((input) => {
    values[input.dataset.configKey] = input.value;
  });
  return values;
}

async function loadConfigStatus(options = {}) {
  const { silent = false } = options;
  setConfigStatus("Loading environment settings...", "LOAD");
  try {
    const response = await fetch("/api/config/env");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load environment configuration.");
    }

    state.config.snapshot = payload.data || null;
    renderConfigStatus();
    setConfigStatus("Environment settings are ready.", "READY");
    if (!silent) {
      toast("⚙️ Config Loaded", "Environment settings were loaded.", "success");
    }
    return state.config.snapshot;
  } catch (error) {
    setConfigStatus(error.message, "ERROR");
    if (!silent) {
      toast("❌ Config Error", error.message, "error");
    }
    return null;
  }
}

async function saveConfigTarget(target) {
  if (!state.config.snapshot) {
    await loadConfigStatus({ silent: true });
  }

  const payload = {};
  if (!target || target === "admin") {
    payload.admin = collectConfigTargetValues("admin");
  }
  if (!target || target === "user") {
    payload.user = collectConfigTargetValues("user");
  }

  const scopeLabel =
    !target ? "Admin and user env files saved." : `${target === "admin" ? "Admin" : "User"} env saved.`;

  setConfigStatus("Saving environment settings...", "SAVE");
  try {
    const response = await fetch("/api/config/env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Unable to save environment configuration.");
    }

    state.config.snapshot = data.data || null;
    renderConfigStatus();
    setConfigStatus(scopeLabel, "SAVED");
    toast("⚙️ Config Saved", scopeLabel, "success");
    return state.config.snapshot;
  } catch (error) {
    setConfigStatus(error.message, "ERROR");
    toast("❌ Config Error", error.message, "error");
    return null;
  }
}

async function runSourceCommand(endpoint, payload = {}, successTitle = "Git command completed.") {
  return runRepoCommand({
    endpoint,
    payload,
    stateKey: "source",
    prefix: "source",
    renderFn: renderSourceStatus,
    successTitle,
    errorFallback: "Git command failed.",
    successToastTitle: "🧰 Source Updated",
    errorToastTitle: "❌ Source Error"
  });
}

function pullSourceUpdates() {
  return runSourceCommand("/api/source/pull", {}, "Latest changes pulled from the remote.");
}

function stageSourceChanges() {
  return runSourceCommand("/api/source/stage", {}, "All changes were staged.");
}

function commitSourceChanges() {
  return runSourceCommand(
    "/api/source/commit",
    { message: getSourceCommitMessage() },
    "Changes were committed."
  );
}

function pushSourceChanges() {
  return runSourceCommand("/api/source/push", {}, "Changes were pushed to GitHub.");
}

function quickPublishSourceChanges() {
  return runSourceCommand(
    "/api/source/publish",
    { message: getSourceCommitMessage() },
    "Quick publish completed."
  );
}

async function runDbCommand(endpoint, payload = {}, successTitle = "DB command completed.") {
  return runRepoCommand({
    endpoint,
    payload,
    stateKey: "db",
    prefix: "db",
    renderFn: renderDbStatus,
    successTitle,
    errorFallback: "DB command failed.",
    successToastTitle: "🗃️ DB Updated",
    errorToastTitle: "❌ DB Error"
  });
}

function mirrorDbData() {
  return runDbCommand("/api/db/mirror", {}, "Business data mirrored into the DB repository.");
}

function pullDbUpdates() {
  return runDbCommand("/api/db/pull", {}, "Latest DB changes pulled from the remote.");
}

function stageDbChanges() {
  return runDbCommand("/api/db/stage", {}, "All DB repository changes were staged.");
}

function commitDbChanges() {
  return runDbCommand(
    "/api/db/commit",
    { message: getDbCommitMessage() },
    "DB repository changes were committed."
  );
}

function pushDbChanges() {
  return runDbCommand("/api/db/push", {}, "DB repository changes were pushed to GitHub.");
}

function quickPublishDbChanges() {
  return runDbCommand(
    "/api/db/publish",
    { message: getDbCommitMessage() },
    "DB quick publish completed."
  );
}

async function refreshNotes() {
  try {
    const response = await fetch("/api/notes");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load notes.");
    }

    state.notes.items = payload.data || [];
    if (state.notes.selectedId && !state.notes.items.some((note) => note.id === state.notes.selectedId)) {
      state.notes.selectedId = null;
    }
    if (!state.notes.selectedId && state.notes.items.length) {
      state.notes.selectedId = state.notes.items[0].id;
    }
    renderNotes();
  } catch (error) {
    document.getElementById("notesStatus").textContent = error.message;
    toast("❌ Notes Error", error.message, "error");
  }
}

function renderNotes() {
  const note = getSelectedNote();
  const list = document.getElementById("noteList");
  list.innerHTML = state.notes.items
    .map(
      (item) => `
        <button class="note-item ${item.id === state.notes.selectedId ? "active" : ""}" onclick="selectNote('${item.id}')">
          <div class="note-item-title">${escapeHtml(item.title || "Untitled note")}</div>
          <div class="note-item-meta">${escapeHtml(formatDate(item.updated_at))}</div>
        </button>
      `
    )
    .join("");
  document.getElementById("noteListEmpty").classList.toggle("hidden", state.notes.items.length > 0);

  if (!note) {
    document.getElementById("noteId").value = "";
    document.getElementById("noteTitle").value = "";
    document.getElementById("noteContent").value = "";
    document.getElementById("notesStatus").textContent = state.notes.items.length
      ? "Select a note or create a new one."
      : "No note selected.";
    return;
  }

  document.getElementById("noteId").value = note.id;
  document.getElementById("noteTitle").value = note.title || "";
  document.getElementById("noteContent").value = note.content || "";
  document.getElementById("notesStatus").textContent = `Editing ${note.title || "Untitled note"}.`;
}

function getSelectedNote() {
  return state.notes.items.find((note) => note.id === state.notes.selectedId) || null;
}

function selectNote(noteId) {
  state.notes.selectedId = noteId;
  renderNotes();
}

function newNote() {
  state.notes.selectedId = null;
  renderNotes();
  document.getElementById("notesStatus").textContent = "New note ready.";
}

async function saveCurrentNote() {
  const noteId = document.getElementById("noteId").value.trim();
  const title = document.getElementById("noteTitle").value.trim();
  const content = document.getElementById("noteContent").value;

  if (!title && !content.trim()) {
    toast("⚠️ Empty Note", "Add a title or note content before saving.", "error");
    return;
  }

  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: noteId,
        title,
        content
      })
    });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to save note.");
    }

    state.notes.selectedId = payload.data.id;
    await refreshNotes();
    document.getElementById("notesStatus").textContent = "Note saved locally.";
    toast("📝 Note Saved", "The note was saved locally.", "success");
  } catch (error) {
    toast("❌ Notes Error", error.message, "error");
  }
}

async function deleteCurrentNote() {
  const note = getSelectedNote();
  if (!note) {
    toast("⚠️ No Note", "Select a saved note before deleting.", "error");
    return;
  }

  try {
    const response = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to delete note.");
    }

    state.notes.selectedId = null;
    await refreshNotes();
    document.getElementById("notesStatus").textContent = "Note deleted.";
    toast("🗑️ Note Deleted", "The note was removed.", "success");
  } catch (error) {
    toast("❌ Notes Error", error.message, "error");
  }
}

function showDashboard() {
  setActiveView("dashboard");
  renderDashboard();
}

function openAddView() {
  state.editorMode = "add";
  state.selectedSlug = null;
  configureEditorView();
  resetBusinessForm();
  setActiveView("editor");
  renderEditList();
  updateSelectedSummary();
  setStatus("Add mode ready.", "");
}

async function openEditView(slug) {
  state.editorMode = "edit";
  configureEditorView();
  setActiveView("editor");
  renderEditList();

  if (slug) {
    await loadBusinessIntoEditor(slug);
    return;
  }

  if (state.selectedSlug) {
    await loadBusinessIntoEditor(state.selectedSlug);
    return;
  }

  resetBusinessForm();
  setStatus("Edit mode ready. Select a business from the filtered list.", "");
}

function openPaymentsView(slug) {
  setActiveView("payments");
  renderPayments();

  if (slug) {
    loadPaymentRecord(slug);
    return;
  }

  if (state.paymentSlug) {
    loadPaymentRecord(state.paymentSlug, true);
    return;
  }

  if (state.selectedSlug) {
    loadPaymentRecord(state.selectedSlug, true);
  }
}

function setActiveView(view) {
  state.currentView = view;
  closeMenus();
  ["dashboardView", "editorView", "paymentsView"].forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", id !== `${view}View`);
  });

  document.getElementById("toolDashboard").classList.toggle("active", view === "dashboard");
  document.getElementById("toolAdd").classList.toggle("active", view === "editor" && state.editorMode === "add");
  document.getElementById("toolEdit").classList.toggle("active", view === "editor" && state.editorMode === "edit");
  document.getElementById("toolPayments").classList.toggle("active", view === "payments");

  updateChrome();
  document.getElementById("mainContent").scrollTop = 0;
  queueAdministrationPaneSync();
}

function configureEditorView() {
  const addMode = state.editorMode === "add";
  document.getElementById("editorView").classList.toggle("editor-add-mode", addMode);
  document.getElementById("editBrowser").classList.toggle("hidden", addMode);
  document.getElementById("editorTitle").textContent = addMode ? "Add Business" : "Edit Businesses";
  document.getElementById("editorSubtitle").textContent = addMode
    ? "Create a new listing and configure the first subscription from the active plan catalog."
    : "Filter by province and district, then update or delete the selected business.";
  document.getElementById("editorModePill").textContent = addMode ? "ADD MODE" : "EDIT MODE";
  document.getElementById("editorSecondaryBtn").textContent = addMode ? "Clear Form" : "Reload Selected";
  document.getElementById("editorDeleteBtn").classList.toggle("hidden", addMode);
  document.getElementById("editorInfoBox").textContent = addMode
    ? "Add mode includes business details plus payment setup so the listing can go live immediately."
    : "Edit mode includes province and district filters, a matching business list, and full update/delete actions.";
  syncBusinessSaveButtons();
}

function getBusinessSaveLabels() {
  const addMode = state.editorMode === "add";
  return {
    primaryIdle: addMode ? "Add Business" : "Update Business",
    toolbarIdle: "💾 Save",
    busy: state.businessSaveLabel || (addMode ? "Saving..." : "Updating...")
  };
}

function setBusyButtonState(button, isBusy, idleLabel, busyLabel) {
  if (!button) {
    return;
  }

  button.textContent = isBusy ? busyLabel : idleLabel;
  button.disabled = isBusy;
  button.classList.toggle("is-busy", isBusy);
  button.setAttribute("aria-busy", isBusy ? "true" : "false");
}

function syncBusinessSaveButtons() {
  const labels = getBusinessSaveLabels();
  setBusyButtonState(
    document.getElementById("editorPrimaryBtn"),
    state.businessSaveBusy,
    labels.primaryIdle,
    labels.busy
  );
  setBusyButtonState(
    document.getElementById("toolbarSaveBtn"),
    state.businessSaveBusy,
    labels.toolbarIdle,
    labels.busy
  );

  const secondaryButton = document.getElementById("editorSecondaryBtn");
  if (secondaryButton) {
    secondaryButton.disabled = state.businessSaveBusy;
  }

  const deleteButton = document.getElementById("editorDeleteBtn");
  if (deleteButton) {
    deleteButton.disabled = state.businessSaveBusy;
  }
}

function setBusinessSaveBusy(isBusy, busyLabel = "") {
  state.businessSaveBusy = Boolean(isBusy);
  state.businessSaveLabel = isBusy ? String(busyLabel || "").trim() : "";
  syncBusinessSaveButtons();
}

function updateChrome() {
  const selected = getBusinessBySlug(state.currentView === "payments" ? state.paymentSlug : state.selectedSlug);
  let label = "Directory Overview";
  let path = "Desktop\\Directory Overview";

  if (state.currentView === "editor") {
    if (state.editorMode === "add") {
      label = "Add Business";
      path = "Desktop\\Add Business";
    } else {
      label = selected ? `Edit ${selected.name}` : "Edit Businesses";
      path = selected ? `Desktop\\Edit Businesses\\${selected.slug}.json` : "Desktop\\Edit Businesses";
    }
  }

  if (state.currentView === "payments") {
    label = selected ? `Payment Center - ${selected.name}` : "Payment Center";
    path = selected ? `Desktop\\Payment Center\\${selected.slug}.json` : "Desktop\\Payment Center";
  }

  document.getElementById("windowTitle").textContent = `Administration - ${label}`;
  document.getElementById("addressPath").textContent = path;
  if (state.shell.activeApp === "administration") {
    document.getElementById("taskbarAppLabel").textContent = APP_LABELS.administration;
  }
}

function updateStats() {
  const total = state.businesses.length;
  const active = state.businesses.filter((business) => getStatus(business) === "active").length;
  const expired = state.businesses.filter((business) => getStatus(business) === "expired").length;
  const pending = state.businesses.filter((business) => getStatus(business) === "pending").length;
  const expiring = state.businesses.filter(isExpiringSoon).length;
  const revenue = state.businesses.reduce((sum, business) => {
    const amount = Number(business.subscription?.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statActive").textContent = active;
  document.getElementById("statExpired").textContent = expired;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statExpiring").textContent = expiring;

  document.getElementById("paymentActiveStat").textContent = active;
  document.getElementById("paymentExpiredStat").textContent = expired;
  document.getElementById("paymentPendingStat").textContent = pending;
  document.getElementById("paymentRevenueStat").textContent = formatCompactAmount(revenue);
}

function renderDashboard() {
  const items = getFilteredBusinesses("dashboard");
  const body = document.getElementById("dashboardTableBody");
  const pageData = getPageSlice(items, "dashboard");
  document.getElementById("dashboardVisibleCount").textContent = items.length
    ? `${items.length} visible · page ${pageData.currentPage}/${pageData.totalPages}`
    : "0 visible";
  document.getElementById("dashboardEmpty").classList.toggle("hidden", items.length > 0);

  body.innerHTML = pageData.pageItems
    .map((business) => {
      const icon = TYPE_EMOJI[business.type] || "🏫";
      const displayStatus = getDisplayStatus(business);
      return `
        <tr class="dashboard-row ${business.slug === state.selectedSlug ? "selected" : ""}" onclick="selectBusiness('${business.slug}')">
          <td>
            <div class="summary-title">${icon} ${escapeHtml(business.name)}</div>
            <div class="summary-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.slug)}</div>
          </td>
          <td>${escapeHtml(business.type || "—")}</td>
          <td title="${escapeHtml(business.location_full_label || business.location_label || "—")}">${escapeHtml(business.location_label || "—")}</td>
          <td>${escapeHtml(business.subscription?.plan || getDefaultPlanLabel())}</td>
          <td>${renderStatusBadge(displayStatus)}</td>
          <td><div class="gen-badge-row">${renderGenerationBadges(business.generator)}</div></td>
          <td>${escapeHtml(formatDate(business.subscription?.expires_at))}</td>
          <td><span data-expiry="${escapeHtml(business.subscription?.expires_at || "")}" data-status="${getStatus(business)}">${escapeHtml(formatCountdown(business.subscription?.expires_at, getStatus(business)))}</span></td>
          <td>
            <div class="table-actions">
              <button class="row-btn" onclick="event.stopPropagation(); selectBusiness('${business.slug}')">${business.slug === state.selectedSlug ? "Selected" : "Select"}</button>
              <button class="row-btn" onclick="event.stopPropagation(); openEditView('${business.slug}')">Edit</button>
              <button class="row-btn primary" onclick="event.stopPropagation(); openPaymentsView('${business.slug}')">Payments</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
  renderPager("dashboardPager", "dashboard", items.length);

  if (state.currentView === "dashboard") {
    setStatus("Main screen filters applied.", `${items.length} visible / ${state.businesses.length} total`);
  }
}

function renderEditList() {
  const items = getFilteredBusinesses("edit");
  const list = document.getElementById("editList");
  const pageData = getPageSlice(items, "edit");
  document.getElementById("editVisibleCount").textContent = items.length
    ? `${items.length} visible · page ${pageData.currentPage}/${pageData.totalPages}`
    : "0 visible";
  document.getElementById("editEmpty").classList.toggle("hidden", items.length > 0);

  list.innerHTML = pageData.pageItems
    .map((business) => `
      <div class="edit-item ${business.slug === state.selectedSlug ? "active" : ""}" onclick="loadBusinessIntoEditor('${business.slug}')">
        <div class="edit-title">${escapeHtml(business.name)}</div>
        <div class="edit-sub">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.location_full_label || business.location_label || "No location")} · ${escapeHtml(business.type || "Type not set")}</div>
        <div class="summary-badges">${renderStatusBadge(getDisplayStatus(business))}</div>
        <div class="gen-badge-row compact">${renderGenerationBadges(business.generator)}</div>
      </div>
    `)
    .join("");
  renderPager("editPager", "edit", items.length);

  if (state.currentView === "editor" && state.editorMode === "edit") {
    setStatus("Edit filters ready.", `${items.length} visible / ${state.businesses.length} total`);
  }
}

function renderPayments() {
  const items = getFilteredBusinesses("payments");
  const body = document.getElementById("paymentsTableBody");
  const pageData = getPageSlice(items, "payments");
  document.getElementById("paymentsVisibleCount").textContent = items.length
    ? `${items.length} visible · page ${pageData.currentPage}/${pageData.totalPages}`
    : "0 visible";
  document.getElementById("paymentsEmpty").classList.toggle("hidden", items.length > 0);

  body.innerHTML = pageData.pageItems
    .map((business) => `
      <tr class="payment-row-active ${business.slug === state.paymentSlug ? "selected" : ""}" onclick="loadPaymentRecord('${business.slug}')">
        <td>
          <div class="edit-title">${escapeHtml(business.name)}</div>
          <div class="summary-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.location_full_label || business.location_label || "No location")}</div>
          <div class="gen-badge-row compact">${renderGenerationBadges(business.generator)}</div>
        </td>
        <td>${renderStatusBadge(getDisplayStatus(business))}</td>
        <td>${escapeHtml(formatDate(business.subscription?.paid_at))}</td>
        <td>${escapeHtml(formatDate(business.subscription?.expires_at))}</td>
        <td><span data-expiry="${escapeHtml(business.subscription?.expires_at || "")}" data-status="${getStatus(business)}">${escapeHtml(formatCountdown(business.subscription?.expires_at, getStatus(business)))}</span></td>
        <td>${escapeHtml(formatCurrency(business.subscription?.amount, business.subscription?.currency))}</td>
      </tr>
    `)
    .join("");
  renderPager("paymentsPager", "payments", items.length);

  if (state.currentView === "payments") {
    setStatus("Payment filters applied.", `${items.length} visible / ${state.businesses.length} total`);
  }
}

function getFilteredBusinesses(key) {
  const signature = getFilterSignature(key);
  const cached = state.filteredCache[key];
  if (cached && cached.signature === signature) {
    return cached.items;
  }

  const filters = state.filters[key];
  const items = state.businesses.filter((business) => {
    const haystack =
      business.search_text ||
      [
        business.name,
        business.slug,
        business.type,
        business.district,
        business.province_name,
        business.subscription?.payment_reference
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (filters.search && !haystack.includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.province && String(business.province || "") !== filters.province) {
      return false;
    }
    if (filters.district && business.district !== filters.district) {
      return false;
    }
    if (!matchesStatusFilter(business, filters.status)) {
      return false;
    }
    return true;
  });
  state.filteredCache[key] = {
    signature,
    items
  };
  return items;
}

function changeListPage(key, delta) {
  const items = getFilteredBusinesses(key);
  const totalPages = getPageCount(items.length);
  const nextPage = clampPage((state.pagination[key] || 1) + delta, totalPages);
  if (nextPage === state.pagination[key]) {
    return;
  }

  state.pagination[key] = nextPage;
  if (key === "dashboard") {
    renderDashboard();
  } else if (key === "edit") {
    renderEditList();
  } else if (key === "payments") {
    renderPayments();
  }

  window.requestAnimationFrame(() => {
    scrollPagedListToTop(key);
  });
}

function focusListPageForSlug(key, slug) {
  if (!slug) {
    return;
  }

  const items = getFilteredBusinesses(key);
  const index = items.findIndex((item) => item.slug === slug);
  if (index < 0) {
    return;
  }

  state.pagination[key] = Math.floor(index / LIST_PAGE_SIZE) + 1;
}

function matchesStatusFilter(business, filterStatus) {
  if (!filterStatus || filterStatus === "all") {
    return true;
  }
  if (filterStatus === "expiring") {
    return isExpiringSoon(business);
  }
  return getStatus(business) === filterStatus;
}

function selectBusiness(slug) {
  state.selectedSlug = slug;
  focusListPageForSlug("dashboard", slug);
  focusListPageForSlug("edit", slug);
  focusListPageForSlug("payments", slug);
  updateSelectedSummary();
  renderDashboard();
  renderEditList();
  renderPayments();
  updateChrome();
  const business = getBusinessBySlug(slug);
  if (business) {
    setStatus(`Selected ${business.name}.`, "");
  }
}

async function loadBusinessIntoEditor(slug) {
  try {
    setStatus(`Loading ${slug}...`, "");
    const response = await fetch(`/api/get/${slug}`);
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load business.");
    }

    state.selectedSlug = slug;
    focusListPageForSlug("edit", slug);
    focusListPageForSlug("payments", slug);
    fillBusinessForm(payload.data);
    updateSelectedSummary();
    renderEditList();
    renderPayments();
    updateChrome();
    window.requestAnimationFrame(() => {
      scrollAdminSelectionToTop("editor");
    });
    setStatus(`Loaded ${payload.data.name}.`, "");
  } catch (error) {
    toast("❌ Load Error", error.message, "error");
  }
}

async function loadPaymentRecord(slug, silent = false) {
  try {
    const response = await fetch(`/api/get/${slug}`);
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load payment record.");
    }

    state.paymentSlug = slug;
    state.selectedSlug = slug;
    state.paymentRecord = payload.data;
    focusListPageForSlug("payments", slug);
    focusListPageForSlug("edit", slug);
    updatePaymentFocus();
    updateSelectedSummary();
    renderPayments();
    renderEditList();
    updateChrome();
    window.requestAnimationFrame(() => {
      scrollAdminSelectionToTop("payments");
    });
    if (!silent) {
      setStatus(`Payment record loaded for ${payload.data.name}.`, "");
    }
  } catch (error) {
    toast("❌ Payment Error", error.message, "error");
  }
}

async function saveBusiness() {
  if (state.currentView !== "editor") {
    toast("⚠️ Save Unavailable", "Open the Add or Edit section before saving.", "error");
    return;
  }

  if (state.businessSaveBusy) {
    return;
  }

  const payload = collectBusinessPayload();
  if (!payload.name || !payload.slug) {
    toast("⚠️ Validation Error", "Business name and slug are required.", "error");
    return;
  }

  const isAddMode = state.editorMode === "add";
  const busyLabel = isAddMode ? "Saving..." : "Updating...";

  try {
    setBusinessSaveBusy(true, busyLabel);
    setStatus(`${isAddMode ? "Saving" : "Updating"} ${payload.name}...`, "");
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Save failed.");
    }

    invalidateRevenueReportCache();
    await Promise.allSettled([
      refreshDirectory({ reloadReport: false, reloadPaymentRecord: false }),
      loadRevenueReport(state.reports.period, { force: true })
    ]);
    toast(
      "💾 Saved",
      isAddMode
        ? `${payload.name} has been saved with business ID ${data?.basic?.id || data?.notifications?.registration_id || "pending"}.`
        : `${payload.name} has been updated in the directory.`,
      "success"
    );
    if (data?.notifications?.confirmation_email?.attempted) {
      toast(
        data.notifications.confirmation_email.ok ? "✉️ Confirmation Sent" : "⚠️ Email Not Sent",
        data.notifications.confirmation_email.message || "Confirmation email status updated.",
        data.notifications.confirmation_email.ok ? "success" : "error"
      );
    }

    if (isAddMode) {
      await openEditView(data.slug);
    } else {
      await loadBusinessIntoEditor(data.slug);
    }
  } catch (error) {
    toast("❌ Save Error", error.message, "error");
    setStatus("Save failed.", "");
  } finally {
    setBusinessSaveBusy(false);
  }
}

async function renewSelectedBusiness() {
  if (!state.paymentSlug) {
    toast("⚠️ Select A Business", "Choose a business in the Payment Center before renewing.", "error");
    return;
  }

  const editingId = valueOf("p_payment_id");
  const payload = {
    id: editingId,
    plan: valueOf("p_plan") || getDefaultPlanLabel(),
    amount: numberOrNull("p_amount"),
    currency: valueOf("p_currency") || state.planCatalog?.currency || "NPR",
    payment_method: valueOf("p_payment_method"),
    payment_reference: valueOf("p_payment_reference"),
    paid_at: valueOf("p_paid_at") || todayString(),
    notes: valueOf("p_notes")
  };

  try {
    setStatus(`${editingId ? "Updating" : "Saving"} payment for ${state.paymentSlug}...`, "");
    const response = await fetch(`/api/payment/${state.paymentSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Renewal failed.");
    }

    state.paymentRecord = data.data;
    state.selectedSlug = data.data.slug;
    invalidateRevenueReportCache();
    await Promise.allSettled([
      refreshDirectory({ reloadReport: false, reloadPaymentRecord: false }),
      loadRevenueReport(state.reports.period, { force: true })
    ]);
    updatePaymentFocus();
    toast(
      "✅ Payment Saved",
      editingId
        ? "The selected payment record was updated."
        : `The business was renewed on the ${valueOf("p_plan") || getDefaultPlanLabel()} plan.`,
      "success"
    );
    setStatus(`${editingId ? "Updated" : "Renewed"} ${data.data.name}.`, "");
  } catch (error) {
    toast("❌ Renewal Error", error.message, "error");
  }
}

function collectBusinessPayload() {
  const paymentStatus = valueOf("f_payment_status");
  const paidAt =
    paymentStatus === "active" || paymentStatus === "expired"
      ? valueOf("f_paid_at") || todayString()
      : "";
  return {
    original_slug: valueOf("f_original_slug"),
    id: valueOf("f_business_id"),
    slug: valueOf("f_slug"),
    name: valueOf("f_name"),
    name_np: valueOf("f_name_np"),
    type: valueOf("f_type"),
    affiliation: valueOf("f_affiliation"),
    district: valueOf("f_district"),
    zone: valueOf("f_zone"),
    province: valueOf("f_province"),
    established_year: integerOrNull("f_established"),
    is_verified: checked("f_verified"),
    is_certified: checked("f_certified"),
    level: getSelected("level"),
    field: getSelected("field"),
    programs: state.formTags.programs.slice(),
    tags: state.formTags.tags.slice(),
    description: valueOf("f_description"),
    contact: {
      address: valueOf("f_address"),
      phone: valueOf("f_phone") ? [valueOf("f_phone")] : [],
      email: valueOf("f_email"),
      website: valueOf("f_website"),
      map: {
        lat: numberOrNull("f_lat"),
        lng: numberOrNull("f_lng")
      }
    },
    stats: {
      students: integerOrNull("f_students"),
      faculty: integerOrNull("f_faculty"),
      rating: numberOrNull("f_rating"),
      programs_count: state.formTags.programs.length || null
    },
    media: {
      logo: valueOf("f_logo"),
      cover: valueOf("f_cover"),
      gallery: listValueOf("f_gallery"),
      videos: listValueOf("f_videos")
    },
    facilities: getSelected("facility"),
    social: {
      facebook: valueOf("f_facebook"),
      instagram: valueOf("f_instagram"),
      youtube: valueOf("f_youtube"),
      twitter: valueOf("f_twitter")
    },
    institution_head: {
      name: valueOf("f_head_name"),
      role: valueOf("f_head_role"),
      email: valueOf("f_email"),
      phone: valueOf("f_phone")
    },
    registration: {
      send_confirmation_email: checked("f_send_confirmation_email"),
      send_id_card_email: checked("f_send_id_card_email")
    },
    subscription: {
      plan: valueOf("f_plan") || getDefaultPlanLabel(),
      payment_status: paymentStatus,
      amount: numberOrNull("f_amount"),
      currency: valueOf("f_currency") || state.planCatalog?.currency || "NPR",
      payment_method: valueOf("f_payment_method"),
      payment_reference: valueOf("f_payment_reference"),
      paid_at: paidAt,
      auto_renew: valueOf("f_auto_renew") === "true",
      notes: valueOf("f_payment_notes")
    }
  };
}

function fillBusinessForm(record) {
  resetBusinessForm();
  document.getElementById("f_original_slug").value = record.slug || "";
  document.getElementById("f_name").value = record.name || "";
  document.getElementById("f_name_np").value = record.name_np || "";
  document.getElementById("f_business_id").value = record.id || "";
  document.getElementById("f_slug").value = record.slug || "";
  document.getElementById("f_slug").dataset.manual = "true";
  document.getElementById("f_type").value = record.type || "";
  document.getElementById("f_affiliation").value = record.affiliation || "";
  document.getElementById("f_established").value = record.established_year || "";
  document.getElementById("f_head_name").value = record.institution_head?.name || "";
  document.getElementById("f_head_role").value = record.institution_head?.role || "";
  document.getElementById("f_province").value = String(record.province || "");
  populateZoneSelect("f_zone", valueOf("f_province"), String(record.zone || ""), "Select zone");
  populateDistrictSelect("f_district", valueOf("f_province"), valueOf("f_zone"), record.district || "", "Select district");
  updateLocationCatalogSummary();
  document.getElementById("f_address").value = record.contact?.address || "";
  document.getElementById("f_phone").value = record.contact?.phone?.[0] || "";
  document.getElementById("f_email").value = record.contact?.email || "";
  document.getElementById("f_website").value = record.contact?.website || "";
  document.getElementById("f_lat").value = record.contact?.map?.lat ?? "";
  document.getElementById("f_lng").value = record.contact?.map?.lng ?? "";
  document.getElementById("f_description").value = record.description || "";
  document.getElementById("f_students").value = record.stats?.students ?? "";
  document.getElementById("f_faculty").value = record.stats?.faculty ?? "";
  document.getElementById("f_rating").value = record.stats?.rating ?? "";
  document.getElementById("f_logo").value = record.media?.logo || "";
  document.getElementById("f_cover").value = record.media?.cover || "";
  document.getElementById("f_gallery").value = formatListValue(record.media?.gallery);
  document.getElementById("f_videos").value = formatListValue(record.media?.videos);
  document.getElementById("f_facebook").value = record.social?.facebook || "";
  document.getElementById("f_instagram").value = record.social?.instagram || "";
  document.getElementById("f_youtube").value = record.social?.youtube || "";
  document.getElementById("f_twitter").value = record.social?.twitter || "";
  document.getElementById("f_verified").checked = Boolean(record.is_verified);
  document.getElementById("f_certified").checked = Boolean(record.is_certified);

  setSelected("level", record.level || []);
  setSelected("field", record.field || []);
  setSelected("facility", record.facilities || []);
  state.formTags.programs = (record.programs || []).slice();
  state.formTags.tags = (record.tags || []).slice();
  renderTags("programs");
  renderTags("tags");

  setPlanSelectValue("f_plan", record.subscription?.plan || getDefaultPlanLabel());
  document.getElementById("f_payment_status").value = record.subscription?.payment_status || "pending";
  document.getElementById("f_amount").value =
    record.subscription?.amount ?? getPlanDefinition(record.subscription?.plan)?.amount ?? "";
  document.getElementById("f_currency").value = record.subscription?.currency || state.planCatalog?.currency || "NPR";
  document.getElementById("f_payment_method").value = record.subscription?.payment_method || "";
  document.getElementById("f_payment_reference").value = record.subscription?.payment_reference || "";
  document.getElementById("f_paid_at").value = toDateInput(record.subscription?.paid_at) || "";
  document.getElementById("f_auto_renew").value = record.subscription?.auto_renew ? "true" : "false";
  document.getElementById("f_payment_notes").value = record.subscription?.notes || "";
  document.getElementById("f_send_confirmation_email").checked =
    record.registration?.confirmation_email_enabled !== false;
  document.getElementById("f_send_id_card_email").checked =
    record.registration?.send_id_card_email !== false;
  updateSlugPreview();
  updateSubscriptionPreview();
}

function resetBusinessForm() {
  [
    "f_original_slug",
    "f_name",
    "f_name_np",
    "f_business_id",
    "f_slug",
    "f_affiliation",
    "f_established",
    "f_head_name",
    "f_head_role",
    "f_zone",
    "f_address",
    "f_phone",
    "f_email",
    "f_website",
    "f_lat",
    "f_lng",
    "f_description",
    "f_students",
    "f_faculty",
    "f_rating",
    "f_logo",
    "f_cover",
    "f_gallery",
    "f_videos",
    "f_facebook",
    "f_instagram",
    "f_youtube",
    "f_twitter",
    "f_payment_reference",
    "f_payment_notes",
    "f_amount"
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });

  document.getElementById("f_slug").dataset.manual = "false";
  document.getElementById("f_type").value = "";
  document.getElementById("f_province").value = "";
  populateZoneSelect("f_zone", "", "", "Select zone");
  populateDistrictSelect("f_district", "", "", "", "Select district");
  document.getElementById("f_verified").checked = false;
  document.getElementById("f_certified").checked = false;
  setPlanSelectValue("f_plan", getDefaultPlanLabel());
  document.getElementById("f_payment_status").value = "pending";
  syncPlanAmount("f_plan", "f_amount");
  document.getElementById("f_currency").value = state.planCatalog?.currency || "NPR";
  document.getElementById("f_payment_method").value = "";
  document.getElementById("f_paid_at").value = "";
  document.getElementById("f_auto_renew").value = "false";
  document.getElementById("f_send_confirmation_email").checked = true;
  document.getElementById("f_send_id_card_email").checked = true;
  clearChipSelection();
  state.formTags.programs = [];
  state.formTags.tags = [];
  renderTags("programs");
  renderTags("tags");
  updateSlugPreview();
  updateSubscriptionPreview();
  updateLocationCatalogSummary();
}

function resetPaymentForm() {
  state.paymentEditingId = null;
  document.getElementById("p_payment_id").value = "";
  setPlanSelectValue("p_plan", getDefaultPlanLabel());
  syncPlanAmount("p_plan", "p_amount");
  document.getElementById("p_currency").value = state.planCatalog?.currency || "NPR";
  document.getElementById("p_payment_method").value = "";
  document.getElementById("p_payment_reference").value = "";
  document.getElementById("p_paid_at").value = todayString();
  document.getElementById("p_notes").value = "";
  document.getElementById("paymentSubmitBtn").textContent = "Save New Renewal";
}

function handleEditorSecondaryAction() {
  if (state.editorMode === "add") {
    resetBusinessForm();
    return;
  }

  if (!state.selectedSlug) {
    toast("⚠️ No Selection", "Select a business in edit mode first.", "error");
    return;
  }

  loadBusinessIntoEditor(state.selectedSlug);
}

function saveFromMenu() {
  closeMenus();
  saveBusiness();
}

function editSelectedBusiness() {
  closeMenus();
  const slug = state.selectedSlug || state.paymentSlug;
  if (!slug) {
    toast("⚠️ No Selection", "Select a business first.", "error");
    return;
  }
  openEditView(slug);
}

function openEditFromPayment() {
  if (!state.paymentSlug) {
    toast("⚠️ No Selection", "Select a business in the Payment Center first.", "error");
    return;
  }
  openEditView(state.paymentSlug);
}

function deleteCurrentBusiness() {
  closeMenus();
  const slug =
    state.currentView === "payments"
      ? state.paymentSlug || state.selectedSlug
      : state.currentView === "editor" && state.editorMode === "edit"
        ? valueOf("f_original_slug") || state.selectedSlug
        : state.selectedSlug;
  if (!slug) {
    toast("⚠️ Nothing To Delete", "Select a business in edit mode before deleting.", "error");
    return;
  }

  showModal({
    title: "Delete Business",
    icon: "🗑️",
    body: `Delete <b>${escapeHtml(slug)}</b> from <code>data/basic/_cards.json</code>, <code>data/detailed/${escapeHtml(slug)}.json</code>, and <code>data/payments/${escapeHtml(slug)}</code>? This cannot be undone.`,
    confirmLabel: "Delete",
    confirmClass: "danger",
    onConfirm: async () => {
      try {
        const response = await fetch(`/api/delete/${slug}`, { method: "DELETE" });
        const payload = await response.json();
        if (!payload.success) {
          throw new Error(payload.error || "Delete failed.");
        }

        if (state.selectedSlug === slug) {
          state.selectedSlug = null;
        }
        if (state.paymentSlug === slug) {
          state.paymentSlug = null;
          state.paymentRecord = null;
        }
        resetBusinessForm();
        invalidateRevenueReportCache();
        await Promise.allSettled([
          refreshDirectory({ reloadReport: false, reloadPaymentRecord: false }),
          loadRevenueReport(state.reports.period, { force: true })
        ]);
        if (state.currentView === "editor" && state.editorMode === "edit") {
          renderEditList();
        }
        updatePaymentFocus();
        updateChrome();
        toast("🗑️ Deleted", `${slug} was removed from the directory.`, "success");
      } catch (error) {
        toast("❌ Delete Error", error.message, "error");
      }
    }
  });
}

function showExpiringSoon() {
  closeMenus();
  state.filters.payments.status = "expiring";
  document.getElementById("payStatus").value = "expiring";
  openPaymentsView();
}

function showActiveOnly() {
  closeMenus();
  state.filters.dashboard.status = "active";
  document.getElementById("dashStatus").value = "active";
  showDashboard();
}

function renewSelectedFromTools() {
  closeMenus();
  if (!state.selectedSlug && !state.paymentSlug) {
    toast("⚠️ No Selection", "Select a business before opening renewal tools.", "error");
    return;
  }
  openPaymentsView(state.paymentSlug || state.selectedSlug);
}

function clearSelection() {
  state.selectedSlug = null;
  state.paymentSlug = null;
  state.paymentRecord = null;
  updateSelectedSummary();
  updatePaymentFocus();
  renderDashboard();
  renderEditList();
  renderPayments();
  updateChrome();
  setStatus("Selection cleared.", "");
}

function updateSelectedSummary() {
  const summary = document.getElementById("selectedSummary");
  const lookupSlug = state.selectedSlug || state.paymentSlug;
  const business = getBusinessBySlug(lookupSlug);
  document.getElementById("selectionEditBtn").disabled = !business;
  document.getElementById("selectionPaymentBtn").disabled = !business;
  document.getElementById("selectionEmailBtn").disabled = !business || !String(business?.contact?.email || "").trim();
  document.getElementById("selectionClearBtn").disabled = !business;
  if (!business) {
    summary.className = "selected-summary empty";
    summary.textContent = "Pick a business from the directory, edit manager, or payment center to keep it selected here.";
    return;
  }

  summary.className = "selected-summary";
  summary.innerHTML = `
    <div class="summary-head">
      <div class="summary-main">
        <div class="summary-title">${escapeHtml(business.name)}</div>
        <div class="summary-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.slug)} · ${escapeHtml(business.location_full_label || business.location_label || "No location")}</div>
      </div>
      <div class="summary-badges">${renderStatusBadge(getDisplayStatus(business))}</div>
    </div>
    <div class="gen-badge-row">${renderGenerationBadges(business.generator)}</div>
    <div class="summary-inline">
      <span>Type <b>${escapeHtml(business.type || "Not set")}</b></span>
      <span>Plan <b>${escapeHtml(business.subscription?.plan || getDefaultPlanLabel())}</b></span>
      <span>Expires <b>${escapeHtml(formatDate(business.subscription?.expires_at))}</b></span>
      <span>Timer <b>${escapeHtml(formatCountdown(business.subscription?.expires_at, getStatus(business)))}</b></span>
    </div>
  `;
}

function updatePaymentFocus() {
  const focus = document.getElementById("paymentFocus");
  const history = document.getElementById("paymentHistoryList");
  if (!state.paymentRecord) {
    focus.className = "payment-focus empty";
    focus.textContent = "Select a business to renew the subscription or review payment history.";
    history.innerHTML = "";
    resetPaymentForm();
    return;
  }

  const business = state.paymentRecord;
  focus.className = "payment-focus";
  focus.innerHTML = `
    <div class="summary-title">${escapeHtml(business.name)}</div>
    <div class="summary-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.location_label || "No location")}</div>
    <div class="summary-badges">${renderStatusBadge(getDisplayStatus(business))}</div>
    <div class="focus-countdown" data-expiry="${escapeHtml(business.subscription?.expires_at || "")}" data-status="${getStatus(business)}">${escapeHtml(formatCountdown(business.subscription?.expires_at, getStatus(business)))}</div>
    <div>Last paid: <b>${escapeHtml(formatDate(business.subscription?.paid_at))}</b></div>
    <div>Current expiry: <b>${escapeHtml(formatDate(business.subscription?.expires_at))}</b></div>
    <div>Amount: <b>${escapeHtml(formatCurrency(business.subscription?.amount, business.subscription?.currency))}</b></div>
  `;

  if (state.paymentEditingId) {
    const paymentToEdit = (business.payment_history || []).find((item) => item.id === state.paymentEditingId);
    if (paymentToEdit) {
      fillPaymentForm(paymentToEdit);
    } else {
      resetPaymentForm();
      applyPaymentDefaults(business);
    }
  } else {
    resetPaymentForm();
    applyPaymentDefaults(business);
  }

  const items = (business.payment_history || []).slice().reverse();
  history.innerHTML = items.length
    ? items
        .map((item) => `
          <div class="history-item ${item.id === state.paymentEditingId ? "active" : ""}">
            <div><b>${escapeHtml(formatDate(item.paid_at))}</b> · ${escapeHtml(formatCurrency(item.amount, item.currency))}</div>
            <div>${escapeHtml(item.payment_method || "Method not set")} · ${escapeHtml(item.payment_reference || "No reference")}</div>
            <div>Covered until <b>${escapeHtml(formatDate(item.expires_at))}</b></div>
            <div class="table-actions space-top">
              <button type="button" class="row-btn" onclick="editPaymentHistoryItem('${escapeHtml(item.id)}')">Edit</button>
            </div>
          </div>
        `)
        .join("")
    : `<div class="empty-state">No payment history recorded yet.</div>`;
}

function applyPaymentDefaults(business) {
  setPlanSelectValue("p_plan", business.subscription?.plan || getDefaultPlanLabel());
  const usesCurrentCatalogPlan = hasCatalogPlan(business.subscription?.plan);
  document.getElementById("p_amount").value =
    usesCurrentCatalogPlan
      ? getPlanDefinition(business.subscription?.plan)?.amount ??
        business.subscription?.amount ??
        ""
      : business.subscription?.amount ??
        getPlanDefinition(getDefaultPlanLabel())?.amount ??
        "";
  document.getElementById("p_currency").value = business.subscription?.currency || state.planCatalog?.currency || "NPR";
  document.getElementById("p_payment_method").value = business.subscription?.payment_method || "";
  document.getElementById("p_payment_reference").value = "";
  document.getElementById("p_paid_at").value = todayString();
  document.getElementById("p_notes").value = "";
}

function fillPaymentForm(payment) {
  state.paymentEditingId = payment.id;
  document.getElementById("p_payment_id").value = payment.id || "";
  setPlanSelectValue("p_plan", payment.plan || getDefaultPlanLabel());
  document.getElementById("p_amount").value = payment.amount ?? getPlanDefinition(payment.plan)?.amount ?? "";
  document.getElementById("p_currency").value = payment.currency || state.planCatalog?.currency || "NPR";
  document.getElementById("p_payment_method").value = payment.payment_method || "";
  document.getElementById("p_payment_reference").value = payment.payment_reference || "";
  document.getElementById("p_paid_at").value = toDateInput(payment.paid_at) || todayString();
  document.getElementById("p_notes").value = payment.notes || "";
  document.getElementById("paymentSubmitBtn").textContent = "Update Payment Record";
}

function editPaymentHistoryItem(paymentId) {
  if (!state.paymentRecord) {
    toast("⚠️ No Selection", "Select a business in the Payment Center first.", "error");
    return;
  }

  const payment = (state.paymentRecord.payment_history || []).find((item) => item.id === paymentId);
  if (!payment) {
    toast("⚠️ Missing Payment", "That payment record could not be found.", "error");
    return;
  }

  fillPaymentForm(payment);
  updatePaymentFocus();
  setStatus(`Editing payment from ${formatDate(payment.paid_at)}.`, "");
}

function clearPaymentEditor() {
  resetPaymentForm();
  if (state.paymentRecord) {
    applyPaymentDefaults(state.paymentRecord);
    updatePaymentFocus();
    setStatus(`Ready to add a new payment for ${state.paymentRecord.name}.`, "");
  }
}

function autoSlug() {
  if (state.editorMode !== "add") {
    return;
  }
  const slugInput = document.getElementById("f_slug");
  if (slugInput.dataset.manual === "true") {
    return;
  }
  slugInput.value = slugify(valueOf("f_name"));
  updateSlugPreview();
}

function updateSlugPreview() {
  const slug = valueOf("f_slug");
  document.getElementById("slugPreview").textContent = slug
    ? `Card index: data/basic/_cards.json · Detail file: data/detailed/${slug}.json`
    : "Slug will be generated from the business name.";
}

function updateSubscriptionPreview() {
  const status = valueOf("f_payment_status") || "pending";
  const plan = getPlanDefinition(valueOf("f_plan"));
  const paidAt = valueOf("f_paid_at");
  const preview = document.getElementById("subscriptionPreview");

  if (status === "pending") {
    preview.textContent = plan
      ? `Pending payment. ${plan.label} will run for ${plan.months} months at ${formatCurrency(plan.amount, plan.currency)}${plan.discount_percent ? ` with ${plan.discount_percent}% discount.` : "."}`
      : "Pending payment. Save a paid listing to start the selected subscription term.";
    return;
  }

  if (!paidAt) {
    preview.textContent = plan
      ? `Choose the paid date. ${plan.label} will expire ${plan.months} months after that date.`
      : "Choose the paid date to calculate the subscription expiry.";
    return;
  }

  const start = new Date(paidAt);
  if (Number.isNaN(start.getTime())) {
    preview.textContent = "Enter a valid paid date to calculate the subscription expiry.";
    return;
  }
  const planMonths = plan?.months || 12;
  const expiry = addMonthsSafe(start, planMonths);
  const amountText = formatCurrency(
    numberOrNull("f_amount") ?? plan?.amount,
    valueOf("f_currency") || plan?.currency || "NPR"
  );
  const discountText = plan?.discount_percent ? ` · ${plan.discount_percent}% discount` : "";
  preview.textContent = `${status === "expired" ? "Expired cycle" : "Active cycle"}: ${formatDate(start.toISOString())} to ${formatDate(expiry.toISOString())} · ${amountText}${discountText}`;
}

function handleTagInput(event, group) {
  if (event.key !== "Enter" && event.key !== ",") {
    return;
  }
  event.preventDefault();
  const value = event.target.value.trim().replace(/,$/, "");
  if (!value || state.formTags[group].includes(value)) {
    event.target.value = "";
    return;
  }
  state.formTags[group].push(value);
  event.target.value = "";
  renderTags(group);
}

function renderTags(group) {
  const container = document.getElementById(group === "programs" ? "programsContainer" : "tagsContainer");
  const input = document.getElementById(group === "programs" ? "programInput" : "tagInput");
  container.querySelectorAll(".tag-badge").forEach((element) => element.remove());
  state.formTags[group].forEach((value) => {
    const badge = document.createElement("span");
    badge.className = "tag-badge";
    badge.append(document.createTextNode(value));
    const remove = document.createElement("span");
    remove.className = "tag-remove";
    remove.dataset.group = group;
    remove.dataset.removeTag = value;
    remove.textContent = "×";
    badge.append(document.createTextNode(" "));
    badge.append(remove);
    container.insertBefore(badge, input);
  });
}

function removeTagValue(group, value) {
  state.formTags[group] = state.formTags[group].filter((item) => item !== value);
  renderTags(group);
}

function clearChipSelection() {
  document.querySelectorAll(".chip.selected").forEach((chip) => chip.classList.remove("selected"));
}

function getSelected(group) {
  return [...document.querySelectorAll(`.chip[data-group="${group}"].selected`)].map((chip) => chip.dataset.value);
}

function setSelected(group, values) {
  const selected = new Set(values || []);
  document.querySelectorAll(`.chip[data-group="${group}"]`).forEach((chip) => {
    chip.classList.toggle("selected", selected.has(chip.dataset.value));
  });
}

function toggleMenu(menuId) {
  const menu = document.getElementById(menuId);
  const wrap = menu.closest(".menu-wrap");
  const opening = !wrap.classList.contains("open");
  closeMenus();
  wrap.classList.toggle("open", opening);
}

function closeMenus() {
  document.querySelectorAll(".menu-wrap.open").forEach((wrap) => wrap.classList.remove("open"));
}

function showAdminGuide() {
  closeMenus();
  showModal({
    title: "Admin Guide",
    icon: "📘",
    body: [
      "1. Use <b>Directory Overview</b> to filter by province, district, and payment status.",
      "2. Use <b>Add Business</b> to create a listing with initial payment details.",
      "3. Use <b>Edit Businesses</b> to filter, update, and delete existing listings.",
      "4. Use <b>Payment Center</b> to renew listings with the current plan catalog rates.",
      "5. Use <b>Reports</b> to track revenue, expenses, net performance, and category trends."
    ].join("<br><br>"),
    confirmLabel: "Close",
    hideCancel: true
  });
}

function showAboutDialog() {
  closeMenus();
  showModal({
    title: "About XP Admin",
    icon: "🏛️",
    body: "EduData Nepal XP Directory Admin uses a single basic card index, per-business detailed files, separate add/edit flows, and plan-based payment tracking.",
    confirmLabel: "Close",
    hideCancel: true
  });
}

function showModal({
  title,
  icon,
  body,
  confirmLabel,
  confirmClass = "primary",
  hideCancel = false,
  onConfirm = null,
  size = "normal"
}) {
  state.modalAction = onConfirm;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalIcon").textContent = icon;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modalOverlay").dataset.size = size;
  document.getElementById("modalDialog").classList.toggle("wide", size === "wide");
  const confirmBtn = document.getElementById("modalConfirmBtn");
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = `tb-btn ${confirmClass}`;
  document.getElementById("modalCancelBtn").classList.toggle("hidden", hideCancel);
  document.getElementById("modalOverlay").classList.add("show");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("show");
  document.getElementById("modalOverlay").dataset.size = "normal";
  document.getElementById("modalDialog").classList.remove("wide");
  state.modalAction = null;
}

function confirmModalAction() {
  const action = state.modalAction;
  closeModal();
  if (typeof action === "function") {
    action();
  }
}

function toast(title, message, type = "success") {
  const element = document.getElementById("toast");
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastMsg").textContent = message;
  document.getElementById("toastIcon").textContent = type === "error" ? "❌" : "✅";
  element.className = `xp-toast show ${type}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove("show"), 4200);
}

function closeToast() {
  document.getElementById("toast").classList.remove("show");
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    document.getElementById("trayTime").textContent = `${hh}:${mm}`;
    document.getElementById("statusTime").textContent = `${formatDate(now.toISOString())} ${hh}:${mm}`;
  };
  tick();
  setInterval(tick, 10000);
}

function startCountdownTicker() {
  const refreshCountdowns = () => {
    document.querySelectorAll("[data-expiry]").forEach((element) => {
      const status = element.dataset.status || "pending";
      element.textContent = formatCountdown(element.dataset.expiry, status);
    });
  };
  refreshCountdowns();
  setInterval(refreshCountdowns, 1000);
}

function setStatus(message, countText) {
  document.getElementById("statusMsg").textContent = message;
  if (countText !== "") {
    document.getElementById("statusCount").textContent = countText;
  }
}

function getBusinessBySlug(slug) {
  return state.businesses.find((business) => business.slug === slug) || null;
}

function getStatus(business) {
  return business?.subscription?.payment_status || "pending";
}

function getDisplayStatus(business) {
  return isExpiringSoon(business) ? "expiring" : getStatus(business);
}

function isExpiringSoon(business) {
  const days = business?.subscription?.days_remaining;
  return getStatus(business) === "active" && typeof days === "number" && days >= 0 && days <= 7;
}

function renderStatusBadge(status) {
  const label = status === "active" ? "Active" : status === "expired" ? "Expired" : status === "expiring" ? "Expiring Soon" : "Pending";
  const css = status === "active" ? "active" : status === "expired" ? "expired" : status === "expiring" ? "expiring" : "pending";
  return `<span class="badge ${css}">${label}</span>`;
}

function renderGenerationBadges(generator) {
  const hasWebsite = Boolean(generator?.has_website);
  const hasApk = Boolean(generator?.has_apk);
  return `
    <span class="gen-badge ${hasWebsite ? "web-ready" : "not-ready"}">${hasWebsite ? "Web Ready" : "Web Missing"}</span>
    <span class="gen-badge ${hasApk ? "apk-ready" : "not-ready"}">${hasApk ? "APK Ready" : "APK Missing"}</span>
  `;
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCountdown(value, status) {
  if (!value) {
    return status === "pending" ? "Pending payment" : "No timer";
  }
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) {
    return "Invalid timer";
  }
  const diff = expiry.getTime() - Date.now();
  if (diff <= 0) {
    return `Expired ${formatDuration(Math.abs(diff))} ago`;
  }
  return `${formatDuration(diff)} left`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(minutes, 0)}m`;
}

function formatCurrency(amount, currency = "NPR") {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }
  const number = Number(amount);
  if (!Number.isFinite(number)) {
    return "—";
  }
  return `${currency} ${number.toLocaleString()}`;
}

function formatCurrencyBreakdown(breakdown) {
  const entries = Object.entries(breakdown || {}).filter(([, amount]) => Number.isFinite(Number(amount)));
  if (!entries.length) {
    return "NPR 0";
  }
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(" / ");
}

function formatCompactAmount(amount) {
  if (!amount) {
    return "0";
  }
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return String(Math.round(amount));
}

function todayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addMonthsSafe(date, monthCount) {
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
  const nextDay = Math.min(day, lastDayOfTargetMonth.getUTCDate());
  return new Date(
    Date.UTC(
      lastDayOfTargetMonth.getUTCFullYear(),
      lastDayOfTargetMonth.getUTCMonth(),
      nextDay,
      hours,
      minutes,
      seconds,
      milliseconds
    )
  );
}

function toDateInput(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function listValueOf(id) {
  return document.getElementById(id).value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatListValue(values) {
  return Array.isArray(values) ? values.filter(Boolean).join("\n") : "";
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function checked(id) {
  return document.getElementById(id).checked;
}

function integerOrNull(id) {
  const value = valueOf(id);
  return value ? Number.parseInt(value, 10) : null;
}

function numberOrNull(id) {
  const value = valueOf(id);
  return value ? Number.parseFloat(value) : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
