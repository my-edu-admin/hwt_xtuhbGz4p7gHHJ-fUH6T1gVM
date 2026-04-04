(function () {
  state.idManager = state.idManager || { selectedSlug: null };
  state.backups = state.backups || { selectedId: null, snapshot: null };

  function getBusinessCardStatus(business) {
    return String(business?.id_card?.status || "draft").trim().toLowerCase() || "draft";
  }

  function selectedIdBusiness() {
    return (state.businesses || []).find((item) => item.slug === state.idManager.selectedSlug) || null;
  }

  function setIdManagerStatus(message) {
    const element = document.getElementById("idManagerStatusLabel");
    if (element) {
      element.textContent = message;
    }
  }

  function setBackupStatus(message) {
    const element = document.getElementById("backupStatusLabel");
    if (element) {
      element.textContent = message;
    }
  }

  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch {
      return { success: false, error: "Unexpected server response." };
    }
  }

  function buildIdCardPreviewMarkup(business) {
    if (!business) {
      return "Select a business to render the ID card preview.";
    }

    const headName = valueOf("idCardHeadName") || business.institution_head?.name || "Institution head not set";
    const headRole = valueOf("idCardHeadRole") || business.institution_head?.role || "Institution Head";
    const title = valueOf("idCardTitle") || business.id_card?.title || "Institution ID Card";
    const subtitle = valueOf("idCardSubtitle") || business.id_card?.subtitle || "Business registration profile";
    const notes = valueOf("idCardNotes") || business.id_card?.notes || "";
    return `
      <div class="id-card-preview">
        <div class="id-card-kicker">${escapeHtml(title)}</div>
        <div class="id-card-name">${escapeHtml(business.name || "Untitled Business")}</div>
        <div class="id-card-subtitle">${escapeHtml(subtitle)}</div>
        <div class="id-card-grid">
          <div><span>ID</span><strong>${escapeHtml(business.id || "Pending")}</strong></div>
          <div><span>Type</span><strong>${escapeHtml(business.type || "Not set")}</strong></div>
          <div><span>Institution Head</span><strong>${escapeHtml(headName)}</strong></div>
          <div><span>Role</span><strong>${escapeHtml(headRole)}</strong></div>
          <div><span>Email</span><strong>${escapeHtml(business.contact?.email || "Not set")}</strong></div>
          <div><span>Location</span><strong>${escapeHtml(business.location_full_label || business.location_label || "Not set")}</strong></div>
        </div>
        ${
          notes
            ? `<div class="id-card-note">${escapeHtml(notes)}</div>`
            : ""
        }
      </div>
    `;
  }

  function fillIdCardForm(business) {
    document.getElementById("idCardBusinessId").value = business?.id || "";
    document.getElementById("idCardStatus").value = business ? getBusinessCardStatus(business) : "";
    document.getElementById("idCardHeadName").value = business?.id_card?.holder_name || business?.institution_head?.name || "";
    document.getElementById("idCardHeadRole").value = business?.id_card?.holder_role || business?.institution_head?.role || "";
    document.getElementById("idCardTitle").value = business?.id_card?.title || "Institution ID Card";
    document.getElementById("idCardSubtitle").value = business?.id_card?.subtitle || "Business registration profile";
    document.getElementById("idCardNotes").value = business?.id_card?.notes || "";
    document.getElementById("idCardPreview").innerHTML = buildIdCardPreviewMarkup(business);
  }

  function renderIdManagerSelection() {
    const summary = document.getElementById("idManagerSummary");
    const modePill = document.getElementById("idManagerModePill");
    const business = selectedIdBusiness();
    if (!summary) {
      return;
    }

    if (!business) {
      summary.className = "payment-focus empty";
      summary.textContent = "Select a business to inspect the registration ID and institution head card.";
      if (modePill) {
        modePill.textContent = "READY";
      }
      fillIdCardForm(null);
      return;
    }

    summary.className = "payment-focus";
    summary.innerHTML = `
      <div class="summary-title">${escapeHtml(business.name)}</div>
      <div class="summary-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.slug || "")}</div>
      <div class="summary-inline">
        <span>Head <b>${escapeHtml(business.institution_head?.name || "Not set")}</b></span>
        <span>Status <b>${escapeHtml(getBusinessCardStatus(business))}</b></span>
        <span>Email <b>${escapeHtml(business.contact?.email || "Not set")}</b></span>
      </div>
      <div class="summary-meta">${escapeHtml(business.location_full_label || business.location_label || "No location")}</div>
    `;
    if (modePill) {
      modePill.textContent = getBusinessCardStatus(business).toUpperCase();
    }
    fillIdCardForm(business);
  }

  function filteredIdBusinesses() {
    const query = String(document.getElementById("idManagerSearch")?.value || "").trim().toLowerCase();
    const province = String(document.getElementById("idManagerProvince")?.value || "");
    const status = String(document.getElementById("idManagerStatus")?.value || "all");
    return (state.businesses || []).filter((business) => {
      if (province && String(business.province || "") !== province) {
        return false;
      }
      if (status !== "all" && getBusinessCardStatus(business) !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return String(business.search_text || "").includes(query);
    });
  }

  function renderIdManagerList() {
    const list = document.getElementById("idManagerList");
    const stats = document.getElementById("idManagerStats");
    if (!list) {
      return;
    }

    const items = filteredIdBusinesses();
    if (stats) {
      const completeCount = items.filter((item) => getBusinessCardStatus(item) === "complete").length;
      stats.textContent = `${items.length} businesses · ${completeCount} complete cards`;
    }

    list.innerHTML = items.length
      ? items
          .map(
            (business) => `
              <button type="button" class="generator-business-item ${business.slug === state.idManager.selectedSlug ? "active" : ""}" onclick="selectIdManagerBusiness('${escapeHtml(business.slug)}')">
                <div class="generator-business-title">${escapeHtml(business.name)}</div>
                <div class="generator-business-meta">${escapeHtml(business.id || "No ID")} · ${escapeHtml(business.slug)}</div>
                <div class="generator-business-copy">${escapeHtml(getBusinessCardStatus(business))} · ${escapeHtml(business.institution_head?.name || "Head not set")}</div>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state">No businesses matched the current ID filter.</div>`;
  }

  async function refreshBusinessDirectoryState() {
    await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: false });
    renderIdManagerList();
    renderIdManagerSelection();
  }

  window.loadIdManagerApp = async function loadIdManagerApp({ loading } = {}) {
    if (!state.businesses.length) {
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, loading });
    }
    populateProvinceSelect("idManagerProvince", "All provinces");
    document.getElementById("idManagerProvince").value = document.getElementById("idManagerProvince").value || "";
    renderIdManagerList();
    if (!selectedIdBusiness()) {
      state.idManager.selectedSlug = state.idManager.selectedSlug || state.selectedSlug || state.paymentSlug || state.businesses[0]?.slug || null;
    }
    renderIdManagerSelection();
    setIdManagerStatus("ID manager loaded.");
  };

  window.selectIdManagerBusiness = function selectIdManagerBusiness(slug) {
    state.idManager.selectedSlug = slug;
    renderIdManagerList();
    renderIdManagerSelection();
    setIdManagerStatus(`Selected ${selectedIdBusiness()?.name || slug}.`);
  };

  window.resetIdCardFormToDefault = function resetIdCardFormToDefault() {
    const business = selectedIdBusiness();
    if (!business) {
      toast("⚠️ No Business", "Select a business before resetting the ID card.", "error");
      return;
    }
    document.getElementById("idCardHeadName").value = business.institution_head?.name || "";
    document.getElementById("idCardHeadRole").value = business.institution_head?.role || "Institution Head";
    document.getElementById("idCardTitle").value = "Institution ID Card";
    document.getElementById("idCardSubtitle").value = "Business registration profile";
    document.getElementById("idCardNotes").value = "";
    document.getElementById("idCardPreview").innerHTML = buildIdCardPreviewMarkup(business);
    setIdManagerStatus("ID card form reset to default values.");
  };

  window.saveSelectedIdCard = async function saveSelectedIdCard() {
    const business = selectedIdBusiness();
    if (!business) {
      toast("⚠️ No Business", "Select a business before saving the ID card.", "error");
      return;
    }

    try {
      const response = await fetch(`/api/id-card/${encodeURIComponent(business.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          head_name: valueOf("idCardHeadName"),
          head_role: valueOf("idCardHeadRole"),
          title: valueOf("idCardTitle"),
          subtitle: valueOf("idCardSubtitle"),
          notes: valueOf("idCardNotes"),
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to save the ID card.");
      }

      state.idManager.selectedSlug = payload.data?.record?.slug || business.slug;
      await refreshBusinessDirectoryState();
      toast("🪪 ID Card Saved", `Saved the ID card for ${business.name}.`, "success");
      setIdManagerStatus("ID card saved.");
    } catch (error) {
      toast("❌ ID Card Error", error.message, "error");
      setIdManagerStatus("ID card save failed.");
    }
  };

  window.sendSelectedIdCardEmail = async function sendSelectedIdCardEmail() {
    const business = selectedIdBusiness();
    if (!business) {
      toast("⚠️ No Business", "Select a business before sending the ID card.", "error");
      return;
    }

    try {
      const response = await fetch(`/api/id-card/${encodeURIComponent(business.slug)}/send`, {
        method: "POST",
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to send the ID card email.");
      }

      state.idManager.selectedSlug = payload.data?.record?.slug || business.slug;
      await refreshBusinessDirectoryState();
      toast("✉️ ID Card Sent", `Sent the ID card to ${payload.data?.delivery?.email || business.contact?.email || "the business email"}.`, "success");
      setIdManagerStatus("ID card email sent.");
    } catch (error) {
      toast("❌ ID Card Error", error.message, "error");
      setIdManagerStatus("ID card email failed.");
    }
  };

  window.openSelectedIdBusiness = function openSelectedIdBusiness() {
    const business = selectedIdBusiness();
    if (!business) {
      toast("⚠️ No Business", "Select a business before opening it in Administration.", "error");
      return;
    }
    openEditView(business.slug);
  };

  function selectedBackup() {
    return (state.backups.snapshot?.backups || []).find((item) => item.id === state.backups.selectedId) || null;
  }

  function renderBackupSelection() {
    const summary = document.getElementById("backupSummary");
    const selected = selectedBackup();
    if (!summary) {
      return;
    }
    if (!selected) {
      summary.className = "payment-focus empty";
      summary.textContent = "Select a backup snapshot to inspect its contents or restore it.";
      return;
    }

    summary.className = "payment-focus";
    summary.innerHTML = `
      <div class="summary-title">${escapeHtml(selected.label || selected.id)}</div>
      <div class="summary-meta">${escapeHtml(selected.id)} · ${escapeHtml(formatDate(selected.created_at))}</div>
      <div class="summary-inline">
        <span>Items <b>${escapeHtml(String(selected.item_count || 0))}</b></span>
        <span>Note <b>${escapeHtml(selected.note || "None")}</b></span>
      </div>
      <div class="backup-item-list">
        ${(selected.items || [])
          .map((item) => `<div class="backup-item-row">${escapeHtml(item.label || item.relative_path)} · ${item.exists ? "included" : "missing"}</div>`)
          .join("")}
      </div>
    `;
  }

  function renderBackupList() {
    const list = document.getElementById("backupList");
    const rootBox = document.getElementById("backupRootBox");
    if (!list) {
      return;
    }

    if (rootBox) {
      rootBox.textContent = `Backup root: ${state.backups.snapshot?.backup_root || "Not loaded"}`;
    }

    const items = state.backups.snapshot?.backups || [];
    list.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <button type="button" class="generator-business-item ${item.id === state.backups.selectedId ? "active" : ""}" onclick="selectBackupSnapshot('${escapeHtml(item.id)}')">
                <div class="generator-business-title">${escapeHtml(item.label || item.id)}</div>
                <div class="generator-business-meta">${escapeHtml(formatDate(item.created_at))}</div>
                <div class="generator-business-copy">${escapeHtml(item.note || "No note")} · ${escapeHtml(String(item.item_count || 0))} tracked items</div>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state">No backups have been created yet.</div>`;
  }

  window.loadBackupApp = async function loadBackupApp() {
    const response = await fetch("/api/backups");
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Unable to load backups.");
    }
    state.backups.snapshot = payload.data || { backups: [] };
    if (!selectedBackup()) {
      state.backups.selectedId = state.backups.snapshot.backups?.[0]?.id || null;
    }
    renderBackupList();
    renderBackupSelection();
    setBackupStatus("Backup list loaded.");
  };

  window.selectBackupSnapshot = function selectBackupSnapshot(id) {
    state.backups.selectedId = id;
    renderBackupList();
    renderBackupSelection();
    setBackupStatus(`Selected backup ${id}.`);
  };

  window.createBackupSnapshot = async function createBackupSnapshot() {
    try {
      const response = await fetch("/api/backups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: valueOf("backupLabel"),
          note: valueOf("backupNote"),
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to create the backup.");
      }
      state.backups.snapshot = {
        backup_root: payload.data?.backup_root,
        backups: payload.data?.backups || [],
      };
      state.backups.selectedId = payload.data?.backup?.id || null;
      renderBackupList();
      renderBackupSelection();
      toast("📦 Backup Created", `Created backup ${payload.data?.backup?.id || ""}.`, "success");
      setBackupStatus("Backup created.");
    } catch (error) {
      toast("❌ Backup Error", error.message, "error");
      setBackupStatus("Backup creation failed.");
    }
  };

  async function restoreBackupSnapshotNow() {
    const backup = selectedBackup();
    if (!backup) {
      toast("⚠️ No Backup", "Select a backup before restoring.", "error");
      return;
    }

    const response = await fetch(`/api/backups/restore/${encodeURIComponent(backup.id)}`, {
      method: "POST",
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Unable to restore the backup.");
    }

    state.backups.snapshot = {
      backup_root: payload.data?.backup_root,
      backups: payload.data?.backups || [],
    };
    state.backups.selectedId = backup.id;
    renderBackupList();
    renderBackupSelection();
    await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: true });
    toast("♻️ Backup Restored", `Restored ${backup.id}. Use Reboot Desktop if restored UI files need a fresh load.`, "success");
    setBackupStatus("Backup restored.");
  }

  window.restoreSelectedBackup = function restoreSelectedBackup() {
    const backup = selectedBackup();
    if (!backup) {
      toast("⚠️ No Backup", "Select a backup before restoring.", "error");
      return;
    }
    showModal({
      title: "Restore Backup",
      icon: "♻️",
      body: `Restore <b>${escapeHtml(backup.label || backup.id)}</b>? This overwrites the tracked project files with the snapshot stored in <code>backup/${escapeHtml(backup.id)}</code>.`,
      confirmLabel: "Restore",
      confirmClass: "danger",
      onConfirm: async () => {
        try {
          await restoreBackupSnapshotNow();
        } catch (error) {
          toast("❌ Backup Error", error.message, "error");
          setBackupStatus("Backup restore failed.");
        }
      },
    });
  };

  const contextMenu = {
    element: null,
  };

  function hideDesktopContextMenu() {
    contextMenu.element?.classList.remove("show");
  }

  window.handleDesktopContextMenu = function handleDesktopContextMenu(event) {
    const menu = contextMenu.element || document.getElementById("desktopContextMenu");
    contextMenu.element = menu;
    if (!menu) {
      return;
    }
    if (event.target.closest("input, textarea, select, option")) {
      hideDesktopContextMenu();
      return;
    }
    event.preventDefault();
    menu.style.left = `${Math.max(12, event.clientX)}px`;
    menu.style.top = `${Math.max(12, event.clientY)}px`;
    menu.classList.add("show");
  };

  window.refreshCurrentWorkspace = async function refreshCurrentWorkspace() {
    hideDesktopContextMenu();
    const activeApp = state.shell.activeApp;
    try {
      if (activeApp === "generator" && typeof window.loadGeneratorStudioApp === "function") {
        await window.loadGeneratorStudioApp();
      } else if (activeApp === "ids") {
        await window.loadIdManagerApp();
      } else if (activeApp === "backup") {
        await window.loadBackupApp();
      } else if (activeApp === "reports") {
        await Promise.allSettled([
          loadRevenueReport(state.reports.period || "monthly", { force: true, silent: true }),
          loadExpenses({ silent: true }),
        ]);
      } else if (activeApp === "email") {
        await loadEmailSnapshot({ silent: true });
      } else if (activeApp === "calendar") {
        await loadCalendarSnapshot({ silent: true });
      } else if (activeApp === "staff") {
        await loadStaffSnapshot({ silent: true });
      } else {
        await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: false });
      }
      toast("🔄 Refreshed", "The active workspace was refreshed.", "success");
    } catch (error) {
      toast("❌ Refresh Error", error.message, "error");
    }
  };

  window.recheckAdminFilesystem = async function recheckAdminFilesystem() {
    hideDesktopContextMenu();
    try {
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false, recheck: true });
      if (state.shell.activeApp === "generator" && typeof window.loadGeneratorStudioApp === "function") {
        await window.loadGeneratorStudioApp();
      }
      if (state.shell.activeApp === "ids") {
        await window.loadIdManagerApp();
      }
      if (state.shell.activeApp === "backup") {
        await window.loadBackupApp();
      }
      toast("🧭 Filesystem Rechecked", "The admin app re-read the tracked files from disk.", "success");
    } catch (error) {
      toast("❌ Recheck Error", error.message, "error");
    }
  };

  window.rebootAdminDesktop = function rebootAdminDesktop() {
    hideDesktopContextMenu();
    window.location.reload();
  };

  document.addEventListener("DOMContentLoaded", () => {
    contextMenu.element = document.getElementById("desktopContextMenu");

    document.getElementById("idManagerSearch")?.addEventListener("input", renderIdManagerList);
    document.getElementById("idManagerProvince")?.addEventListener("change", renderIdManagerList);
    document.getElementById("idManagerStatus")?.addEventListener("change", renderIdManagerList);
    ["idCardHeadName", "idCardHeadRole", "idCardTitle", "idCardSubtitle", "idCardNotes"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => {
        document.getElementById("idCardPreview").innerHTML = buildIdCardPreviewMarkup(selectedIdBusiness());
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".desktop-context-menu")) {
        hideDesktopContextMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideDesktopContextMenu();
      }
    });
  });
})();
