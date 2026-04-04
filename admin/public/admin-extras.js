(function () {
  const state = window.adminState;
  if (!state) {
    return;
  }

  function setMailStatus(message) {
    const element = document.getElementById("emailStatus");
    if (element) {
      element.textContent = message;
    }
  }

  function setCalendarStatus(message) {
    const element = document.getElementById("calendarStatus");
    if (element) {
      element.textContent = message;
    }
  }

  function setStaffStatus(message) {
    const element = document.getElementById("staffStatusLabel");
    if (element) {
      element.textContent = message;
    }
  }

  function selectedBusinessSlug() {
    return state.selectedSlug || state.paymentSlug || "";
  }

  function selectedStaffId() {
    return state.staff?.selectedId || "";
  }

  function buildEmailRecipients() {
    const businessRecipients = state.businesses
      .filter((business) => String(business.contact?.email || "").trim())
      .map((business) => ({
        key: `business:${business.slug}`,
        type: "business",
        slug: business.slug,
        staff_id: "",
        name: business.name,
        email: business.contact.email,
        meta: `${business.location_full_label || business.location_label || "No location"} · ${business.type || "Type not set"}`,
        search_text: [
          business.name,
          business.slug,
          business.district,
          business.province_name,
          business.contact?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }));
    const staffRecipients = (state.staff.snapshot?.staff || [])
      .filter((staff) => String(staff.email || "").trim())
      .map((staff) => ({
        key: `staff:${staff.id}`,
        type: "staff",
        slug: "",
        staff_id: staff.id,
        name: staff.full_name,
        email: staff.email,
        meta: `${staff.role || "Role not set"} · ${staff.department || "No department"}`,
        search_text: [
          staff.full_name,
          staff.employee_code,
          staff.role,
          staff.department,
          staff.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }));
    return [...businessRecipients, ...staffRecipients];
  }

  function emailRecipients() {
    const query = String(document.getElementById("emailSearch")?.value || "").trim().toLowerCase();
    const type = String(document.getElementById("emailRecipientType")?.value || "all");
    return buildEmailRecipients().filter((recipient) => {
      if (type !== "all" && recipient.type !== type) {
        return false;
      }
      return !query || recipient.search_text.includes(query);
    });
  }

  function selectedEmailRecipients() {
    const selected = new Set(state.email.selectedRecipients || []);
    return buildEmailRecipients().filter((recipient) => selected.has(recipient.key));
  }

  function renderEmailRecipientList() {
    const list = document.getElementById("emailRecipientList");
    if (!list) {
      return;
    }

    const selected = new Set(state.email.selectedRecipients || []);
    const recipients = emailRecipients();
    list.innerHTML = recipients.length
      ? recipients
          .map(
            (recipient) => `
              <label class="mail-recipient-item">
                <input type="checkbox" ${selected.has(recipient.key) ? "checked" : ""} onchange="toggleEmailRecipient('${escapeHtml(recipient.key)}')">
                <div>
                  <div class="mail-recipient-title">${escapeHtml(recipient.name)}</div>
                  <div class="mail-recipient-meta">${escapeHtml(recipient.email || "")}</div>
                  <div class="mail-recipient-meta">${escapeHtml(recipient.type === "staff" ? "Staff" : "Business")} · ${escapeHtml(recipient.meta || "No details")}</div>
                </div>
              </label>
            `
          )
          .join("")
      : `<div class="empty-state">No email-ready businesses match the current search.</div>`;

    const selectedItems = selectedEmailRecipients();
    const summary = document.getElementById("emailSelectionSummary");
    if (summary) {
      summary.textContent = selectedItems.length
        ? `${selectedItems.length} recipient(s) selected: ${selectedItems.slice(0, 3).map((item) => item.name).join(", ")}${selectedItems.length > 3 ? "..." : ""}`
        : "No recipients selected yet.";
    }
  }

  function renderEmailLogs() {
    const list = document.getElementById("emailLogList");
    if (!list) {
      return;
    }

    const logs = state.email.snapshot?.recent_logs || [];
    list.innerHTML = logs.length
      ? logs
          .map(
            (log) => `
              <div class="mail-log-card">
                <div class="mail-log-title">${escapeHtml(log.subject || "Untitled send")}</div>
                <div class="mail-log-meta">${escapeHtml(formatDate(log.created_at))} · ${escapeHtml(String(log.sent_count || 0))} sent · ${escapeHtml(String(log.failed_count || 0))} failed</div>
              </div>
            `
          )
          .join("")
      : `<div class="empty-state">No email delivery logs yet.</div>`;
  }

  function seedEmailTemplate() {
    const subject = document.getElementById("emailSubject");
    const body = document.getElementById("emailBody");
    if (!subject || !body) {
      return;
    }

    if (!subject.value.trim()) {
      subject.value = "Update for {{recipient_name}}";
    }
    if (!body.value.trim()) {
      body.value = [
        "Hello {{recipient_name}},",
        "",
        "This is an update from the admin team.",
        "",
        "Recipient type: {{recipient_type}}",
        "Business district: {{district}}",
        "Staff role: {{staff_role}}",
        "Website ready: {{website_ready}}",
        "APK ready: {{apk_ready}}",
        "",
        "Reply to this email if you need any changes.",
      ].join("\\n");
    }
  }

  window.loadEmailSnapshot = async function loadEmailSnapshot(options = {}) {
    const { silent = false } = options;
    if (!state.businesses.length) {
      await refreshDirectory({ reloadReport: false, reloadPaymentRecord: false });
    }
    if (!state.staff.snapshot && typeof window.loadStaffSnapshot === "function") {
      await window.loadStaffSnapshot({ silent: true });
    }

    const response = await fetch("/api/email/snapshot");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load mail center data.");
    }

    state.email.snapshot = payload.data || {};
    seedEmailTemplate();
    if (Array.isArray(state.email.prefillRecipients) && state.email.prefillRecipients.length) {
      state.email.selectedRecipients = [...state.email.prefillRecipients];
      state.email.prefillRecipients = [];
    }

    const configBox = document.getElementById("emailConfigBox");
    if (configBox) {
      configBox.innerHTML = state.email.snapshot.config_ready
        ? `SMTP ready. ${state.email.snapshot.business_recipient_count || 0} businesses and ${state.email.snapshot.staff_recipient_count || 0} staff recipients can be reached from this desktop. Sending is one click here once the subject and body are ready.`
        : `SMTP is not configured yet. Open Config App and complete the email delivery fields before sending.<div class="action-row"><button type="button" class="tb-btn" onclick="openMailSetup()">Open Mail Settings</button></div>`;
    }

    renderEmailRecipientList();
    renderEmailLogs();
    if (!silent) {
      setMailStatus("Mail Center loaded.");
    }
  };

  window.toggleEmailRecipient = function toggleEmailRecipient(slug) {
    const selected = new Set(state.email.selectedRecipients || []);
    if (selected.has(slug)) {
      selected.delete(slug);
    } else {
      selected.add(slug);
    }
    state.email.selectedRecipients = [...selected];
    renderEmailRecipientList();
  };

  window.selectFilteredEmailRecipients = function selectFilteredEmailRecipients() {
    state.email.selectedRecipients = emailRecipients().map((recipient) => recipient.key);
    renderEmailRecipientList();
    setMailStatus("Filtered recipients selected.");
  };

  window.selectSingleEmailRecipient = function selectSingleEmailRecipient() {
    const currentStaff = (state.staff.snapshot?.staff || []).find((item) => item.id === selectedStaffId() && String(item.email || "").trim());
    if (currentStaff) {
      state.email.selectedRecipients = [`staff:${currentStaff.id}`];
      renderEmailRecipientList();
      setMailStatus(`Prepared email for ${currentStaff.full_name}.`);
      return;
    }

    const slug = selectedBusinessSlug();
    const business = state.businesses.find((item) => item.slug === slug && String(item.contact?.email || "").trim());
    if (!business) {
      toast("⚠️ No Email", "Select a business or staff member with an email address first.", "error");
      return;
    }
    state.email.selectedRecipients = [`business:${business.slug}`];
    renderEmailRecipientList();
    setMailStatus(`Prepared email for ${business.name}.`);
  };

  window.selectBusinessEmailRecipients = function selectBusinessEmailRecipients() {
    state.email.selectedRecipients = buildEmailRecipients()
      .filter((recipient) => recipient.type === "business")
      .map((recipient) => recipient.key);
    renderEmailRecipientList();
    setMailStatus("All business recipients selected.");
  };

  window.selectStaffEmailRecipients = function selectStaffEmailRecipients() {
    state.email.selectedRecipients = buildEmailRecipients()
      .filter((recipient) => recipient.type === "staff")
      .map((recipient) => recipient.key);
    renderEmailRecipientList();
    setMailStatus("All staff recipients selected.");
  };

  window.clearEmailRecipients = function clearEmailRecipients() {
    state.email.selectedRecipients = [];
    renderEmailRecipientList();
    setMailStatus("Recipient selection cleared.");
  };

  window.emailSelectedBusiness = function emailSelectedBusiness() {
    const slug = selectedBusinessSlug();
    if (!slug) {
      toast("⚠️ No Selection", "Select a business before opening Mail Center.", "error");
      return;
    }
    state.email.prefillRecipients = [`business:${slug}`];
    openApp("email");
  };

  window.emailSelectedStaffMember = function emailSelectedStaffMember() {
    const staff = (state.staff.snapshot?.staff || []).find((item) => item.id === selectedStaffId());
    if (!staff || !String(staff.email || "").trim()) {
      toast("⚠️ No Staff Email", "Select a staff member with an email address first.", "error");
      return;
    }
    state.email.prefillRecipients = [`staff:${staff.id}`];
    openApp("email");
  };

  window.openMailSetup = function openMailSetup() {
    openApp("config");
    setTimeout(() => {
      document.getElementById("configAdminInfo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  window.sendEmailCampaign = async function sendEmailCampaign() {
    if (state.email.sending) {
      return;
    }

    const selected = selectedEmailRecipients();
    if (!selected.length) {
      toast("⚠️ No Recipients", "Select at least one business recipient.", "error");
      return;
    }

    try {
      state.email.sending = true;
      setMailStatus(`Sending ${selected.length} email(s)...`);
      const businessRecipients = selected.filter((recipient) => recipient.type === "business").map((recipient) => recipient.slug);
      const staffRecipients = selected.filter((recipient) => recipient.type === "staff").map((recipient) => recipient.staff_id);
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_slugs: businessRecipients,
          staff_ids: staffRecipients,
          subject: document.getElementById("emailSubject").value,
          body: document.getElementById("emailBody").value,
          reply_to: document.getElementById("emailReplyTo").value,
          cc: document.getElementById("emailCc").value,
          bcc: document.getElementById("emailBcc").value,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to send the email campaign.");
      }
      state.email.snapshot = payload.data?.snapshot || state.email.snapshot;
      renderEmailLogs();
      toast("✅ Email Sent", `Sent ${payload.data.sent_count} email(s).`, "success");
      setMailStatus(`Sent ${payload.data.sent_count} email(s).`);
    } catch (error) {
      toast("❌ Email Error", error.message, "error");
      setMailStatus("Email send failed.");
    } finally {
      state.email.sending = false;
    }
  };

  function currentCalendarMonth() {
    const today = todayString();
    return state.calendar.currentMonth || `${today.slice(0, 7)}-01`;
  }

  function isoDateKey(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function calendarEventsForDate(dateKey) {
    return (state.calendar.snapshot?.events || []).filter((event) => isoDateKey(event.date) === dateKey);
  }

  function renderCalendarEvents() {
    const label = document.getElementById("calendarSelectedLabel");
    const list = document.getElementById("calendarEventList");
    if (!label || !list) {
      return;
    }

    const dateKey = state.calendar.selectedDate || todayString();
    const items = calendarEventsForDate(dateKey);
    label.textContent = `${formatDate(dateKey)} · ${items.length} event(s)`;
    list.innerHTML = items.length
      ? items
          .map(
            (event) => `
              <div class="calendar-event-card ${escapeHtml(event.category || "reminder")}">
                <div class="calendar-event-title">${escapeHtml(event.title || "Untitled event")}</div>
                <div class="calendar-event-meta">${escapeHtml(event.category || "reminder")} · ${escapeHtml(event.source || "custom")}</div>
                ${event.notes ? `<div class="calendar-event-meta">${escapeHtml(event.notes)}</div>` : ""}
                ${event.source === "custom" ? `<div class="table-actions space-top"><button type="button" class="row-btn" onclick="editCalendarReminder('${escapeHtml(event.id)}')">Edit</button></div>` : ""}
              </div>
            `
          )
          .join("")
      : `<div class="empty-state">No events are scheduled for this day.</div>`;
  }

  function renderCalendarGrid() {
    const grid = document.getElementById("calendarGrid");
    const label = document.getElementById("calendarMonthLabel");
    const statsPill = document.getElementById("calendarStatsPill");
    if (!grid || !label || !statsPill) {
      return;
    }

    const monthDate = new Date(`${currentCalendarMonth()}T00:00:00Z`);
    const first = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - first.getUTCDay()));
    const today = todayString();
    label.textContent = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    statsPill.textContent = `${(state.calendar.snapshot?.events || []).length} events`;

    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(start.getTime() + index * 86400000);
      const dateKey = day.toISOString().slice(0, 10);
      const count = calendarEventsForDate(dateKey).length;
      const inMonth = day.getUTCMonth() === first.getUTCMonth();
      cells.push(`
        <button type="button" class="calendar-day ${inMonth ? "" : "muted"} ${dateKey === today ? "today" : ""} ${dateKey === state.calendar.selectedDate ? "selected" : ""}" onclick="selectCalendarDate('${dateKey}')">
          <span class="calendar-day-number">${day.getUTCDate()}</span>
          <span class="calendar-day-count">${count ? `${count} item${count === 1 ? "" : "s"}` : ""}</span>
        </button>
      `);
    }
    grid.innerHTML = cells.join("");
  }

  window.loadCalendarSnapshot = async function loadCalendarSnapshot(options = {}) {
    const { silent = false } = options;
    const response = await fetch("/api/calendar");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load calendar data.");
    }
    state.calendar.snapshot = payload.data || {};
    state.calendar.currentMonth = currentCalendarMonth();
    state.calendar.selectedDate = state.calendar.selectedDate || todayString();
    renderCalendarGrid();
    renderCalendarEvents();
    if (!silent) {
      setCalendarStatus("Calendar loaded.");
    }
  };

  window.selectCalendarDate = function selectCalendarDate(dateKey) {
    state.calendar.selectedDate = dateKey;
    document.getElementById("calendarDate").value = dateKey;
    renderCalendarGrid();
    renderCalendarEvents();
  };

  window.shiftCalendarMonth = function shiftCalendarMonth(delta) {
    const current = new Date(`${currentCalendarMonth()}T00:00:00Z`);
    current.setUTCMonth(current.getUTCMonth() + delta);
    state.calendar.currentMonth = `${current.toISOString().slice(0, 7)}-01`;
    renderCalendarGrid();
    setCalendarStatus("Calendar month updated.");
  };

  window.jumpCalendarToToday = function jumpCalendarToToday() {
    state.calendar.currentMonth = `${todayString().slice(0, 7)}-01`;
    state.calendar.selectedDate = todayString();
    renderCalendarGrid();
    renderCalendarEvents();
    setCalendarStatus("Returned to today.");
  };

  window.editCalendarReminder = function editCalendarReminder(id) {
    const event = (state.calendar.snapshot?.custom_events || []).find((item) => item.id === id);
    if (!event) {
      return;
    }
    document.getElementById("calendarEventId").value = event.id || "";
    document.getElementById("calendarTitle").value = event.title || "";
    document.getElementById("calendarDate").value = isoDateKey(event.date);
    document.getElementById("calendarCategory").value = event.category || "reminder";
    document.getElementById("calendarNotes").value = event.notes || "";
    state.calendar.selectedDate = isoDateKey(event.date) || state.calendar.selectedDate;
    renderCalendarGrid();
    renderCalendarEvents();
  };

  window.resetCalendarReminder = function resetCalendarReminder() {
    document.getElementById("calendarEventId").value = "";
    document.getElementById("calendarTitle").value = "";
    document.getElementById("calendarDate").value = state.calendar.selectedDate || todayString();
    document.getElementById("calendarCategory").value = "reminder";
    document.getElementById("calendarNotes").value = "";
  };

  window.saveCalendarReminder = async function saveCalendarReminder() {
    try {
      const response = await fetch("/api/calendar/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.getElementById("calendarEventId").value,
          title: document.getElementById("calendarTitle").value,
          date: document.getElementById("calendarDate").value,
          category: document.getElementById("calendarCategory").value,
          notes: document.getElementById("calendarNotes").value,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to save the reminder.");
      }
      state.calendar.snapshot = payload.data;
      state.calendar.selectedDate = document.getElementById("calendarDate").value || state.calendar.selectedDate;
      renderCalendarGrid();
      renderCalendarEvents();
      resetCalendarReminder();
      setCalendarStatus("Reminder saved.");
      toast("✅ Reminder Saved", "The calendar reminder was saved.", "success");
    } catch (error) {
      toast("❌ Calendar Error", error.message, "error");
      setCalendarStatus("Calendar save failed.");
    }
  };

  window.deleteCalendarReminder = async function deleteCalendarReminder() {
    const eventId = document.getElementById("calendarEventId").value;
    if (!eventId) {
      toast("⚠️ No Reminder", "Select a custom reminder before deleting.", "error");
      return;
    }

    try {
      const response = await fetch(`/api/calendar/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to delete the reminder.");
      }
      state.calendar.snapshot = payload.data;
      renderCalendarGrid();
      renderCalendarEvents();
      resetCalendarReminder();
      setCalendarStatus("Reminder deleted.");
    } catch (error) {
      toast("❌ Calendar Error", error.message, "error");
      setCalendarStatus("Calendar delete failed.");
    }
  };

  function filteredStaffMembers() {
    const snapshot = state.staff.snapshot || { staff: [] };
    const query = String(document.getElementById("staffSearch")?.value || "").trim().toLowerCase();
    const status = String(document.getElementById("staffStatusFilter")?.value || "all");
    const department = String(document.getElementById("staffDepartmentFilter")?.value || "").trim().toLowerCase();
    return (snapshot.staff || []).filter((staff) => {
      if (status !== "all" && staff.status !== status) {
        return false;
      }
      if (department && !String(staff.department || "").toLowerCase().includes(department)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        staff.full_name,
        staff.employee_code,
        staff.role,
        staff.department,
        staff.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  function currentStaffMember() {
    return (state.staff.snapshot?.staff || []).find((item) => item.id === state.staff.selectedId) || null;
  }

  function renderStaffList() {
    const list = document.getElementById("staffList");
    const stats = document.getElementById("staffStatsBox");
    if (!list || !stats) {
      return;
    }

    const snapshot = state.staff.snapshot || { staff: [], stats: {} };
    stats.textContent = `${snapshot.stats?.total || 0} staff · ${snapshot.stats?.active || 0} active · ${snapshot.stats?.overdue || 0} overdue payroll · ${snapshot.stats?.scheduled_increments || 0} scheduled increments`;
    const items = filteredStaffMembers();
    list.innerHTML = items.length
      ? items
          .map(
            (staff) => `
              <button type="button" class="staff-list-item ${staff.id === state.staff.selectedId ? "active" : ""}" onclick="selectStaffMember('${escapeHtml(staff.id)}')">
                <div class="staff-list-title">${escapeHtml(staff.full_name || "Staff Member")}</div>
                <div class="staff-list-meta">${escapeHtml(staff.role || "Role not set")} · ${escapeHtml(staff.department || "No department")}</div>
                <div class="staff-list-meta">${escapeHtml(staff.status || "active")} · Next due ${escapeHtml(formatDate(staff.next_payment_due_at))}</div>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state">No staff members match the current filters.</div>`;
  }

  function fillStaffForm(staff) {
    document.getElementById("staffId").value = staff?.id || "";
    document.getElementById("staffName").value = staff?.full_name || "";
    document.getElementById("staffCode").value = staff?.employee_code || "";
    document.getElementById("staffRole").value = staff?.role || "";
    document.getElementById("staffDepartment").value = staff?.department || "";
    document.getElementById("staffEmploymentType").value = staff?.employment_type || "Full Time";
    document.getElementById("staffStatus").value = staff?.status || "active";
    document.getElementById("staffPhone").value = staff?.phone || "";
    document.getElementById("staffEmail").value = staff?.email || "";
    document.getElementById("staffAddress").value = staff?.address || "";
    document.getElementById("staffEmergencyContact").value = staff?.emergency_contact || "";
    document.getElementById("staffJoinedAt").value = staff?.joined_at ? new Date(staff.joined_at).toISOString().slice(0, 10) : "";
    document.getElementById("staffSalaryAmount").value = staff?.salary_amount ?? "";
    document.getElementById("staffSalaryCurrency").value = staff?.salary_currency || "NPR";
    document.getElementById("staffPayCycle").value = staff?.pay_cycle || "monthly";
    document.getElementById("staffPaymentDay").value = staff?.payment_day ?? "";
    document.getElementById("staffBankAccount").value = staff?.bank_account || "";
    document.getElementById("staffAvatarUrl").value = staff?.avatar_url || "";
    document.getElementById("staffSkills").value = Array.isArray(staff?.skills) ? staff.skills.join("\n") : "";
    document.getElementById("staffDocuments").value = Array.isArray(staff?.documents) ? staff.documents.join("\n") : "";
    document.getElementById("staffNotes").value = staff?.notes || "";
  }

  function renderStaffFocusCard() {
    const card = document.getElementById("staffFocusCard");
    const list = document.getElementById("staffPaymentList");
    if (!card || !list) {
      return;
    }

    const staff = currentStaffMember();
    if (!staff) {
      card.className = "payment-focus empty";
      card.textContent = "Select a staff member to view payroll status and record payments.";
      list.innerHTML = "";
      renderStaffIncrementList(null);
      return;
    }

    card.className = "payment-focus";
    card.innerHTML = `
      <div class="summary-title">${escapeHtml(staff.full_name)}</div>
      <div class="summary-meta">${escapeHtml(staff.role || "Role not set")} · ${escapeHtml(staff.department || "No department")}</div>
      <div class="summary-inline">
        <span>Status <b>${escapeHtml(staff.status || "active")}</b></span>
        <span>Salary <b>${escapeHtml(formatCurrency(staff.salary_amount, staff.salary_currency))}</b></span>
        <span>Last Paid <b>${escapeHtml(formatDate(staff.last_payment_at))}</b></span>
        <span>Next Due <b>${escapeHtml(formatDate(staff.next_payment_due_at))}</b></span>
      </div>
      ${
        staff.next_increment
          ? `<div class="summary-meta">Upcoming change: ${escapeHtml(formatDate(staff.next_increment.effective_from))} · ${escapeHtml(
              staff.next_increment.role || staff.upcoming_role || staff.role || "Role unchanged"
            )} · ${escapeHtml(
              formatCurrency(
                staff.next_increment.salary_amount ?? staff.upcoming_salary_amount,
                staff.next_increment.salary_currency || staff.upcoming_salary_currency || staff.salary_currency
              )
            )}</div>`
          : ""
      }
      ${staff.left_at ? `<div class="summary-meta">Left / archived on ${escapeHtml(formatDate(staff.left_at))}</div>` : ""}
    `;

    list.innerHTML = (staff.payment_history || []).length
      ? staff.payment_history
          .map(
            (payment) => `
              <div class="history-item">
                <div><b>${escapeHtml(formatDate(payment.paid_at))}</b> · ${escapeHtml(formatCurrency(payment.amount, payment.currency))}</div>
                <div>${escapeHtml(payment.method || "Method not set")} · ${escapeHtml(payment.reference || "No reference")}</div>
                <div class="summary-meta">${escapeHtml(payment.notes || "No note")}</div>
                <div class="table-actions space-top">
                  <button type="button" class="row-btn" onclick="editStaffPayment('${escapeHtml(payment.id)}')">Edit</button>
                  <button type="button" class="row-btn warn" onclick="deleteStaffPayment('${escapeHtml(payment.id)}')">Delete</button>
                </div>
              </div>
            `
          )
          .join("")
      : `<div class="empty-state">No payroll history recorded yet.</div>`;
    renderStaffIncrementList(staff);
  }

  function renderStaffIncrementList(staff) {
    const list = document.getElementById("staffIncrementList");
    if (!list) {
      return;
    }
    if (!staff) {
      list.innerHTML = "";
      return;
    }

    const increments = Array.isArray(staff.salary_increments) ? staff.salary_increments : [];
    list.innerHTML = increments.length
      ? increments
          .map((increment) => {
            const isFuture = new Date(increment.effective_from).getTime() > Date.now();
            const amountText =
              increment.salary_amount == null
                ? "Salary unchanged"
                : formatCurrency(increment.salary_amount, increment.salary_currency || staff.salary_currency);
            return `
              <div class="history-item">
                <div><b>${escapeHtml(formatDate(increment.effective_from))}</b> · ${escapeHtml(amountText)}</div>
                <div>${escapeHtml(increment.role || "Role unchanged")} · ${escapeHtml(increment.department || "Department unchanged")}</div>
                <div class="summary-meta">${escapeHtml(increment.notes || (isFuture ? "Scheduled change" : "Applied change"))}</div>
                <div class="table-actions space-top">
                  <button type="button" class="row-btn" onclick="editStaffIncrement('${escapeHtml(increment.id)}')">Edit</button>
                  <button type="button" class="row-btn warn" onclick="deleteStaffIncrement('${escapeHtml(increment.id)}')">Delete</button>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty-state">No salary or post increment history recorded yet.</div>`;
  }

  function collectStaffPayload() {
    return {
      id: document.getElementById("staffId").value,
      full_name: document.getElementById("staffName").value,
      employee_code: document.getElementById("staffCode").value,
      role: document.getElementById("staffRole").value,
      department: document.getElementById("staffDepartment").value,
      employment_type: document.getElementById("staffEmploymentType").value,
      status: document.getElementById("staffStatus").value,
      phone: document.getElementById("staffPhone").value,
      email: document.getElementById("staffEmail").value,
      address: document.getElementById("staffAddress").value,
      emergency_contact: document.getElementById("staffEmergencyContact").value,
      joined_at: document.getElementById("staffJoinedAt").value,
      salary_amount: document.getElementById("staffSalaryAmount").value,
      salary_currency: document.getElementById("staffSalaryCurrency").value,
      pay_cycle: document.getElementById("staffPayCycle").value,
      payment_day: document.getElementById("staffPaymentDay").value,
      bank_account: document.getElementById("staffBankAccount").value,
      avatar_url: document.getElementById("staffAvatarUrl").value,
      skills: String(document.getElementById("staffSkills").value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      documents: String(document.getElementById("staffDocuments").value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      notes: document.getElementById("staffNotes").value,
    };
  }

  function currentStaffIncrement() {
    const staff = currentStaffMember();
    const incrementId = document.getElementById("staffIncrementId")?.value;
    return (staff?.salary_increments || []).find((item) => item.id === incrementId) || null;
  }

  function applyPendingStaffFocus() {
    const pending = state.staff.pendingPaymentEdit;
    if (!pending) {
      return;
    }

    const staff = (state.staff.snapshot?.staff || []).find((item) => item.id === pending.staffId);
    if (!staff) {
      state.staff.pendingPaymentEdit = null;
      return;
    }

    state.staff.selectedId = staff.id;
    fillStaffForm(staff);
    renderStaffList();
    renderStaffFocusCard();
    if (pending.paymentId) {
      editStaffPayment(pending.paymentId);
    }
    state.staff.pendingPaymentEdit = null;
  }

  window.loadStaffSnapshot = async function loadStaffSnapshot(options = {}) {
    const { silent = false } = options;
    const response = await fetch("/api/staff");
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Unable to load staff data.");
    }
    state.staff.snapshot = payload.data || { staff: [], stats: {} };
    if (state.staff.selectedId && !currentStaffMember()) {
      state.staff.selectedId = null;
    }
    renderStaffList();
    renderStaffFocusCard();
    applyPendingStaffFocus();
    if (!silent) {
      setStaffStatus("Staff data loaded.");
    }
  };

  window.selectStaffMember = function selectStaffMember(id) {
    state.staff.selectedId = id;
    const staff = currentStaffMember();
    fillStaffForm(staff);
    resetStaffPaymentForm();
    resetStaffIncrementForm();
    renderStaffList();
    renderStaffFocusCard();
    setStaffStatus(staff ? `Selected ${staff.full_name}.` : "Staff selection cleared.");
  };

  window.resetStaffForm = function resetStaffForm() {
    state.staff.selectedId = null;
    fillStaffForm(null);
    resetStaffPaymentForm();
    resetStaffIncrementForm();
    renderStaffList();
    renderStaffFocusCard();
  };

  window.saveStaffMemberFromForm = async function saveStaffMemberFromForm() {
    try {
      const response = await fetch("/api/staff/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectStaffPayload()),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to save the staff member.");
      }
      state.staff.snapshot = payload.data;
      const savedName = document.getElementById("staffName").value || "Staff member";
      const matched = (state.staff.snapshot.staff || []).find((item) => item.full_name === savedName);
      if (matched) {
        state.staff.selectedId = matched.id;
        fillStaffForm(matched);
      }
      renderStaffList();
      renderStaffFocusCard();
      resetStaffIncrementForm();
      toast("✅ Staff Saved", `${savedName} was saved.`, "success");
      setStaffStatus("Staff member saved.");
    } catch (error) {
      toast("❌ Staff Error", error.message, "error");
      setStaffStatus("Staff save failed.");
    }
  };

  window.deleteSelectedStaff = async function deleteSelectedStaff() {
    const staff = currentStaffMember();
    if (!staff) {
      toast("⚠️ No Staff", "Select a staff member before deleting.", "error");
      return;
    }
    try {
      const response = await fetch(`/api/staff/${encodeURIComponent(staff.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to delete the staff member.");
      }
      state.staff.snapshot = payload.data;
      resetStaffForm();
      toast(
        "✅ Staff Updated",
        (staff.payment_history || []).length || (staff.salary_increments || []).length
          ? `${staff.full_name} was archived to keep payroll history.`
          : `${staff.full_name} was removed.`,
        "success"
      );
      setStaffStatus("Staff record updated.");
    } catch (error) {
      toast("❌ Staff Error", error.message, "error");
      setStaffStatus("Staff delete failed.");
    }
  };

  window.resetStaffPaymentForm = function resetStaffPaymentForm() {
    const staff = currentStaffMember();
    document.getElementById("staffPaymentId").value = "";
    document.getElementById("staffPaymentAmount").value = staff?.upcoming_salary_amount ?? staff?.salary_amount ?? "";
    document.getElementById("staffPaymentCurrency").value = staff?.upcoming_salary_currency || staff?.salary_currency || "NPR";
    document.getElementById("staffPaymentDate").value = staff?.next_payment_due_at ? new Date(staff.next_payment_due_at).toISOString().slice(0, 10) : todayString();
    document.getElementById("staffPaymentMethod").value = "";
    document.getElementById("staffPaymentReference").value = "";
    document.getElementById("staffPaymentNotes").value = "";
  };

  window.resetStaffIncrementForm = function resetStaffIncrementForm() {
    const staff = currentStaffMember();
    document.getElementById("staffIncrementId").value = "";
    document.getElementById("staffIncrementEffectiveFrom").value = todayString();
    document.getElementById("staffIncrementSalaryAmount").value = staff?.salary_amount ?? "";
    document.getElementById("staffIncrementSalaryCurrency").value = staff?.salary_currency || "NPR";
    document.getElementById("staffIncrementRole").value = staff?.role || "";
    document.getElementById("staffIncrementDepartment").value = staff?.department || "";
    document.getElementById("staffIncrementNotes").value = "";
  };

  window.editStaffIncrement = function editStaffIncrement(incrementId) {
    const staff = currentStaffMember();
    const increment = (staff?.salary_increments || []).find((item) => item.id === incrementId);
    if (!increment) {
      return;
    }
    document.getElementById("staffIncrementId").value = increment.id || "";
    document.getElementById("staffIncrementEffectiveFrom").value = increment.effective_from ? new Date(increment.effective_from).toISOString().slice(0, 10) : todayString();
    document.getElementById("staffIncrementSalaryAmount").value = increment.salary_amount ?? "";
    document.getElementById("staffIncrementSalaryCurrency").value = increment.salary_currency || staff?.salary_currency || "NPR";
    document.getElementById("staffIncrementRole").value = increment.role || "";
    document.getElementById("staffIncrementDepartment").value = increment.department || "";
    document.getElementById("staffIncrementNotes").value = increment.notes || "";
  };

  window.editStaffPayment = function editStaffPayment(paymentId) {
    const staff = currentStaffMember();
    const payment = (staff?.payment_history || []).find((item) => item.id === paymentId);
    if (!payment) {
      return;
    }
    document.getElementById("staffPaymentId").value = payment.id || "";
    document.getElementById("staffPaymentAmount").value = payment.amount ?? "";
    document.getElementById("staffPaymentCurrency").value = payment.currency || "NPR";
    document.getElementById("staffPaymentDate").value = payment.paid_at ? new Date(payment.paid_at).toISOString().slice(0, 10) : todayString();
    document.getElementById("staffPaymentMethod").value = payment.method || "";
    document.getElementById("staffPaymentReference").value = payment.reference || "";
    document.getElementById("staffPaymentNotes").value = payment.notes || "";
  };

  window.saveStaffPaymentFromForm = async function saveStaffPaymentFromForm() {
    const staff = currentStaffMember();
    if (!staff) {
      toast("⚠️ No Staff", "Select a staff member before saving payroll.", "error");
      return;
    }
    try {
      const response = await fetch(`/api/staff/payment/${encodeURIComponent(staff.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.getElementById("staffPaymentId").value,
          amount: document.getElementById("staffPaymentAmount").value,
          currency: document.getElementById("staffPaymentCurrency").value,
          paid_at: document.getElementById("staffPaymentDate").value,
          method: document.getElementById("staffPaymentMethod").value,
          reference: document.getElementById("staffPaymentReference").value,
          notes: document.getElementById("staffPaymentNotes").value,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to save the payroll payment.");
      }
      state.staff.snapshot = payload.data;
      renderStaffList();
      renderStaffFocusCard();
      resetStaffPaymentForm();
      await Promise.allSettled([
        loadExpenses({ silent: true }),
        loadRevenueReport(state.reports.period, { force: true, silent: true })
      ]);
      toast("✅ Payroll Saved", "The staff payment was saved.", "success");
      setStaffStatus("Payroll payment saved.");
    } catch (error) {
      toast("❌ Payroll Error", error.message, "error");
      setStaffStatus("Payroll save failed.");
    }
  };

  window.deleteStaffPayment = async function deleteStaffPayment(paymentId) {
    const staff = currentStaffMember();
    if (!staff) {
      return;
    }
    try {
      const response = await fetch(`/api/staff/payment/${encodeURIComponent(staff.id)}/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to delete the payroll entry.");
      }
      state.staff.snapshot = payload.data;
      renderStaffList();
      renderStaffFocusCard();
      resetStaffPaymentForm();
      await Promise.allSettled([
        loadExpenses({ silent: true }),
        loadRevenueReport(state.reports.period, { force: true, silent: true })
      ]);
      setStaffStatus("Payroll entry deleted.");
    } catch (error) {
      toast("❌ Payroll Error", error.message, "error");
      setStaffStatus("Payroll delete failed.");
    }
  };

  window.saveStaffIncrementFromForm = async function saveStaffIncrementFromForm() {
    const staff = currentStaffMember();
    if (!staff) {
      toast("⚠️ No Staff", "Select a staff member before saving an increment.", "error");
      return;
    }

    try {
      const response = await fetch(`/api/staff/increment/${encodeURIComponent(staff.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.getElementById("staffIncrementId").value,
          effective_from: document.getElementById("staffIncrementEffectiveFrom").value,
          salary_amount: document.getElementById("staffIncrementSalaryAmount").value,
          salary_currency: document.getElementById("staffIncrementSalaryCurrency").value,
          role: document.getElementById("staffIncrementRole").value,
          department: document.getElementById("staffIncrementDepartment").value,
          notes: document.getElementById("staffIncrementNotes").value,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to save the increment.");
      }

      state.staff.snapshot = payload.data;
      const updatedStaff = (state.staff.snapshot.staff || []).find((item) => item.id === staff.id);
      if (updatedStaff) {
        state.staff.selectedId = updatedStaff.id;
        fillStaffForm(updatedStaff);
      }
      renderStaffList();
      renderStaffFocusCard();
      resetStaffPaymentForm();
      resetStaffIncrementForm();
      toast("✅ Increment Saved", "The salary / post increment was saved.", "success");
      setStaffStatus("Increment history updated.");
    } catch (error) {
      toast("❌ Increment Error", error.message, "error");
      setStaffStatus("Increment save failed.");
    }
  };

  window.deleteStaffIncrement = async function deleteStaffIncrement(incrementId) {
    const staff = currentStaffMember();
    if (!staff) {
      return;
    }

    try {
      const response = await fetch(`/api/staff/increment/${encodeURIComponent(staff.id)}/${encodeURIComponent(incrementId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unable to delete the increment.");
      }
      state.staff.snapshot = payload.data;
      renderStaffList();
      renderStaffFocusCard();
      resetStaffIncrementForm();
      setStaffStatus("Increment deleted.");
    } catch (error) {
      toast("❌ Increment Error", error.message, "error");
      setStaffStatus("Increment delete failed.");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("emailSearch")?.addEventListener("input", renderEmailRecipientList);
    document.getElementById("emailRecipientType")?.addEventListener("change", renderEmailRecipientList);
    document.getElementById("staffSearch")?.addEventListener("input", renderStaffList);
    document.getElementById("staffStatusFilter")?.addEventListener("change", renderStaffList);
    document.getElementById("staffDepartmentFilter")?.addEventListener("input", renderStaffList);
    resetCalendarReminder();
    resetStaffPaymentForm();
    resetStaffIncrementForm();
  });
})();
