(() => {
  "use strict";

  const root = document.getElementById("app");
  const dialog = document.getElementById("dialog");
  const dialogContent = document.getElementById("dialog-content");
  const announcer = document.getElementById("announcer");
  const preferenceKey = "watchdog-control.preferences.v1";
  const setupKey = "watchdog-control.setup-progress.v1";
  const views = [
    { id: "overview", title: "Overview", icon: "◫", description: "Review host health, recent events, and pending work." },
    { id: "hosts", title: "Hosts", icon: "▣", description: "Pair computers, review their status, and revoke access." },
    { id: "services", title: "Services", icon: "⚙", description: "Inspect Windows services and start, stop, or restart one." },
    { id: "processes", title: "Processes", icon: "▤", description: "Review running processes and request a confirmed termination." },
    { id: "events", title: "Event logs", icon: "◷", description: "Read recent system, application, and security events." },
    { id: "storage", title: "Storage", icon: "▱", description: "Check volumes, free space, and capacity." },
    { id: "network", title: "Networking", icon: "⌁", description: "Review network adapters and request a DNS cache refresh." },
    { id: "updates", title: "Updates", icon: "⇧", description: "Review the latest Windows Update status reported by the host." },
    { id: "firewall", title: "Firewall", icon: "◇", description: "Review the reported firewall profile state." },
    { id: "operations", title: "Operations", icon: "▷", description: "Inspect the command queue and its results." },
    { id: "audit", title: "Audit", icon: "≡", description: "Review recent administrative actions." },
    { id: "settings", title: "Settings", icon: "☷", description: "Adjust local display and refresh preferences." }
  ];

  const state = {
    user: null,
    setupRequired: false,
    setup: { step: 0, username: "", code: "", password: "" },
    dashboard: null,
    activeView: "overview",
    activeHostId: null,
    searches: Object.create(null),
    catalogSearch: { query: "", mode: "text", pattern: "", flags: "gi", sample: "" },
    preferences: readPreferences(),
    refreshTimer: null,
    noticeTimer: null,
    pendingSetupError: "",
    regexErrorShown: false
  };

  function readPreferences() {
    const defaults = {
      theme: "system",
      density: "comfortable",
      accent: "teal",
      refreshSeconds: 15,
      autoRefresh: true,
      hideHostNames: false,
      reduceMotion: false
    };
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || "{}");
      return Object.assign(defaults, saved);
    } catch {
      return defaults;
    }
  }

  function savePreferences() {
    localStorage.setItem(preferenceKey, JSON.stringify(state.preferences));
    applyPreferences();
  }

  function applyPreferences() {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.dataset.theme =
      state.preferences.theme === "system"
        ? (prefersLight ? "light" : "dark")
        : state.preferences.theme;
    document.documentElement.dataset.density = state.preferences.density;
    document.documentElement.dataset.accent = state.preferences.accent;
    document.documentElement.dataset.reduceMotion = String(state.preferences.reduceMotion);
    restartRefreshTimer();
  }

  function restartRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.user && state.preferences.autoRefresh) {
      state.refreshTimer = setInterval(() => void refreshDashboard(false), state.preferences.refreshSeconds * 1000);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "Not reported";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not reported" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short"
    }).format(date);
  }

  function formatBytes(value) {
    if (!Number.isFinite(Number(value))) return "—";
    const bytes = Number(value);
    if (bytes < 1024) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes;
    let unit = -1;
    do {
      amount /= 1024;
      unit += 1;
    } while (amount >= 1024 && unit < units.length - 1);
    return amount.toFixed(amount < 10 ? 1 : 0) + " " + units[unit];
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds))) return "—";
    const total = Math.max(0, Math.floor(Number(seconds)));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return days + "d " + hours + "h " + minutes + "m";
  }

  async function request(path, options) {
    const settings = Object.assign({ credentials: "same-origin" }, options || {});
    settings.headers = Object.assign({}, settings.headers || {});
    if (settings.body && typeof settings.body !== "string") {
      settings.headers["Content-Type"] = "application/json";
      settings.body = JSON.stringify(settings.body);
    }
    const response = await fetch(path, settings);
    let body = null;
    if (response.status !== 204) {
      const contentType = response.headers.get("content-type") || "";
      body = contentType.includes("application/json") ? await response.json() : await response.text();
    }
    if (!response.ok) {
      const message = body && typeof body === "object"
        ? (body.detail || body.error || body.title || "Request was not accepted.")
        : (typeof body === "string" && body ? body : "Request was not accepted.");
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(() => { announcer.textContent = message; }, 20);
  }

  function toast(title, detail, isError) {
    let region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-relevant", "additions");
      document.body.append(region);
    }
    const item = document.createElement("div");
    item.className = "toast" + (isError ? " error" : "");
    item.setAttribute("role", "status");
    item.innerHTML = "<strong>" + escapeHtml(title) + "</strong><p>" + escapeHtml(detail || "") + "</p>";
    region.append(item);
    announce(title + (detail ? ". " + detail : ""));
    window.setTimeout(() => item.remove(), 6500);
  }

  function searchFor(viewId) {
    if (!state.searches[viewId]) {
      state.searches[viewId] = { query: "", mode: "text", pattern: "", flags: "gi", sample: "" };
    }
    return state.searches[viewId];
  }

  function openDialog(content, focusSelector) {
    dialogContent.innerHTML = content;
    if (!dialog.open) dialog.showModal();
    if (focusSelector) {
      const focusTarget = dialogContent.querySelector(focusSelector);
      if (focusTarget) focusTarget.focus();
    }
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  function searchBar(viewId, placeholder, placement) {
    const search = viewId === "catalog" ? state.catalogSearch : searchFor(viewId);
    const regexActive = search.mode === "regex";
    const fieldPlacement = placement || "page";
    return '<div class="search-group" role="search">' +
      '<label class="sr-only" for="search-' + escapeHtml(viewId) + '-' + escapeHtml(fieldPlacement) + '">Search ' + escapeHtml(placeholder) + '</label>' +
      '<input id="search-' + escapeHtml(viewId) + '-' + escapeHtml(fieldPlacement) + '" data-role="search" data-placement="' + escapeHtml(fieldPlacement) + '" data-view="' + escapeHtml(viewId) + '" value="' + escapeHtml(search.query) + '" placeholder="Search ' + escapeHtml(placeholder) + '">' +
      '<button class="regex-toggle" type="button" data-action="regex-open" data-view="' + escapeHtml(viewId) + '" aria-pressed="' + regexActive + '" aria-label="Open regular expression builder">.*</button>' +
      '</div>';
  }

  function pageHeading(title, description, actionHtml) {
    return '<header class="page-heading"><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) + '</p></div>' +
      '<div class="actions">' + (actionHtml || "") + '</div></header>';
  }

  function selectedHost() {
    const hosts = state.dashboard ? state.dashboard.hosts : [];
    return hosts.find(host => host.id === state.activeHostId) || hosts[0] || null;
  }

  function hostName(host) {
    if (!host) return "No computer paired";
    return state.preferences.hideHostNames ? "Hidden computer" : (host.displayName || host.hostname || "Computer");
  }

  function statusBadge(text, kind) {
    return '<span class="status ' + escapeHtml(kind || "neutral") + '">' + escapeHtml(text) + '</span>';
  }

  function metric(label, value, note) {
    return '<section class="card"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' +
      escapeHtml(value) + '</div><div class="metric-note">' + escapeHtml(note || "") + '</div></section>';
  }

  function navigationHtml() {
    const grouped = [
      { title: "Manage", ids: ["overview", "hosts", "services", "processes", "events"] },
      { title: "Monitor", ids: ["storage", "network", "updates", "firewall"] },
      { title: "Review", ids: ["operations", "audit", "settings"] }
    ];
    return grouped.map(group => '<h2 class="sidebar-heading">' + escapeHtml(group.title) + '</h2><nav class="nav-list" aria-label="' +
      escapeHtml(group.title) + '">' + group.ids.map(id => {
        const view = views.find(item => item.id === id);
        return '<button class="nav-item" type="button" data-view="' + view.id + '" aria-current="' +
          (state.activeView === id ? "page" : "false") + '"><span class="nav-icon" aria-hidden="true">' +
          view.icon + '</span><span>' + escapeHtml(view.title) + '</span></button>';
      }).join("") + '</nav>').join("");
  }

  function workspaceTabsHtml() {
    const hosts = state.dashboard ? state.dashboard.hosts : [];
    if (!hosts.length) return '<span class="tab-empty">No connected computers</span>';
    return hosts.map(host => '<button class="workspace-tab" type="button" data-host="' + escapeHtml(host.id) +
      '" aria-selected="' + (host.id === (state.activeHostId || hosts[0].id) ? "true" : "false") + '">' +
      escapeHtml(hostName(host)) + '</button>').join("");
  }

  function shell(content) {
    const view = views.find(item => item.id === state.activeView) || views[0];
    const status = state.dashboard && state.dashboard.pairingRequired
      ? '<span class="status warning">Setup incomplete</span>'
      : '<span class="status online">Protected session</span>';
    return '<div class="shell">' +
      '<header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">W</span><span>Watchdog Control</span></div>' +
      '<div class="workspace-tabs" role="tablist" aria-label="Connected computer workspaces">' + workspaceTabsHtml() + '</div>' +
      '<div class="top-actions">' + searchBar(state.activeView, view.title, "top") +
      '<button class="button" type="button" data-action="catalog-open">New tab</button>' +
      '<button class="icon-button" type="button" data-action="refresh" aria-label="Refresh data" title="Refresh data">↻</button>' +
      '<button class="button" type="button" data-action="logout">Sign out</button></div></header>' +
      '<aside class="sidebar">' + navigationHtml() + '<div class="sidebar-footer">' + status +
      '<p>Host actions use a fixed operation list and are recorded in the local audit log.</p></div></aside>' +
      '<main class="main" id="main-content" tabindex="-1">' + content +
      '<p class="footer-note">Data is stored on the controller. Browser preferences stay on this device. Last controller update: ' +
      escapeHtml(formatDate(state.dashboard && state.dashboard.serverTime)) + '</p></main></div>';
  }

  function noHostCard() {
    return '<section class="card empty-state"><h2>Connect your first computer</h2>' +
      '<p>Create a short-lived pairing code, install the signed-by-source Windows agent through your trusted setup process, then enroll it over HTTPS.</p>' +
      '<button class="button primary" type="button" data-action="invitation-create">Create pairing code</button></section>';
  }

  function renderOverview() {
    const host = selectedHost();
    if (!host) {
      return pageHeading("Overview", "A clear view of connected Windows computers and their current health.") +
        noHostCard() +
        '<section class="notice warning"><strong>No host data is available yet.</strong><p>The dashboard does not invent system readings. Pair a computer to see live inventory.</p></section>';
    }
    const snapshot = host.snapshot || {};
    const memoryPercent = snapshot.memoryTotalBytes > 0
      ? Math.max(0, Math.min(100, Math.round(snapshot.memoryUsedBytes / snapshot.memoryTotalBytes * 100)))
      : null;
    const volumeCount = (snapshot.volumes || []).length;
    const eventCount = (snapshot.events || []).length;
    const recent = (snapshot.events || []).slice(0, 5).map(event =>
      '<tr><td>' + escapeHtml(formatDate(event.time)) + '</td><td>' + escapeHtml(event.level) +
      '</td><td>' + escapeHtml(event.source) + '</td><td>' + escapeHtml(event.message) + '</td></tr>').join("");
    return pageHeading("Overview", "Live health and recent activity for " + hostName(host) + ".",
        '<button class="button" type="button" data-action="agent-refresh">Request fresh inventory</button>' +
        '<button class="button danger" type="button" data-action="power-prepare" data-kind="host.restart">Restart computer</button>' +
        '<button class="button danger" type="button" data-action="power-prepare" data-kind="host.shutdown">Shut down computer</button>') +
      '<div class="notice ' + (host.online ? "" : "warning") + '"><strong>' + escapeHtml(hostName(host)) + ' is ' +
      (host.online ? "connected" : "offline") + '.</strong><p>Last contact ' + escapeHtml(formatDate(host.lastSeenAt)) +
      '. Host readings were collected ' + escapeHtml(formatDate(snapshot.collectedAt)) + '.</p></div>' +
      '<div class="grid metrics">' +
      metric("Processor", snapshot.cpuPercent == null ? "—" : Number(snapshot.cpuPercent).toFixed(1) + "%", "Latest agent reading") +
      metric("Memory", memoryPercent == null ? "—" : memoryPercent + "%", snapshot.memoryTotalBytes ? formatBytes(snapshot.memoryUsedBytes) + " of " + formatBytes(snapshot.memoryTotalBytes) : "Not reported") +
      metric("Volumes", String(volumeCount), "Reported storage devices") +
      metric("Recent events", String(eventCount), "In the latest agent snapshot") +
      '</div><div class="grid two"><section class="card"><div class="card-heading"><h2>Computer details</h2>' +
      statusBadge(host.online ? "Online" : "Offline", host.online ? "online" : "warning") +
      '</div><dl class="kv-list"><dt>Computer name</dt><dd>' + escapeHtml(host.hostname || "Not reported") +
      '</dd><dt>Operating system</dt><dd>' + escapeHtml(snapshot.operatingSystem || "Not reported") +
      '</dd><dt>Agent version</dt><dd>' + escapeHtml(host.agentVersion || "Not reported") +
      '</dd><dt>Uptime</dt><dd>' + escapeHtml(formatDuration(snapshot.uptimeSeconds)) +
      '</dd><dt>Paired</dt><dd>' + escapeHtml(formatDate(host.enrolledAt)) +
      '</dd></dl></section><section class="card"><div class="card-heading"><h2>Capacity at a glance</h2></div>' +
      (snapshot.volumes || []).slice(0, 5).map(volume => {
        const used = Math.max(0, Number(volume.totalBytes) - Number(volume.freeBytes));
        const percent = Number(volume.totalBytes) > 0 ? Math.round(used / Number(volume.totalBytes) * 100) : 0;
        return '<div class="progress-row"><div class="progress-label"><span>' + escapeHtml(volume.name) +
          ' ' + escapeHtml(volume.label) + '</span><span>' + percent + '% used</span></div><div class="bar" role="progressbar" aria-valuenow="' +
          percent + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + escapeHtml(volume.name) +
          ' capacity used"><span style="width:' + percent + '%"></span></div><div class="metric-note">' +
          escapeHtml(formatBytes(volume.freeBytes)) + ' free of ' + escapeHtml(formatBytes(volume.totalBytes)) +
          '</div></div>';
      }).join("") || '<p class="hint">No volume readings have been reported.</p>') +
      '</section></div><section class="card"><div class="card-heading"><h2>Recent host events</h2>' +
      '<button class="button small" type="button" data-view="events">View event logs</button></div>' +
      (recent ? '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead><tbody>' +
        recent + '</tbody></table></div>' : '<div class="empty-state">The latest inventory has no event records.</div>') + '</section>';
  }

  function rowSearch(viewId, rows, selector) {
    const search = searchFor(viewId);
    const valueFor = rows.map(selector);
    if (!search.query && search.mode !== "regex") return Promise.resolve(rows);
    if (search.mode === "text") {
      const query = search.query.trim().toLocaleLowerCase();
      return Promise.resolve(query ? rows.filter((_, index) => valueFor[index].toLocaleLowerCase().includes(query)) : rows);
    }
    const expression = search.pattern || search.query;
    if (!expression) return Promise.resolve(rows);
    return boundedRegexMatches(valueFor, expression, search.flags).then(indices =>
      rows.filter((_, index) => indices.includes(index)));
  }

  function boundedRegexMatches(values, pattern, flags) {
    return new Promise((resolve, reject) => {
      if (!window.Worker || values.length > 5000 || pattern.length > 256) {
        reject(new Error("Regular expression search is unavailable for this data size."));
        return;
      }
      const worker = new Worker("/regex-worker.js");
      const timer = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("Regular expression search exceeded its time limit."));
      }, 180);
      worker.onmessage = event => {
        clearTimeout(timer);
        worker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.indices);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error("Regular expression search could not run."));
      };
      worker.postMessage({ values, pattern, flags });
    });
  }

  async function renderHosts() {
    const hosts = state.dashboard.hosts;
    const matching = await rowSearch("hosts", hosts, host =>
      [host.displayName, host.hostname, host.platform, host.agentVersion, host.online ? "online" : "offline"].join(" "));
    return pageHeading("Hosts", "Pair another computer, inspect its connection, or revoke a lost agent.") +
      '<div class="toolbar">' + searchBar("hosts", "computers") +
      '<span class="search-results">' + matching.length + " of " + hosts.length + " computers</span>" +
      '<button class="button primary" type="button" data-action="invitation-create">Create pairing code</button></div>' +
      (matching.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Platform</th><th>State</th><th>Last contact</th><th>Agent</th><th>Actions</th></tr></thead><tbody>' +
        matching.map(host => '<tr><td><button class="link-button" data-host="' + escapeHtml(host.id) + '">' +
          escapeHtml(hostName(host)) + '</button><small>' + escapeHtml(host.hostname || "Name not reported") +
          '</small></td><td>' + escapeHtml(host.platform) + '</td><td>' +
          statusBadge(host.online ? "Online" : "Offline", host.online ? "online" : "warning") +
          '</td><td>' + escapeHtml(formatDate(host.lastSeenAt)) + '</td><td>' + escapeHtml(host.agentVersion) +
          '</td><td><button class="button small danger" data-action="host-revoke" data-id="' + escapeHtml(host.id) +
          '">Revoke</button></td></tr>').join("") + '</tbody></table></div>' :
        '<div class="empty-state"><h2>No computers match</h2><p>Change the search or create a pairing code for a new computer.</p></div>');
  }

  function simplePage(title, description, recordsLabel, records, headers, cells, actions) {
    const rows = records || [];
    const viewId = state.activeView;
    return rowSearch(viewId, rows, record => JSON.stringify(record)).then(matching =>
      pageHeading(title, description, actions) +
      '<div class="toolbar">' + searchBar(viewId, recordsLabel) +
      '<span class="search-results">' + matching.length + " of " + rows.length + " records</span></div>" +
      (matching.length ? '<div class="table-wrap"><table><thead><tr>' + headers.map(header => '<th>' + escapeHtml(header) + '</th>').join("") +
        '</tr></thead><tbody>' + matching.map(record => '<tr>' + cells(record).map(cell => '<td>' + cell + '</td>').join("") + '</tr>').join("") +
        '</tbody></table></div>' : '<div class="empty-state"><h2>No ' + escapeHtml(recordsLabel) + ' reported</h2><p>The agent has not reported matching data in its latest inventory.</p></div>'));
  }

  function renderServices() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.services || [] : [];
    const rows = records.map(service => [
      escapeHtml(service.displayName), '<code>' + escapeHtml(service.id) + '</code>',
      escapeHtml(service.status), escapeHtml(service.startType),
      '<div class="row-actions"><button class="button small" data-action="host-operation" data-kind="service.start" data-target="' + escapeHtml(service.id) + '">Start</button>' +
      '<button class="button small" data-action="host-operation" data-kind="service.restart" data-target="' + escapeHtml(service.id) + '">Restart</button>' +
      '<button class="button small danger" data-action="host-operation" data-kind="service.stop" data-target="' + escapeHtml(service.id) + '">Stop</button></div>'
    ]);
    return simplePage("Services", "Review the latest service inventory and request a typed service action.", "services", records,
      ["Service", "Service name", "State", "Startup", "Actions"], record => rows[records.indexOf(record)],
      host ? '<span class="hint">Computer: ' + escapeHtml(hostName(host)) + '</span>' : "");
  }

  function renderProcesses() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.processes || [] : [];
    return simplePage("Processes", "Review process memory use. Termination requires an exact confirmation phrase.", "processes", records,
      ["Process", "PID", "Memory", "Started", "Action"], process => [
        escapeHtml(process.name), String(process.id), escapeHtml(formatBytes(process.workingSetBytes)),
        escapeHtml(formatDate(process.startedAt)),
        '<button class="button small danger" data-action="host-operation" data-kind="process.terminate" data-target="' +
        escapeHtml(process.identity) + '"' + (String(process.identity || "").endsWith(":unknown") ? " disabled" : "") + '>Terminate</button>'
      ], host ? '<span class="hint">Computer: ' + escapeHtml(hostName(host)) + '</span>' : "");
  }

  function renderEvents() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.events || [] : [];
    return simplePage("Event logs", "Read recent events returned by the paired agent. Messages are displayed as text and are never executed.", "events", records,
      ["Time", "Level", "Channel", "Source", "Message"], event => [
        escapeHtml(formatDate(event.time)), escapeHtml(event.level), escapeHtml(event.channel),
        escapeHtml(event.source), escapeHtml(event.message)
      ], host ? '<span class="hint">Computer: ' + escapeHtml(hostName(host)) + '</span>' : "");
  }

  function renderStorage() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.volumes || [] : [];
    return simplePage("Storage", "Inspect capacity and free space reported for each volume.", "volumes", records,
      ["Volume", "Label", "File system", "Total", "Free", "Used"], volume => {
        const used = Math.max(0, Number(volume.totalBytes) - Number(volume.freeBytes));
        const percent = Number(volume.totalBytes) > 0 ? Math.round(used / Number(volume.totalBytes) * 100) : 0;
        return [escapeHtml(volume.name), escapeHtml(volume.label), escapeHtml(volume.fileSystem),
          escapeHtml(formatBytes(volume.totalBytes)), escapeHtml(formatBytes(volume.freeBytes)),
          '<div class="bar" role="progressbar" aria-valuenow="' + percent + '" aria-valuemin="0" aria-valuemax="100" aria-label="Used capacity">' +
          '<span style="width:' + percent + '%"></span></div><span>' + percent + '%</span>'];
      }, host ? '<span class="hint">Computer: ' + escapeHtml(hostName(host)) + '</span>' : "");
  }

  function renderNetwork() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.networks || [] : [];
    const hostAction = host
      ? '<button class="button" type="button" data-action="network-flush">Flush DNS cache</button>'
      : "";
    return simplePage("Networking", "Review adapters and their reported addresses. DNS refresh is a fixed, predefined operation.", "network adapters", records,
      ["Adapter", "Description", "State", "Addresses"], network => [
        escapeHtml(network.name), escapeHtml(network.description), escapeHtml(network.status),
        escapeHtml((network.addresses || []).join(", ") || "No address")
      ], hostAction + (host ? '<span class="hint">Computer: ' + escapeHtml(hostName(host)) + '</span>' : ""));
  }

  function renderUpdates() {
    const host = selectedHost();
    const update = host && host.snapshot ? host.snapshot.updates : null;
    if (!update) {
      return pageHeading("Updates", "Review update status collected by the local agent.") +
        '<div class="empty-state"><h2>Update status is not available</h2><p>The installed agent has not returned an update summary.</p></div>';
    }
    const pending = update.pending || [];
    return pageHeading("Updates", "This view is read-only. Install or defer updates through the computer's approved maintenance window.") +
      '<section class="card"><div class="card-heading"><h2>Windows Update</h2>' + statusBadge(update.status, "neutral") +
      '</div><dl class="kv-list"><dt>Last checked</dt><dd>' + escapeHtml(formatDate(update.lastCheckedAt)) +
      '</dd><dt>Pending items</dt><dd>' + pending.length + '</dd></dl>' +
      (pending.length ? '<ul>' + pending.map(item => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>' :
        '<p class="hint">No pending update names were reported.</p>') + '</section>';
  }

  function renderFirewall() {
    const host = selectedHost();
    const firewall = host && host.snapshot ? host.snapshot.firewall : null;
    if (!firewall) {
      return pageHeading("Firewall", "Review reported firewall profile states. Changes are not available in this build.") +
        '<div class="empty-state"><h2>Firewall status is not available</h2><p>The local agent has not returned profile data.</p></div>';
    }
    return pageHeading("Firewall", "Profile state is read-only here. Manage firewall rules locally until a reviewed typed policy workflow is available.") +
      '<section class="card"><div class="card-heading"><h2>Profile status</h2></div><dl class="kv-list">' +
      '<dt>Domain</dt><dd>' + escapeHtml(firewall.domain) + '</dd><dt>Private</dt><dd>' + escapeHtml(firewall.private) +
      '</dd><dt>Public</dt><dd>' + escapeHtml(firewall.public) + '</dd></dl></section>';
  }

  function renderOperations() {
    const records = state.dashboard.operations || [];
    return simplePage("Operations", "Track queued, running, completed, and rejected host actions.", "operations", records,
      ["Requested", "Computer", "Action", "Status", "Result", "Requested by"], operation => {
        const host = state.dashboard.hosts.find(item => item.id === operation.hostId);
        return [escapeHtml(formatDate(operation.createdAt)), escapeHtml(host ? hostName(host) : operation.hostId),
          escapeHtml(operation.kind), escapeHtml(operation.status), escapeHtml(operation.result || "—"),
          escapeHtml(operation.requestedBy)];
      }, '<button class="button" type="button" data-action="agent-refresh">Request inventory refresh</button>');
  }

  function renderAudit() {
    const records = state.dashboard.audit || [];
    return simplePage("Audit", "Review a bounded history of owner and agent actions. Values are kept on the controller.", "audit records", records,
      ["Time", "Actor", "Action", "Target", "Outcome", "Details"], entry => [
        escapeHtml(formatDate(entry.time)), escapeHtml(entry.actor), escapeHtml(entry.action),
        escapeHtml(entry.target), escapeHtml(entry.outcome), escapeHtml(entry.detail || "—")
      ], '<button class="button" type="button" data-action="audit-export">Export audit JSON</button>');
  }

  function renderSettings() {
    const prefs = state.preferences;
    return pageHeading("Settings", "These preferences affect this browser only. Credentials and controller data are not exported.") +
      '<section class="card"><h2>Appearance</h2><div class="settings-group">' +
      settingSelect("theme", "Theme", "Choose the color scheme for this browser.", prefs.theme, [
        ["system", "Match device"], ["dark", "Dark"], ["light", "Light"]
      ]) +
      settingSelect("density", "Layout density", "Choose comfortable or compact table spacing.", prefs.density, [
        ["comfortable", "Comfortable"], ["compact", "Compact"]
      ]) +
      settingSelect("accent", "Accent color", "Set the control highlight color.", prefs.accent, [
        ["teal", "Teal"], ["blue", "Blue"], ["violet", "Violet"]
      ]) +
      '<label class="toggle"><input type="checkbox" data-pref="reduceMotion" ' + (prefs.reduceMotion ? "checked" : "") +
      '><span><strong>Reduce motion</strong><br><span class="hint">Use minimal transition effects.</span></span></label></div></section>' +
      '<section class="card"><h2>Data and refresh</h2><div class="settings-group">' +
      '<label class="toggle"><input type="checkbox" data-pref="autoRefresh" ' + (prefs.autoRefresh ? "checked" : "") +
      '><span><strong>Refresh automatically</strong><br><span class="hint">Request the latest controller and agent state at a fixed interval.</span></span></label>' +
      settingSelect("refreshSeconds", "Refresh interval", "Choose how often the browser requests controller data.", String(prefs.refreshSeconds), [
        ["15", "15 seconds"], ["30", "30 seconds"], ["60", "60 seconds"]
      ]) +
      '<label class="toggle"><input type="checkbox" data-pref="hideHostNames" ' + (prefs.hideHostNames ? "checked" : "") +
      '><span><strong>Hide computer names</strong><br><span class="hint">Mask names in this browser view.</span></span></label>' +
      '<button class="button" type="button" data-action="preferences-reset">Reset browser preferences</button></div></section>' +
      '<section class="card"><h2>Language availability</h2><p>English is available. Reviewed Cantonese and bilingual interface text are not included yet.</p>' +
      '<label class="field"><span>Interface language</span><select disabled aria-describedby="language-hint"><option>English</option></select>' +
      '<small id="language-hint">Additional translations are unfinished and will not be shown as complete.</small></label></section>' +
      '<section class="card"><h2>Operational boundaries</h2><ul>' +
      '<li>Only fixed operation identifiers are accepted by the controller.</li>' +
      '<li>Restart and shutdown require a short-lived challenge and exact typed confirmation.</li>' +
      '<li>Controller state and audit records stay in the configured data directory.</li>' +
      '<li>The browser uses a same-origin, HTTP-only session cookie and does not store a bearer token.</li>' +
      '</ul></section>';
  }

  function settingSelect(key, label, description, value, options) {
    return '<label class="settings-row"><span><strong>' + escapeHtml(label) + '</strong><br><span class="hint">' +
      escapeHtml(description) + '</span></span><select data-pref="' + escapeHtml(key) + '">' +
      options.map(option => '<option value="' + escapeHtml(option[0]) + '"' + (String(option[0]) === String(value) ? " selected" : "") +
        '>' + escapeHtml(option[1]) + '</option>').join("") + '</select></label>';
  }

  async function contentForActiveView() {
    switch (state.activeView) {
      case "overview": return renderOverview();
      case "hosts": return await renderHosts();
      case "services": return renderServices();
      case "processes": return renderProcesses();
      case "events": return renderEvents();
      case "storage": return renderStorage();
      case "network": return renderNetwork();
      case "updates": return renderUpdates();
      case "firewall": return renderFirewall();
      case "operations": return renderOperations();
      case "audit": return renderAudit();
      case "settings": return renderSettings();
      default: return renderOverview();
    }
  }

  let renderSequence = 0;
  async function render() {
    applyPreferences();
    if (!state.user) {
      root.innerHTML = state.setupRequired ? renderSetup() : renderLogin();
      return;
    }
    const sequence = ++renderSequence;
    root.innerHTML = '<div class="loading" role="status">Loading the latest controller state…</div>';
    try {
      const content = await contentForActiveView();
      if (sequence !== renderSequence) return;
      root.innerHTML = shell(content);
      updateSearchInput();
    } catch (error) {
      if (sequence !== renderSequence) return;
      root.innerHTML = shell(pageHeading("View could not load", "The controller did not return the requested view.") +
        '<section class="notice danger"><strong>Could not load ' + escapeHtml(state.activeView) +
        '.</strong><p>' + escapeHtml(error.message) + '</p><button class="button" data-action="refresh">Try again</button></section>');
    }
  }

  function updateSearchInput() {
    const search = searchFor(state.activeView);
    const input = root.querySelector('.topbar [data-role="search"]');
    if (input) {
      input.value = search.query;
      const button = input.parentElement.querySelector(".regex-toggle");
      button.setAttribute("aria-pressed", String(search.mode === "regex"));
    }
  }

  function renderSetup() {
    const step = state.setup.step;
    const labels = ["Owner account", "Security review", "Pair controller"];
    const progress = labels.map((label, index) => '<li class="' + (index <= step ? "current" : "") +
      '" aria-current="' + (index === step ? "step" : "false") + '">' + escapeHtml(label) + '</li>').join("");
    if (step === 0) {
      return '<main class="login-screen"><section class="login-card"><p class="eyebrow">First run setup · Step 1 of 3</p>' +
        '<h1>Create the controller owner</h1><p>Use the one-time code supplied by your trusted setup process. Credentials are sent only to this HTTPS controller.</p>' +
        '<ol class="wizard-progress">' + progress + '</ol>' +
        (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
        '<form class="form-grid" data-form="setup"><label class="field"><span>One-time pairing code</span><input name="code" type="password" autocomplete="one-time-code" required minlength="24" maxlength="256"></label>' +
        '<label class="field"><span>Owner name</span><input name="username" value="' + escapeHtml(state.setup.username) +
        '" autocomplete="username" required minlength="3" maxlength="64"></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="new-password" required minlength="14" maxlength="256"></label>' +
        '<p class="hint">Use at least 14 characters. The code and password are held only in memory and are not saved when setup resumes.</p>' +
        '<button class="button primary" type="submit">Continue</button></form></section></main>';
    }
    if (step === 1) {
      return '<main class="login-screen"><section class="login-card"><p class="eyebrow">First run setup · Step 2 of 3</p>' +
        '<h1>Review the security boundary</h1><p>Before pairing, confirm that this controller is on a trusted private network and uses HTTPS with a certificate you have verified.</p>' +
        '<ol class="wizard-progress">' + progress + '</ol><ul><li>The pairing code is single use.</li><li>The owner password is stored as a salted password hash.</li>' +
        '<li>Host actions use fixed operation names and are written to the audit log.</li><li>Restart and shutdown require an expiring challenge and exact typed confirmation.</li></ul>' +
        '<label class="toggle"><input type="checkbox" data-setup="security-confirm"><span>I understand that the dashboard is reachable only from the trusted LAN and should not be exposed to the public Internet.</span></label>' +
        '<div class="dialog-actions"><button class="button" data-action="setup-back">Back</button><button class="button primary" data-action="setup-next" data-needs-confirm="true">Next</button></div></section></main>';
    }
    return '<main class="login-screen"><section class="login-card"><p class="eyebrow">First run setup · Step 3 of 3</p>' +
      '<h1>Pair the controller</h1><p>Setup creates the first owner and opens the productive host workspace. No computer is enrolled until a separate one-time agent code is used.</p>' +
      '<ol class="wizard-progress">' + progress + '</ol>' +
      (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
      '<div class="notice"><strong>Ready for ' + escapeHtml(state.setup.username || "the first owner") + '.</strong><p>The one-time code is not saved between page loads. If this page was refreshed, go back and enter it again.</p></div>' +
      '<div class="dialog-actions"><button class="button" data-action="setup-back">Back</button><button class="button primary" data-action="setup-finish">Create owner and open dashboard</button></div></section></main>';
  }

  function renderLogin() {
    return '<main class="login-screen"><section class="login-card"><p class="eyebrow">Private network administration</p><h1>Watchdog Control</h1>' +
      '<p>Sign in to review connected computers and their latest status.</p>' +
      (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
      '<form class="form-grid" data-form="login"><label class="field"><span>Owner name</span><input name="username" autocomplete="username" required></label>' +
      '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="button primary" type="submit">Sign in</button></form>' +
      '<p class="hint">The controller must use HTTPS before it accepts credentials.</p></section></main>';
  }

  function openRegexBuilder(viewId) {
    const search = viewId === "catalog" ? state.catalogSearch : searchFor(viewId);
    if (search.mode !== "regex") {
      search.mode = "regex";
      if (!search.pattern) search.pattern = search.query;
    }
    const examples = "Example: ^(warning|error)$ with flags gi";
    openDialog('<h2 id="dialog-title">Regular expression builder</h2><p>Independent JavaScript regular-expression mode for ' +
      escapeHtml(viewId === "catalog" ? "the new-tab catalog" : (views.find(item => item.id === viewId)?.title || viewId)) +
      '. Pattern length is capped, matching runs in a worker with a time limit, and unsupported engine features are not simulated.</p>' +
      '<div class="form-grid"><label class="field"><span>Pattern</span><input data-regex="pattern" maxlength="256" value="' +
      escapeHtml(search.pattern || search.query) + '" spellcheck="false"></label>' +
      '<label class="field"><span>Flags</span><input data-regex="flags" maxlength="6" value="' + escapeHtml(search.flags || "gi") +
      '" spellcheck="false"><small>Allowed flags: d, g, i, m, s, u, v, y. Each flag may appear once.</small></label>' +
      '<label class="field"><span>Sample text</span><textarea data-regex="sample" rows="3" maxlength="4096">' + escapeHtml(search.sample || "") +
      '</textarea></label><div class="notice" id="regex-result" role="status">' + escapeHtml(examples) +
      '</div><div class="actions"><button class="button" data-action="regex-check">Validate pattern</button>' +
      '<button class="button" data-action="regex-text">Use plain-text search</button><button class="button primary" data-action="regex-save" data-view="' +
      escapeHtml(viewId) + '">Apply regex search</button></div></div>');
  }

  function regexBuilderInputs() {
    return {
      pattern: dialogContent.querySelector('[data-regex="pattern"]')?.value || "",
      flags: dialogContent.querySelector('[data-regex="flags"]')?.value || "",
      sample: dialogContent.querySelector('[data-regex="sample"]')?.value || ""
    };
  }

  function checkRegex() {
    const inputs = regexBuilderInputs();
    const result = dialogContent.querySelector("#regex-result");
    if (inputs.pattern.length > 256) {
      result.textContent = "Pattern is longer than the 256-character limit.";
      return;
    }
    try {
      const expression = new RegExp(inputs.pattern, inputs.flags);
      const matches = inputs.sample.match(expression) || [];
      result.textContent = "Valid JavaScript pattern. " + matches.length + " sample match(es).";
    } catch (error) {
      result.textContent = "Invalid pattern: " + error.message;
    }
  }

  function openCatalog() {
    state.catalogSearch = state.catalogSearch || { query: "", mode: "text", pattern: "", flags: "gi", sample: "" };
    openDialog('<h2 id="dialog-title">Open a workspace</h2><p>Choose a destination. Opening Settings or a tool does not create another computer tab.</p>' +
      '<div class="toolbar">' + searchBar("catalog", "tools and destinations", "catalog") + '</div>' +
      '<div class="catalog-list" aria-live="polite"><div class="loading">Finding destinations…</div></div>');
    void updateCatalog();
  }

  let catalogRenderSequence = 0;
  function updateCatalog() {
    const sequence = ++catalogRenderSequence;
    const search = state.catalogSearch;
    const list = dialogContent.querySelector(".catalog-list");
    if (!list) return;
    let matches;
    if (search.mode === "regex" && (search.pattern || search.query)) {
      const values = views.map(view => view.title + " " + view.description);
      void boundedRegexMatches(values, search.pattern || search.query, search.flags).then(indices => {
        if (sequence !== catalogRenderSequence) return;
        matches = indices.map(index => views[index]);
        renderCatalogMatches(list, matches);
      }).catch(error => {
        if (sequence !== catalogRenderSequence) return;
        list.innerHTML = '<div class="notice warning" role="status">' + escapeHtml(error.message) + '</div>';
      });
      return;
    }
    const query = (search.query || "").toLocaleLowerCase();
    matches = views.filter(view => (view.title + " " + view.description).toLocaleLowerCase().includes(query));
    renderCatalogMatches(list, matches);
  }

  function renderCatalogMatches(list, matches) {
    if (!list) return;
    list.innerHTML = matches.map(view => '<button class="catalog-item" type="button" data-view="' + escapeHtml(view.id) +
      '"><span class="catalog-icon" aria-hidden="true">' + view.icon + '</span><span><strong>' + escapeHtml(view.title) +
      '</strong><small>' + escapeHtml(view.description) + '</small></span><span aria-hidden="true">›</span></button>').join("") ||
      '<div class="empty-state">No destinations match this search.</div>';
  }

  async function refreshDashboard(showNotice) {
    if (!state.user) return;
    try {
      state.dashboard = await request("/api/dashboard");
      if (!state.activeHostId && state.dashboard.hosts.length) state.activeHostId = state.dashboard.hosts[0].id;
      const selectedStillExists = state.dashboard.hosts.some(host => host.id === state.activeHostId);
      if (!selectedStillExists) state.activeHostId = state.dashboard.hosts[0]?.id || null;
      if (showNotice) toast("Updated", "Controller data refreshed.");
      await render();
    } catch (error) {
      if (error.status === 401) {
        state.user = null;
        state.pendingSetupError = "Your session expired. Sign in again.";
        render();
      } else if (showNotice) {
        toast("Refresh failed", error.message, true);
      }
    }
  }

  async function loadInitialState() {
    applyPreferences();
    try {
      const setup = await request("/api/setup/status");
      state.setupRequired = Boolean(setup.pairingRequired);
      if (state.setupRequired) {
        try {
          const saved = JSON.parse(localStorage.getItem(setupKey) || "{}");
          state.setup.username = typeof saved.username === "string" ? saved.username : "";
          state.setup.step = 0;
        } catch {
          state.setup.step = 0;
        }
        render();
        return;
      }
      state.user = await request("/api/session");
      await refreshDashboard(false);
    } catch (error) {
      state.user = null;
      state.setupRequired = false;
      state.pendingSetupError = error.message;
      render();
    }
  }

  async function createInvitation() {
    const hostNameValue = window.prompt("Name this computer invitation");
    if (hostNameValue === null) return;
    if (hostNameValue.trim().length < 2 || hostNameValue.trim().length > 80) {
      toast("Invitation not created", "Use a name between 2 and 80 characters.", true);
      return;
    }
    try {
      const invitation = await request("/api/agents/invitations", {
        method: "POST", body: { displayName: hostNameValue.trim() }
      });
      openDialog('<h2 id="dialog-title">Pairing code created</h2><p>Give this code to the trusted agent setup process for ' +
        escapeHtml(invitation.displayName) + '. It expires at ' + escapeHtml(formatDate(invitation.expiresAt)) +
        ' and can be used once. This is the only time the code is displayed.</p><div class="code-block" tabindex="0" data-copy="' +
        escapeHtml(invitation.code) + '">' + escapeHtml(invitation.code) + '</div>' +
        '<p class="hint">The code is not written to the audit log. Keep it out of public chat and support records.</p>' +
        '<div class="dialog-actions"><button class="button" data-action="copy-code">Copy code</button><button class="button primary" data-action="dialog-close">Done</button></div>');
      toast("Pairing code created", "Use it once before it expires.");
    } catch (error) {
      toast("Could not create pairing code", error.message, true);
    }
  }

  async function requestHostOperation(kind, targetId) {
    const host = selectedHost();
    if (!host) return toast("No computer selected", "Pair a computer before requesting an action.", true);
    const body = { kind, targetId: targetId || null, confirmationPhrase: null };
    try {
      await request("/api/hosts/" + encodeURIComponent(host.id) + "/operations", { method: "POST", body });
      toast("Action queued", "The computer will report the result when it finishes.");
      await refreshDashboard(false);
    } catch (error) {
      if (error.status === 409 && error.body && error.body.error === "confirmation-required") {
        openOperationConfirmation(host, kind, targetId, error.body.requiredPhrase);
        return;
      }
      toast("Action not queued", error.message, true);
    }
  }

  function openOperationConfirmation(host, kind, targetId, phrase) {
    openDialog('<h2 id="dialog-title">Confirm ' + escapeHtml(kind) + '</h2><p>This action is checked against the current host inventory. Type the exact phrase shown below.</p>' +
      '<div class="code-block">' + escapeHtml(phrase) + '</div><label class="field"><span>Confirmation phrase</span><input data-confirm="operation" autocomplete="off"></label>' +
      '<div class="dialog-actions"><button class="button" data-action="dialog-close">Cancel</button><button class="button danger" data-action="operation-confirm" data-host="' +
      escapeHtml(host.id) + '" data-kind="' + escapeHtml(kind) + '" data-target="' + escapeHtml(targetId || "") +
      '">Queue action</button></div>', '[data-confirm="operation"]');
  }

  async function confirmOperation(button) {
    const hostId = button.dataset.host;
    const phrase = dialogContent.querySelector('[data-confirm="operation"]').value;
    try {
      await request("/api/hosts/" + encodeURIComponent(hostId) + "/operations", {
        method: "POST",
        body: { kind: button.dataset.kind, targetId: button.dataset.target || null, confirmationPhrase: phrase }
      });
      closeDialog();
      toast("Action queued", "The computer will report the result when it finishes.");
      await refreshDashboard(false);
    } catch (error) {
      toast("Action not queued", error.message, true);
    }
  }

  async function preparePower(kind) {
    const host = selectedHost();
    if (!host) return toast("No computer selected", "Pair a computer before requesting a power action.", true);
    try {
      const challenge = await request("/api/hosts/" + encodeURIComponent(host.id) + "/power/prepare", {
        method: "POST", body: { kind, hostId: host.id }
      });
      openDialog('<h2 id="dialog-title">' + (kind === "host.restart" ? "Restart" : "Shut down") +
        ' computer</h2><div class="notice danger"><strong>This will change the selected computer state.</strong><p>The request expires at ' +
        escapeHtml(formatDate(challenge.expiresAt)) + '. Unsaved work on that computer may be interrupted.</p></div>' +
        '<p>Type the exact confirmation phrase:</p><div class="code-block">' + escapeHtml(challenge.confirmationPhrase) + '</div>' +
        '<label class="field"><span>Confirmation phrase</span><input data-confirm="power" autocomplete="off"></label>' +
        '<div class="dialog-actions"><button class="button" data-action="dialog-close">Cancel</button><button class="button danger" data-action="power-confirm" data-id="' +
        escapeHtml(challenge.challengeId) + '">Confirm ' + (kind === "host.restart" ? "restart" : "shutdown") + '</button></div>',
        '[data-confirm="power"]');
    } catch (error) {
      toast("Power action not prepared", error.message, true);
    }
  }

  async function confirmPower(button) {
    const phrase = dialogContent.querySelector('[data-confirm="power"]').value;
    try {
      await request("/api/power/" + encodeURIComponent(button.dataset.id) + "/confirm", {
        method: "POST", body: { confirmationPhrase: phrase }
      });
      closeDialog();
      toast("Power action queued", "The agent will report its status when available.");
      await refreshDashboard(false);
    } catch (error) {
      toast("Power action not queued", error.message, true);
    }
  }

  async function requestInventory() {
    const host = selectedHost();
    if (!host) return toast("No computer selected", "Pair a computer before requesting inventory.", true);
    await requestHostOperation("system.refresh", null);
  }

  async function flushDns() {
    await requestHostOperation("network.flushDns", null);
  }

  function exportAudit() {
    const content = JSON.stringify(state.dashboard.audit || [], null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "watchdog-audit.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Audit export created", "The file contains audit records only, not credentials.");
  }

  async function revokeHost(hostId) {
    const host = state.dashboard.hosts.find(item => item.id === hostId);
    if (!host || !window.confirm("Revoke " + hostName(host) + "? Its agent token will no longer be accepted.")) return;
    try {
      await request("/api/agents/" + encodeURIComponent(hostId), { method: "DELETE" });
      toast("Computer access revoked", "The agent can no longer authenticate.");
      await refreshDashboard(false);
    } catch (error) {
      toast("Could not revoke access", error.message, true);
    }
  }

  function setupNext(needsConfirm) {
    if (needsConfirm && !root.querySelector('[data-setup="security-confirm"]')?.checked) {
      toast("Review required", "Confirm that the controller stays on a trusted private network.", true);
      return;
    }
    state.setup.step = Math.min(2, state.setup.step + 1);
    state.pendingSetupError = "";
    render();
  }

  function setupBack() {
    state.setup.step = Math.max(0, state.setup.step - 1);
    state.pendingSetupError = "";
    render();
  }

  async function setupFinish() {
    if (!state.setup.code || !state.setup.password || !state.setup.username) {
      state.setup.step = 0;
      state.pendingSetupError = "The one-time code and password were cleared when the page was refreshed. Enter them again.";
      render();
      return;
    }
    try {
      state.user = await request("/api/setup/pair", {
        method: "POST",
        body: { code: state.setup.code, username: state.setup.username, password: state.setup.password }
      });
      state.setup.code = "";
      state.setup.password = "";
      localStorage.removeItem(setupKey);
      state.setupRequired = false;
      toast("Owner created", "Setup is complete. The host workspace is ready.");
      await refreshDashboard(false);
    } catch (error) {
      state.pendingSetupError = error.message;
      if (error.status === 426) state.pendingSetupError = "HTTPS is required before the first owner can be created.";
      render();
    }
  }

  async function onSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.dataset.form === "setup") {
      state.setup.code = String(data.get("code") || "");
      state.setup.username = String(data.get("username") || "").trim();
      state.setup.password = String(data.get("password") || "");
      if (state.setup.username.length < 3 || state.setup.password.length < 14 || state.setup.code.length < 24) {
        state.pendingSetupError = "Check the owner name, one-time code, and 14-character minimum password.";
        render();
        return;
      }
      localStorage.setItem(setupKey, JSON.stringify({ username: state.setup.username, started: true }));
      state.setup.step = 1;
      state.pendingSetupError = "";
      render();
      return;
    }
    if (form.dataset.form === "login") {
      try {
        state.user = await request("/api/session", {
          method: "POST",
          body: { username: String(data.get("username") || ""), password: String(data.get("password") || "") }
        });
        state.pendingSetupError = "";
        await refreshDashboard(false);
      } catch {
        state.pendingSetupError = "The sign-in was not accepted. Check the owner name and password.";
        render();
      }
    }
  }

  function changeView(viewId) {
    if (!views.some(view => view.id === viewId)) return;
    state.activeView = viewId;
    closeDialog();
    render();
    window.setTimeout(() => document.getElementById("main-content")?.focus(), 0);
  }

  function updateSearch(viewId, query, placement) {
    const search = viewId === "catalog" ? state.catalogSearch : searchFor(viewId);
    search.query = query;
    if (search.mode === "regex") search.pattern = query;
    if (viewId === "catalog") {
      updateCatalog();
      return;
    }
    if (viewId === state.activeView) {
      const selector = '[data-role="search"][data-view="' + viewId + '"][data-placement="' + (placement || "page") + '"]';
      const selectionStart = root.querySelector(selector)?.selectionStart;
      void render().then(() => {
        const input = root.querySelector(selector);
        if (input) {
          input.focus();
          if (selectionStart != null) input.setSelectionRange(selectionStart, selectionStart);
        }
      });
    }
  }

  function setPreference(key, value) {
    if (key === "refreshSeconds") value = Number(value);
    if (key === "autoRefresh" || key === "hideHostNames" || key === "reduceMotion") value = Boolean(value);
    state.preferences[key] = value;
    savePreferences();
    if (key === "hideHostNames" || key === "refreshSeconds" || key === "autoRefresh") render();
  }

  async function onClick(event) {
    const target = event.target.closest("[data-action], [data-view], [data-host]");
    if (!target) return;
    if (target.dataset.action === "setup-next") return setupNext(target.dataset.needsConfirm === "true");
    if (target.dataset.action === "setup-back") return setupBack();
    if (target.dataset.action === "setup-finish") return setupFinish();
    if (target.dataset.action === "dialog-close") return closeDialog();
    if (target.dataset.action === "catalog-open") return openCatalog();
    if (target.dataset.action === "refresh") return refreshDashboard(true);
    if (target.dataset.action === "logout") {
      try { await request("/api/session", { method: "DELETE" }); } catch {}
      state.user = null;
      state.dashboard = null;
      restartRefreshTimer();
      render();
      return;
    }
    if (target.dataset.action === "regex-open") return openRegexBuilder(target.dataset.view || state.activeView);
    if (target.dataset.action === "regex-check") return checkRegex();
    if (target.dataset.action === "regex-text") {
      const viewId = target.dataset.view || state.activeView;
      (viewId === "catalog" ? state.catalogSearch : searchFor(viewId)).mode = "text";
      closeDialog();
      render();
      return;
    }
    if (target.dataset.action === "regex-save") {
      const viewId = target.dataset.view || state.activeView;
      const search = viewId === "catalog" ? state.catalogSearch : searchFor(viewId);
      const inputs = regexBuilderInputs();
      search.pattern = inputs.pattern;
      search.flags = inputs.flags;
      search.sample = inputs.sample;
      search.query = inputs.pattern;
      search.mode = "regex";
      closeDialog();
      if (viewId === "catalog") openCatalog();
      else render();
      return;
    }
    if (target.dataset.action === "invitation-create") return createInvitation();
    if (target.dataset.action === "host-operation") return requestHostOperation(target.dataset.kind, target.dataset.target);
    if (target.dataset.action === "operation-confirm") return confirmOperation(target);
    if (target.dataset.action === "power-prepare") return preparePower(target.dataset.kind);
    if (target.dataset.action === "power-confirm") return confirmPower(target);
    if (target.dataset.action === "agent-refresh") return requestInventory();
    if (target.dataset.action === "network-flush") return flushDns();
    if (target.dataset.action === "audit-export") return exportAudit();
    if (target.dataset.action === "host-revoke") return revokeHost(target.dataset.id);
    if (target.dataset.action === "preferences-reset") {
      localStorage.removeItem(preferenceKey);
      state.preferences = readPreferences();
      applyPreferences();
      render();
      toast("Preferences reset", "Browser-only display settings returned to their defaults.");
      return;
    }
    if (target.dataset.action === "copy-code") {
      const code = dialogContent.querySelector("[data-copy]")?.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(code);
        toast("Code copied", "Treat it as a one-time credential.");
      } catch {
        toast("Copy unavailable", "Select the displayed code and copy it manually.", true);
      }
      return;
    }
    if (target.dataset.view) return changeView(target.dataset.view);
    if (target.dataset.host) {
      state.activeHostId = target.dataset.host;
      if (!target.closest("#dialog")) render();
      else {
        closeDialog();
        render();
      }
    }
  }

  function onInput(event) {
    const input = event.target;
    if (input.matches('[data-role="search"]')) {
      const viewId = input.dataset.view;
      updateSearch(viewId, input.value, input.dataset.placement);
      return;
    }
    if (input.dataset.regex) {
      const viewId = input.closest(".toolbar")?.querySelector('[data-view="catalog"]') ? "catalog" : state.activeView;
      const search = viewId === "catalog" ? state.catalogSearch : searchFor(viewId);
      if (input.dataset.regex === "pattern") {
        search.pattern = input.value;
        search.query = input.value;
      }
      if (input.dataset.regex === "flags") search.flags = input.value;
      if (input.dataset.regex === "sample") search.sample = input.value;
      return;
    }
  }

  function onChange(event) {
    const input = event.target;
    if (!input.dataset.pref) return;
    const key = input.dataset.pref;
    setPreference(key, input.type === "checkbox" ? input.checked : input.value);
  }

  root.addEventListener("submit", event => void onSubmit(event));
  root.addEventListener("click", event => void onClick(event));
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  dialogContent.addEventListener("click", event => void onClick(event));
  dialogContent.addEventListener("input", onInput);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialog();
  });
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (state.preferences.theme === "system") applyPreferences();
  });

  void loadInitialState();
})();
