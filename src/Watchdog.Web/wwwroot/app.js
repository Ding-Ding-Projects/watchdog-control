(() => {
  "use strict";

  const root = document.getElementById("app");
  const dialog = document.getElementById("dialog");
  const dialogContent = document.getElementById("dialog-content");
  const palette = document.getElementById("palette");
  const paletteQuery = document.getElementById("palette-query");
  const paletteList = document.getElementById("palette-list");
  const contextMenu = document.getElementById("context-menu");
  const announcer = document.getElementById("announcer");
  const toastRegion = document.getElementById("toasts");
  const preferenceKey = "watchdog-control.preferences.v2";
  const legacyPreferenceKey = "watchdog-control.preferences.v1";
  const setupKey = "watchdog-control.setup-progress.v1";
  const notificationKey = "watchdog-control.notifications.v1";
  const trustedSignInHosts = ["openai.com", "chatgpt.com"];

  const icon = {
    overview: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z"/>',
    hosts: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    services: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    processes: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    events: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    storage: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    network: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    updates: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    firewall: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    remote: '<path d="M4 17l6-6-6-6M12 19h8"/>',
    operations: '<path d="M5 3l14 9-14 9z"/>',
    audit: '<path d="M8 3h8l4 4v14H4V3h4M9 12h6M9 16h6M9 8h2"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    relay: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'
  };
  const svg = (name, extra) => '<svg viewBox="0 0 24 24" aria-hidden="true"' + (extra || "") + '>' + (icon[name] || "") + '</svg>';

  const views = [
    { id: "overview", group: "monitor", icon: "overview", title: "Command centre", zh: "指揮中心", description: "Live health, telemetry and recent activity for the selected computer.", zhDescription: "所選電腦嘅即時狀態、遙測同最新活動。" },
    { id: "services", group: "monitor", icon: "services", title: "Services", zh: "服務", description: "Inspect Windows services and start, stop or restart one.", zhDescription: "檢查 Windows 服務，啟動、停止或者重新啟動。" },
    { id: "processes", group: "monitor", icon: "processes", title: "Processes", zh: "程序", description: "Review running processes and request a confirmed termination.", zhDescription: "查看執行中嘅程序，確認後先終止。" },
    { id: "events", group: "monitor", icon: "events", title: "Event stream", zh: "事件流", description: "Read recent system, application and security events.", zhDescription: "閱讀最近嘅系統、應用程式同保安事件。" },
    { id: "storage", group: "monitor", icon: "storage", title: "Storage", zh: "儲存", description: "Check volumes, free space and capacity.", zhDescription: "檢查磁碟區、剩餘空間同容量。" },
    { id: "network", group: "monitor", icon: "network", title: "Network", zh: "網絡", description: "Review adapters and request a DNS cache refresh.", zhDescription: "查看網絡介面，要求重新整理 DNS 快取。" },
    { id: "updates", group: "monitor", icon: "updates", title: "Updates", zh: "更新", description: "Review the latest Windows Update status reported by the computer.", zhDescription: "查看電腦回報嘅 Windows Update 狀態。" },
    { id: "firewall", group: "monitor", icon: "firewall", title: "Firewall", zh: "防火牆", description: "Review the reported firewall profile state.", zhDescription: "查看回報嘅防火牆設定檔狀態。" },
    { id: "remote", group: "remote", icon: "remote", title: "Slop Machine", zh: "Slop Machine", description: "Sign the codex command-line tool in, start remote control and pair a phone.", zhDescription: "幫 codex 命令列工具登入、啟動遙控同配對手機。" },
    { id: "hosts", group: "remote", icon: "hosts", title: "Computers and pairing", zh: "電腦同配對", description: "Pair computers, review their connection and revoke access.", zhDescription: "配對電腦、查看連線同撤銷存取權。" },
    { id: "operations", group: "records", icon: "operations", title: "Operations", zh: "操作", description: "Inspect the action queue and its results.", zhDescription: "檢查操作佇列同結果。" },
    { id: "audit", group: "records", icon: "audit", title: "Audit", zh: "審計", description: "Review recent administrative actions.", zhDescription: "查看最近嘅管理操作。" },
    { id: "settings", group: "records", icon: "settings", title: "Settings", zh: "設定", description: "Language, appearance, focus, sound and refresh preferences for this browser.", zhDescription: "呢個瀏覽器嘅語言、外觀、專注、聲音同更新設定。" }
  ];
  const groups = [
    { id: "monitor", title: "Monitor", zh: "監察" },
    { id: "remote", title: "Remote", zh: "遙距" },
    { id: "records", title: "Records", zh: "紀錄" }
  ];
  const phrases = {
    "Sign out": "登出", "Refresh": "重新整理", "Pair a computer": "配對電腦", "Request fresh inventory": "要求最新資料",
    "Restart computer": "重新啟動電腦", "Shut down computer": "關閉電腦", "Search": "搜尋", "Notifications": "通知",
    "Command palette": "指令面板", "Live link": "即時連線", "Event stream": "事件流", "Memory": "記憶體",
    "Processor": "處理器", "Uptime": "運行時間", "Warnings": "警告", "Power": "電源", "Host radar": "主機雷達",
    "Telemetry": "遙測", "Slop Machine link": "Slop Machine 連線", "Open": "打開", "Start remote control": "啟動遙控",
    "Stop": "停止", "Create pairing code": "建立配對碼", "Sign-in assist": "登入協助", "Remote control": "遙控",
    "Pair a phone": "配對手機", "Run status check": "檢查狀態", "Start sign-in": "開始登入", "Cancel": "取消",
    "Open sign-in page": "打開登入頁", "Copy code": "複製代碼", "Activity": "活動"
  };
  const tips = {
    overview: "Each number here comes from the paired computer. If a box is empty, the computer has not sent that reading yet.",
    services: "A service is a program that runs in the background. Stopping one asks you to type its exact name first.",
    processes: "A process is a running program. Ending one can lose unsaved work, so you must type a confirmation.",
    events: "Events are notes Windows writes when something happens. Warnings are worth reading; information is usually fine.",
    storage: "Keep at least a tenth of each drive free so Windows can update and run smoothly.",
    network: "Flushing DNS makes the computer look up website addresses again. It is safe and quick.",
    updates: "This page only reads update status. Install updates on the computer during a time that suits you.",
    firewall: "The firewall blocks unexpected connections. All three profiles should usually be on.",
    remote: "Work top to bottom: check the tool, sign in, start remote control, then pair your phone.",
    hosts: "Pairing gives a computer a one-time code. Revoking stops it from talking to this dashboard.",
    operations: "Every action you request waits here until the computer reports a result.",
    audit: "The audit log records who did what and when. It never stores passwords or one-time codes.",
    settings: "These choices only change this browser. Use Export to copy them to another browser."
  };

  const state = {
    user: null,
    setupRequired: false,
    setup: { step: 0, username: "", code: "", password: "" },
    dashboard: null,
    activeView: "overview",
    lastRenderedView: null,
    activeHostId: null,
    searches: Object.create(null),
    preferences: readPreferences(),
    refreshTimer: null,
    remote: { hostId: null, data: null, error: "", fastUntil: 0, timer: null },
    telemetry: Object.create(null),
    notifications: readNotifications(),
    pendingSetupError: "",
    menuOpen: false,
    paletteIndex: 0,
    paletteItems: [],
    voices: [],
    health: null
  };

  function defaults() {
    return {
      theme: "dark", accent: "#3DE8FF", density: "comfortable", textScale: 100, highContrast: false,
      motion: "device", language: "en", playfulEnglish: 2, playfulCantonese: 2, emoji: false,
      productName: "Watchdog Control", vocabulary: {}, schoolMode: false, spotlight: false, oneThing: false,
      cheer: true, narration: false, voice: "", sounds: false, refreshSeconds: 15, autoRefresh: true, hideHostNames: false
    };
  }

  function readPreferences() {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || "null");
      if (saved && typeof saved === "object") return sanitizePreferences(Object.assign(base, saved));
      const legacy = JSON.parse(localStorage.getItem(legacyPreferenceKey) || "null");
      if (legacy && typeof legacy === "object") {
        if (legacy.theme === "light" || legacy.theme === "system") base.theme = legacy.theme;
        if (legacy.density === "compact") base.density = "compact";
        if (legacy.reduceMotion) base.motion = "reduced";
        base.autoRefresh = legacy.autoRefresh !== false;
        base.hideHostNames = Boolean(legacy.hideHostNames);
        if ([15, 30, 60].includes(Number(legacy.refreshSeconds))) base.refreshSeconds = Number(legacy.refreshSeconds);
      }
    } catch {
      return base;
    }
    return base;
  }

  function sanitizePreferences(value) {
    const base = defaults();
    const out = Object.assign({}, base);
    if (["dark", "light", "system"].includes(value.theme)) out.theme = value.theme;
    if (/^#[0-9a-f]{6}$/i.test(value.accent || "")) out.accent = value.accent;
    if (["comfortable", "compact"].includes(value.density)) out.density = value.density;
    out.textScale = clamp(Number(value.textScale) || 100, 85, 150);
    if (["device", "full", "reduced"].includes(value.motion)) out.motion = value.motion;
    if (["en", "zh", "both"].includes(value.language)) out.language = value.language;
    out.playfulEnglish = clamp(Math.round(Number(value.playfulEnglish)), 0, 5);
    out.playfulCantonese = clamp(Math.round(Number(value.playfulCantonese)), 0, 5);
    if (Number.isNaN(out.playfulEnglish)) out.playfulEnglish = base.playfulEnglish;
    if (Number.isNaN(out.playfulCantonese)) out.playfulCantonese = base.playfulCantonese;
    out.productName = typeof value.productName === "string" && value.productName.trim().length >= 2 && value.productName.length <= 40 ? value.productName.trim() : base.productName;
    out.vocabulary = sanitizeVocabulary(value.vocabulary);
    for (const key of ["highContrast", "emoji", "schoolMode", "spotlight", "oneThing", "cheer", "narration", "sounds", "autoRefresh", "hideHostNames"]) out[key] = Boolean(value[key]);
    out.voice = typeof value.voice === "string" ? value.voice.slice(0, 200) : "";
    out.refreshSeconds = [10, 15, 30, 60].includes(Number(value.refreshSeconds)) ? Number(value.refreshSeconds) : 15;
    return out;
  }

  function sanitizeVocabulary(value) {
    const out = {};
    let entries = [];
    if (value && Array.isArray(value.terms)) entries = value.terms.map(term => [term && term.from, term && term.to]);
    else if (value && typeof value === "object") entries = Object.entries(value);
    for (const [from, to] of entries.slice(0, 500)) {
      if (typeof from === "string" && typeof to === "string" && from.trim().length >= 2 && from.length <= 60 && to.length <= 60) out[from.trim()] = to;
    }
    return out;
  }

  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(state.preferences)); } catch { /* storage may be unavailable */ }
    applyPreferences();
  }

  function motionReduced() {
    if (state.preferences.motion === "reduced") return true;
    if (state.preferences.motion === "full") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function applyPreferences() {
    const prefs = state.preferences;
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const html = document.documentElement;
    html.dataset.theme = prefs.theme === "system" ? (prefersLight ? "light" : "dark") : prefs.theme;
    html.dataset.density = prefs.density;
    html.dataset.contrast = prefs.highContrast ? "high" : "normal";
    html.dataset.motion = prefs.motion === "device" ? "" : prefs.motion;
    html.dataset.spotlight = String(prefs.spotlight);
    html.dataset.oneThing = String(prefs.oneThing);
    html.lang = prefs.language === "zh" ? "zh-HK" : "en";
    html.style.setProperty("--text-scale", String(prefs.textScale / 100));
    if (html.dataset.theme === "dark") {
      html.style.setProperty("--accent", prefs.accent);
      html.style.setProperty("--accent-soft", hexToRgba(prefs.accent, .12));
      html.style.setProperty("--accent-glow", hexToRgba(prefs.accent, .35));
    } else {
      html.style.removeProperty("--accent");
      html.style.removeProperty("--accent-soft");
      html.style.removeProperty("--accent-glow");
    }
    document.title = prefs.productName;
    restartRefreshTimer();
  }

  function hexToRgba(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    return "rgba(" + ((value >> 16) & 255) + ", " + ((value >> 8) & 255) + ", " + (value & 255) + ", " + alpha + ")";
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
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  }

  function say(english, cantonese) {
    const language = state.preferences.language;
    const zh = cantonese || phrases[english];
    if (language === "zh" && zh) return zh;
    if (language === "both" && zh && zh !== english) return english + " · " + zh;
    return english;
  }

  function viewTitle(view) { return say(view.title, view.zh); }
  function viewDescription(view) {
    if (state.preferences.language === "zh") return view.zhDescription;
    if (state.preferences.language === "both") return view.description + " " + view.zhDescription;
    return view.description;
  }

  function formatDate(value) {
    if (!value) return "Not reported";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not reported" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--:--" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  }

  function formatBytes(value) {
    if (!Number.isFinite(Number(value))) return "Not reported";
    const bytes = Number(value);
    if (bytes < 1024) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes;
    let unit = -1;
    do { amount /= 1024; unit += 1; } while (amount >= 1024 && unit < units.length - 1);
    return amount.toFixed(amount < 10 ? 1 : 0) + " " + units[unit];
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds))) return "Not reported";
    const total = Math.max(0, Math.floor(Number(seconds)));
    return Math.floor(total / 86400) + "d " + Math.floor((total % 86400) / 3600) + "h " + Math.floor((total % 3600) / 60) + "m";
  }

  function secondsAgo(value) {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "unknown";
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 90) return seconds + " s";
    if (seconds < 5400) return Math.round(seconds / 60) + " min";
    return Math.round(seconds / 3600) + " h";
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
      body = contentType.includes("json") ? await response.json() : await response.text();
    }
    if (!response.ok) {
      const message = body && typeof body === "object" ? (body.detail || readableError(body.error) || body.title || "The request was not accepted.") : (typeof body === "string" && body ? body : "The request was not accepted.");
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function readableError(code) {
    const known = {
      "host-offline": "The computer is offline or has not reported recently.",
      "remote-agent-busy": "Three remote agent actions are already waiting. Let them finish first.",
      "unsupported-operation": "That action is not supported.",
      "confirmation-required": "Type the exact confirmation phrase.",
      "service-not-in-current-inventory": "That service is no longer in the latest inventory. Refresh and try again.",
      "process-not-in-current-inventory": "That process is no longer running. Refresh and try again."
    };
    return known[code] || code;
  }

  /* Notices: toasts, the notification centre, narration, sounds and cheer. */
  function readNotifications() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(notificationKey) || "[]");
      return Array.isArray(saved) ? saved.slice(0, 50) : [];
    } catch { return []; }
  }

  function storeNotifications() {
    try { sessionStorage.setItem(notificationKey, JSON.stringify(state.notifications.slice(0, 50))); } catch { /* optional */ }
  }

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(() => { announcer.textContent = message; }, 20);
  }

  const playfulLines = {
    success: ["Fetched and filed.", "Tail wagging: done.", "Sniffed out and sorted.", "On it, done, back on watch."],
    error: ["Ruff. That did not go to plan.", "The watchdog barked at this one.", "Not today, says the computer."]
  };
  const playfulLinesZh = { success: ["搞掂！", "收工，繼續睇住。", "做好咗，放心。"], error: ["哎呀，唔得喎。", "電腦話唔得。"] };

  function toast(title, detail, isError) {
    const prefs = state.preferences;
    let heading = title;
    if (prefs.emoji && !prefs.schoolMode) heading = (isError ? "🐾 " : "✨ ") + heading;
    let extra = "";
    const level = prefs.language === "zh" ? prefs.playfulCantonese : prefs.playfulEnglish;
    if (!prefs.schoolMode && level >= 3) {
      const pool = (prefs.language === "zh" ? playfulLinesZh : playfulLines)[isError ? "error" : "success"];
      extra = pool[Math.floor(Math.random() * pool.length)];
    }
    const item = document.createElement("div");
    item.className = "toast" + (isError ? " error" : "");
    item.setAttribute("role", isError ? "alert" : "status");
    item.innerHTML = "<strong>" + escapeHtml(heading) + "</strong><p>" + escapeHtml(detail || "") + (extra ? " " + escapeHtml(extra) : "") + "</p>";
    toastRegion.append(item);
    window.setTimeout(() => {
      item.classList.add("leaving");
      window.setTimeout(() => item.remove(), motionReduced() ? 0 : 320);
    }, 6500);
    state.notifications.unshift({ title, detail: detail || "", error: Boolean(isError), time: new Date().toISOString(), read: false });
    state.notifications = state.notifications.slice(0, 50);
    storeNotifications();
    updateBell();
    announce(title + (detail ? ". " + detail : ""));
    speak(title + (detail ? ". " + detail : ""));
    playSound(isError ? "error" : "ok");
  }

  function updateBell() {
    const unread = state.notifications.filter(item => !item.read).length;
    const badge = root.querySelector("[data-bell-count]");
    if (badge) {
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    }
    const bell = root.querySelector('[data-action="notifications"]');
    if (bell) bell.setAttribute("aria-label", say("Notifications") + ", " + unread + " unread");
  }

  function speak(text) {
    if (!state.preferences.narration || !("speechSynthesis" in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = speechSynthesis.getVoices().find(candidate => candidate.voiceURI === state.preferences.voice);
      if (voice) utterance.voice = voice;
      else if (state.preferences.language === "zh") utterance.lang = "zh-HK";
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch { /* narration is optional */ }
  }

  let audioContext = null;
  function playSound(kind) {
    if (!state.preferences.sounds) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      const notes = kind === "error" ? [330, 247] : [660, 988];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.16);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + index * 0.09);
        oscillator.stop(now + index * 0.09 + 0.18);
      });
    } catch { /* sounds are optional */ }
  }

  function cheer() {
    if (!state.preferences.cheer || motionReduced() || state.preferences.schoolMode) return;
    const colors = ["#3DE8FF", "#7CFFB2", "#7C5CFF", "#FFB23E"];
    const originX = window.innerWidth - 120;
    const originY = window.innerHeight - 80;
    for (let index = 0; index < 22; index += 1) {
      const piece = document.createElement("span");
      piece.className = "cheer";
      piece.style.left = originX + "px";
      piece.style.top = originY + "px";
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty("--dx", Math.round((Math.random() - 0.7) * 320) + "px");
      piece.style.setProperty("--dy", Math.round(-120 - Math.random() * 260) + "px");
      document.body.append(piece);
      window.setTimeout(() => piece.remove(), 1300);
    }
  }

  /* Searching */
  function searchFor(viewId) {
    if (!state.searches[viewId]) state.searches[viewId] = { query: "", mode: "text", pattern: "", flags: "gi", sample: "" };
    return state.searches[viewId];
  }

  function searchBar(viewId, placeholder, placement) {
    const search = searchFor(viewId);
    const id = "search-" + viewId + "-" + (placement || "page");
    return '<div class="search-group" role="search"><label class="sr-only" for="' + escapeHtml(id) + '">' + escapeHtml(say("Search") + " " + placeholder) + '</label>' +
      '<input id="' + escapeHtml(id) + '" data-role="search" data-placement="' + escapeHtml(placement || "page") + '" data-view="' + escapeHtml(viewId) + '" value="' + escapeHtml(search.query) + '" placeholder="' + escapeHtml(say("Search") + " " + placeholder) + '" autocomplete="off">' +
      '<button class="regex-toggle" type="button" data-action="regex-open" data-view="' + escapeHtml(viewId) + '" aria-pressed="' + (search.mode === "regex") + '" aria-label="Open regular expression builder" title="Regular expression builder">.*</button></div>';
  }

  function rowSearch(viewId, rows, selector) {
    const search = searchFor(viewId);
    const values = rows.map(selector);
    if (!search.query && search.mode !== "regex") return Promise.resolve(rows);
    if (search.mode === "text") {
      const query = search.query.trim().toLocaleLowerCase();
      return Promise.resolve(query ? rows.filter((_, index) => values[index].toLocaleLowerCase().includes(query)) : rows);
    }
    const expression = search.pattern || search.query;
    if (!expression) return Promise.resolve(rows);
    return boundedRegexMatches(values, expression, search.flags).then(indices => rows.filter((_, index) => indices.includes(index)));
  }

  function boundedRegexMatches(values, pattern, flags) {
    return new Promise((resolve, reject) => {
      if (!window.Worker || values.length > 5000 || pattern.length > 256) {
        reject(new Error("Regular expression search is unavailable for this data size."));
        return;
      }
      const worker = new Worker("/regex-worker.js");
      const timer = window.setTimeout(() => { worker.terminate(); reject(new Error("Regular expression search exceeded its time limit.")); }, 180);
      worker.onmessage = event => {
        clearTimeout(timer);
        worker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.indices);
      };
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error("Regular expression search could not run.")); };
      worker.postMessage({ values, pattern, flags });
    });
  }

  /* Shell */
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

  function brandMark() {
    return '<svg class="brand-mark" viewBox="0 0 34 34" aria-hidden="true"><defs><linearGradient id="brand-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3DE8FF"/><stop offset="1" stop-color="#7C5CFF"/></linearGradient></defs>' +
      '<path d="M17 2l13 7.5v15L17 32 4 24.5v-15z" fill="none" stroke="url(#brand-gradient)" stroke-width="2"/><path d="M10 20l3.5-7 3.5 5 3.5-5 3.5 7" stroke="#3DE8FF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function remoteTag() {
    const status = remoteStatus();
    if (!status) return '<span class="nav-tag idle">NEW</span>';
    if (status.remoteState === "running") return '<span class="nav-tag">LINKED</span>';
    if (status.signedIn) return '<span class="nav-tag">READY</span>';
    return '<span class="nav-tag idle">IDLE</span>';
  }

  function navigationHtml() {
    return groups.map(group => '<h2 class="sidebar-heading lab">' + escapeHtml(say(group.title, group.zh)) + '</h2>' +
      '<nav aria-label="' + escapeHtml(group.title) + '">' + views.filter(view => view.group === group.id).map(view =>
        '<button class="nav-item" type="button" data-view="' + view.id + '" aria-current="' + (state.activeView === view.id ? "page" : "false") + '">' +
        svg(view.icon) + '<span>' + escapeHtml(viewTitle(view)) + '</span>' + (view.id === "remote" ? remoteTag() : "") + '</button>').join("") + '</nav>').join("");
  }

  function hostTabsHtml() {
    const hosts = state.dashboard ? state.dashboard.hosts : [];
    if (!hosts.length) return '<span class="tab-empty">No connected computers</span>';
    return hosts.map(host => '<button class="host-tab" type="button" role="tab" data-host="' + escapeHtml(host.id) + '" aria-selected="' + (host.id === (selectedHost() || {}).id) + '">' +
      '<span class="live-dot' + (host.online ? "" : " off") + '" aria-hidden="true"></span>' + escapeHtml(hostName(host)) + '</button>').join("") +
      '<button class="host-tab" type="button" data-action="invitation-create" aria-label="Pair another computer" title="Pair another computer">+</button>';
  }

  function shell(content, steady) {
    const view = views.find(item => item.id === state.activeView) || views[0];
    const unread = state.notifications.filter(item => !item.read).length;
    const versionText = state.health && state.health.version ? "v" + state.health.version : "version unavailable";
    return '<div class="shell' + (steady ? " steady" : "") + (state.menuOpen ? " menu-open" : "") + '">' +
      '<header class="topbar">' +
      '<button class="icon-button menu-toggle" type="button" data-action="menu-toggle" aria-label="Show or hide the menu" aria-expanded="' + state.menuOpen + '">' + svg("menu") + '</button>' +
      '<div class="brand">' + brandMark() + '<div><div class="brand-name">' + escapeHtml(state.preferences.productName) + '</div><span class="brand-sub lab">' + escapeHtml(say("Command centre", "指揮中心")) + '</span></div></div>' +
      '<div class="host-tabs" role="tablist" aria-label="Connected computers">' + hostTabsHtml() + '</div>' +
      '<div class="omnibox">' + svg("search") + '<label class="sr-only" for="omnibox-input">' + escapeHtml(say("Search") + " " + viewTitle(view)) + '</label>' +
      '<input id="omnibox-input" data-role="search" data-placement="top" data-view="' + escapeHtml(view.id) + '" value="' + escapeHtml(searchFor(view.id).query) + '" placeholder="' + escapeHtml(say("Search") + " " + viewTitle(view)) + '" autocomplete="off">' +
      '<button class="regex-toggle" type="button" data-action="regex-open" data-view="' + escapeHtml(view.id) + '" aria-pressed="' + (searchFor(view.id).mode === "regex") + '" aria-label="Open regular expression builder" title="Regular expression builder">.*</button>' +
      '<button class="button small ghost" type="button" data-action="palette-open" title="Command palette">' + '<kbd>Ctrl Shift F</kbd></button></div>' +
      '<div class="clock" aria-hidden="true"><strong data-clock-time>--:--:--</strong><span data-clock-date></span></div>' +
      '<div class="top-actions">' +
      '<button class="icon-button" type="button" data-action="refresh" aria-label="' + escapeHtml(say("Refresh")) + '" title="' + escapeHtml(say("Refresh")) + '">' + svg("refresh") + '</button>' +
      '<button class="icon-button" type="button" data-action="notifications" aria-label="' + escapeHtml(say("Notifications")) + ', ' + unread + ' unread">' + svg("bell") + '<span class="badge-count" data-bell-count' + (unread ? "" : " hidden") + '>' + unread + '</span></button>' +
      '<button class="button" type="button" data-action="logout">' + escapeHtml(say("Sign out")) + '</button></div></header>' +
      '<aside class="sidebar">' + navigationHtml() + '<div class="sidebar-footer">' + escapeHtml(versionText.toUpperCase()) + '<br>' + escapeHtml(state.user ? state.user.username || "owner" : "") + ' · TYPED OPERATIONS ONLY</div></aside>' +
      '<main class="main" id="main-content" tabindex="-1">' + schoolTip() + content +
      '<p class="footer-note">Controller time ' + escapeHtml(formatDate(state.dashboard && state.dashboard.serverTime)) + ' · browser preferences stay on this device</p></main></div>';
  }

  function schoolTip() {
    if (!state.preferences.schoolMode || !tips[state.activeView]) return "";
    return '<div class="school-tip" role="note"><strong>Tip</strong><span>' + escapeHtml(tips[state.activeView]) + '</span></div>';
  }

  function pageHeading(viewId, label, actionHtml, titleOverride) {
    const view = views.find(item => item.id === viewId) || views[0];
    return '<header class="page-heading"><div><div class="lab">' + label + '</div><h1>' + escapeHtml(titleOverride || viewTitle(view)) + '</h1><p>' + escapeHtml(viewDescription(view)) + '</p></div>' +
      '<div class="actions">' + (actionHtml || "") + '</div></header>';
  }

  function hostLabel(host) {
    if (!host) return escapeHtml("No computer selected");
    return '<span class="live-dot' + (host.online ? "" : " off") + '" aria-hidden="true"></span> ' + escapeHtml(hostName(host)) + ' · ' + escapeHtml(host.online ? "check-in " + secondsAgo(host.lastSeenAt) + " ago" : "offline since " + formatDate(host.lastSeenAt));
  }

  function noHostCard() {
    return '<section class="panel empty-state" data-i="1"><h2>Connect your first computer</h2><p>Create a short-lived pairing code, run the Windows agent through your trusted setup process, then enroll it over HTTPS.</p>' +
      '<button class="button primary" type="button" data-action="invitation-create">' + escapeHtml(say("Pair a computer")) + '</button></section>';
  }

  /* Command centre */
  function recordTelemetry() {
    if (!state.dashboard) return;
    for (const host of state.dashboard.hosts) {
      const snapshot = host.snapshot;
      if (!snapshot || snapshot.cpuPercent == null) continue;
      const series = state.telemetry[host.id] || (state.telemetry[host.id] = []);
      const last = series[series.length - 1];
      if (last && last.at === snapshot.collectedAt) continue;
      series.push({ at: snapshot.collectedAt, cpu: clamp(Number(snapshot.cpuPercent), 0, 100) });
      if (series.length > 60) series.shift();
    }
  }

  function telemetryHtml(host, compact) {
    const series = state.telemetry[host.id] || [];
    if (series.length < 2) {
      return '<div class="telemetry"><div class="telemetry-empty">Collecting processor readings: ' + series.length + ' of 2 so far. The line appears after the next check-in.</div></div>';
    }
    const width = 1000;
    const height = compact ? 90 : 128;
    const step = width / (series.length - 1);
    const points = series.map((sample, index) => [index * step, height - 8 - (sample.cpu / 100) * (height - 16)]);
    let path = "M" + points[0][0].toFixed(1) + " " + points[0][1].toFixed(1);
    for (let index = 1; index < points.length; index += 1) {
      const [x0, y0] = points[index - 1];
      const [x1, y1] = points[index];
      const mid = (x0 + x1) / 2;
      path += " C" + mid.toFixed(1) + " " + y0.toFixed(1) + " " + mid.toFixed(1) + " " + y1.toFixed(1) + " " + x1.toFixed(1) + " " + y1.toFixed(1);
    }
    return '<div class="telemetry"><svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Processor use over the last ' + series.length + ' readings, latest ' + series[series.length - 1].cpu.toFixed(1) + ' percent">' +
      '<path class="area" d="' + path + ' L' + width + ' ' + height + ' L0 ' + height + ' Z"/><path class="line draw" d="' + path + '"/></svg></div>';
  }

  function gauge(label, percent, colorClass, note) {
    const value = percent == null ? null : clamp(Math.round(percent), 0, 100);
    return '<div class="gauge"><svg viewBox="0 0 100 100" role="img" aria-label="' + escapeHtml(label) + ' ' + (value == null ? "not reported" : value + " percent") + '">' +
      '<circle class="track" cx="50" cy="50" r="45"/><circle class="arc ' + colorClass + '" cx="50" cy="50" r="45" data-gauge="' + (value == null ? 0 : value) + '"/>' +
      '<text x="50" y="56" text-anchor="middle">' + (value == null ? "--" : value + "%") + '</text></svg>' +
      '<div><div class="lab">' + escapeHtml(label) + '</div><div class="metric-note">' + escapeHtml(note) + '</div></div></div>';
  }

  function hashPosition(id, index) {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const angle = (hash % 360) * Math.PI / 180;
    const radius = 30 + ((hash >> 8) % 60) + index * 3;
    return { x: 105 + Math.cos(angle) * Math.min(radius, 88), y: 105 + Math.sin(angle) * Math.min(radius, 88) };
  }

  function renderOverview() {
    const host = selectedHost();
    if (!host) {
      return pageHeading("overview", "No live link yet") + noHostCard() +
        '<section class="notice warning"><strong>No readings are available yet.</strong><p>The dashboard never invents system readings. Pair a computer to see live telemetry.</p></section>';
    }
    const snapshot = host.snapshot || {};
    const hosts = state.dashboard.hosts;
    const memoryPercent = snapshot.memoryTotalBytes > 0 ? snapshot.memoryUsedBytes / snapshot.memoryTotalBytes * 100 : null;
    const volumes = (snapshot.volumes || []).filter(volume => Number(volume.totalBytes) > 0);
    const fullest = volumes.map(volume => ({ volume, percent: (Number(volume.totalBytes) - Number(volume.freeBytes)) / Number(volume.totalBytes) * 100 })).sort((a, b) => b.percent - a.percent)[0];
    const events = snapshot.events || [];
    const warnings = events.filter(event => /warn|error|critical/i.test(event.level || "")).length;
    const status = remoteStatus(host.id);
    const blips = hosts.map((item, index) => {
      const point = hashPosition(item.id, index);
      return '<button class="blip' + (item.online ? "" : " off") + (item.id === host.id ? " selected" : "") + '" type="button" data-host="' + escapeHtml(item.id) + '" data-x="' + point.x.toFixed(0) + '" data-y="' + point.y.toFixed(0) + '" aria-label="' + escapeHtml(hostName(item) + (item.online ? ", online" : ", offline")) + '"></button>';
    }).join("");
    const recent = events.slice(0, 6).map(event => '<li><span class="mono">' + escapeHtml(formatTime(event.time)) + '</span><span class="level-' + escapeHtml(String(event.level || "").toLowerCase()) + '">' + escapeHtml(event.level) + ' · ' + escapeHtml(event.source) + '</span><span>' + escapeHtml(event.message) + '</span></li>').join("");
    const onlineCount = hosts.filter(item => item.online).length;
    return pageHeading("overview", hostLabel(host), '<button class="button" type="button" data-action="agent-refresh">' + escapeHtml(say("Request fresh inventory")) + '</button><button class="button primary" type="button" data-action="invitation-create">' + escapeHtml(say("Pair a computer")) + '</button>', hostName(host)) +
      (host.online ? "" : '<div class="notice warning"><strong>' + escapeHtml(hostName(host)) + ' is offline.</strong><p>Readings below are from ' + escapeHtml(formatDate(snapshot.collectedAt)) + '.</p></div>') +
      '<div class="bento">' +
      '<section class="panel span-4 radar-wrap" data-i="1" data-panel="radar"><div class="lab">' + escapeHtml(say("Host radar")) + '</div><div class="radar"><div class="radar-sweep"></div>' + blips + '</div><div class="mono hint">' + onlineCount + ' online · ' + (hosts.length - onlineCount) + ' offline</div></section>' +
      '<section class="panel span-8" data-i="2" data-panel="telemetry"><div class="panel-head"><span class="lab">' + escapeHtml(say("Telemetry")) + ' · ' + escapeHtml(say("Processor")) + '</span><span class="mono">' + (snapshot.cpuPercent == null ? "--" : Number(snapshot.cpuPercent).toFixed(1) + "%") + '</span></div>' + telemetryHtml(host) +
      '<div class="stat-row"><div><div class="lab">' + escapeHtml(say("Uptime")) + '</div><div class="stat-value">' + escapeHtml(formatDuration(snapshot.uptimeSeconds)) + '</div></div>' +
      '<div><div class="lab">' + escapeHtml(say("Warnings")) + '</div><div class="stat-value' + (warnings ? " warn" : "") + '">' + warnings + '</div></div>' +
      '<div><div class="lab">Agent</div><div class="stat-value">' + escapeHtml(host.agentVersion || "--") + '</div></div></div></section>' +
      '<section class="panel span-4" data-i="3">' + gauge(say("Memory"), memoryPercent, "violet", snapshot.memoryTotalBytes ? formatBytes(snapshot.memoryUsedBytes) + " of " + formatBytes(snapshot.memoryTotalBytes) : "Not reported") + '</section>' +
      '<section class="panel span-4" data-i="4">' + (fullest ? gauge("Storage " + fullest.volume.name, fullest.percent, fullest.percent >= 90 ? "danger" : fullest.percent >= 75 ? "warn" : "cyan", formatBytes(fullest.volume.freeBytes) + " free of " + formatBytes(fullest.volume.totalBytes)) : gauge("Storage", null, "cyan", "No volume readings")) + '</section>' +
      '<section class="panel span-4" data-i="5"><div class="panel-head"><span class="lab">' + escapeHtml(say("Slop Machine link")) + '</span><button class="link-button" type="button" data-view="remote">' + escapeHtml(say("Open")) + '</button></div>' +
      miniLink(status) + '<div class="toolbar">' + remoteChips(status) + '</div></section>' +
      '<section class="panel span-12" data-i="6"><div class="panel-head"><span class="lab">' + escapeHtml(say("Event stream")) + '</span><button class="link-button" type="button" data-view="events">All events</button></div>' +
      (recent ? '<ul class="activity">' + recent + '</ul>' : '<div class="empty-state">The latest inventory has no event records.</div>') + '</section>' +
      '<section class="panel span-12 alert" data-i="7"><div class="panel-head"><div><div class="lab">' + escapeHtml(say("Power")) + ' · guarded</div><p class="hint">A one-time challenge and the exact typed phrase arm each request.</p></div>' +
      '<div class="row-actions"><button class="button danger" type="button" data-action="power-prepare" data-kind="host.restart">' + escapeHtml(say("Restart computer")) + '</button><button class="button danger" type="button" data-action="power-prepare" data-kind="host.shutdown">' + escapeHtml(say("Shut down computer")) + '</button></div></div></section>' +
      '</div>';
  }

  function miniLink(status) {
    const signed = Boolean(status && status.signedIn);
    const running = Boolean(status && status.remoteState === "running");
    return '<div class="mini-link"><span>HOST</span><span class="link-wire' + (signed || running ? " on" : "") + '"></span><span>RELAY</span><span class="link-wire b' + (running ? " on" : "") + '"></span><span>PHONE</span></div>';
  }

  function remoteChips(status) {
    if (!status) return '<span class="chip">Status not checked yet</span>';
    if (!status.installed) return '<span class="chip warn">Tool not found</span>';
    return (status.signedIn ? '<span class="chip ok">Signed in</span>' : '<span class="chip warn">Not signed in</span>') +
      (status.remoteState === "running" ? '<span class="chip on">Remote running</span>' : '<span class="chip">Remote ' + escapeHtml(status.remoteState || "unknown") + '</span>');
  }

  /* Tables */
  async function simplePage(viewId, records, headers, cells, actions, label) {
    const rows = records || [];
    const matching = await rowSearch(viewId, rows, record => JSON.stringify(record));
    return pageHeading(viewId, label || hostLabel(selectedHost()), actions) +
      '<div class="toolbar">' + searchBar(viewId, (views.find(view => view.id === viewId) || {}).title || "records") +
      '<span class="search-results">' + matching.length + " of " + rows.length + '</span></div>' +
      (matching.length
        ? '<div class="table-wrap"><table><thead><tr>' + headers.map(header => '<th scope="col">' + escapeHtml(header) + '</th>').join("") + '</tr></thead><tbody>' +
          matching.map(record => '<tr tabindex="0" data-row="' + escapeHtml(JSON.stringify(record).slice(0, 4000)) + '">' + cells(record).map(cell => '<td>' + cell + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>'
        : '<div class="panel empty-state"><h2>Nothing to show</h2><p>' + (rows.length ? "No records match this search." : "The computer has not reported matching data in its latest inventory.") + '</p></div>');
  }

  async function renderHosts() {
    const hosts = state.dashboard.hosts;
    const matching = await rowSearch("hosts", hosts, host => [host.displayName, host.hostname, host.platform, host.agentVersion, host.online ? "online" : "offline"].join(" "));
    return pageHeading("hosts", hosts.length + " paired", '<button class="button primary" type="button" data-action="invitation-create">' + escapeHtml(say("Pair a computer")) + '</button>') +
      '<div class="toolbar">' + searchBar("hosts", "computers") + '<span class="search-results">' + matching.length + " of " + hosts.length + '</span></div>' +
      (matching.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Name</th><th scope="col">Platform</th><th scope="col">State</th><th scope="col">Last contact</th><th scope="col">Agent</th><th scope="col">Actions</th></tr></thead><tbody>' +
        matching.map(host => '<tr tabindex="0" data-row="' + escapeHtml(JSON.stringify({ name: hostName(host), hostname: host.hostname, platform: host.platform, online: host.online })) + '"><td><button class="link-button" type="button" data-host="' + escapeHtml(host.id) + '">' + escapeHtml(hostName(host)) + '</button><small>' + escapeHtml(host.hostname || "Name not reported") + '</small></td><td>' + escapeHtml(host.platform) + '</td><td>' +
          statusBadge(host.online ? "Online" : "Offline", host.online ? "online" : "warning") + '</td><td>' + escapeHtml(formatDate(host.lastSeenAt)) + '</td><td class="mono">' + escapeHtml(host.agentVersion) +
          '</td><td><button class="button small danger" type="button" data-action="host-revoke" data-id="' + escapeHtml(host.id) + '">Revoke</button></td></tr>').join("") + '</tbody></table></div>'
        : '<div class="panel empty-state"><h2>No computers match</h2><p>Change the search or pair a new computer.</p></div>');
  }

  function renderServices() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.services || [] : [];
    return simplePage("services", records, ["Service", "State", "Startup", "Actions"], service => [
      escapeHtml(service.displayName) + '<small>' + escapeHtml(service.id) + '</small>',
      /running/i.test(service.status) ? statusBadge(service.status, "online") : statusBadge(service.status, "neutral"),
      escapeHtml(service.startType),
      '<div class="row-actions"><button class="button small" type="button" data-action="host-operation" data-kind="service.start" data-target="' + escapeHtml(service.id) + '">Start</button>' +
      '<button class="button small" type="button" data-action="host-operation" data-kind="service.restart" data-target="' + escapeHtml(service.id) + '">Restart</button>' +
      '<button class="button small danger" type="button" data-action="host-operation" data-kind="service.stop" data-target="' + escapeHtml(service.id) + '">Stop</button></div>'
    ]);
  }

  function renderProcesses() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.processes || [] : [];
    return simplePage("processes", records, ["Process", "PID", "Memory", "Started", "Action"], process => [
      escapeHtml(process.name), '<span class="mono">' + escapeHtml(process.id) + '</span>', '<span class="mono">' + escapeHtml(formatBytes(process.workingSetBytes)) + '</span>', escapeHtml(formatDate(process.startedAt)),
      '<button class="button small danger" type="button" data-action="host-operation" data-kind="process.terminate" data-target="' + escapeHtml(process.identity) + '"' + (String(process.identity || "").endsWith(":unknown") ? " disabled" : "") + '>Terminate</button>'
    ]);
  }

  function renderEvents() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.events || [] : [];
    return simplePage("events", records, ["Time", "Level", "Channel", "Source", "Message"], event => [
      '<span class="mono">' + escapeHtml(formatDate(event.time)) + '</span>', '<span class="level-' + escapeHtml(String(event.level || "").toLowerCase()) + '">' + escapeHtml(event.level) + '</span>',
      escapeHtml(event.channel), escapeHtml(event.source), escapeHtml(event.message)
    ]);
  }

  function renderStorage() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.volumes || [] : [];
    return simplePage("storage", records, ["Volume", "Label", "File system", "Total", "Free", "Used"], volume => {
      const used = Math.max(0, Number(volume.totalBytes) - Number(volume.freeBytes));
      const percent = Number(volume.totalBytes) > 0 ? Math.round(used / Number(volume.totalBytes) * 100) : 0;
      return [escapeHtml(volume.name), escapeHtml(volume.label), escapeHtml(volume.fileSystem), '<span class="mono">' + escapeHtml(formatBytes(volume.totalBytes)) + '</span>', '<span class="mono">' + escapeHtml(formatBytes(volume.freeBytes)) + '</span>',
        '<div class="bar' + (percent >= 85 ? " warn" : "") + '" role="progressbar" aria-valuenow="' + percent + '" aria-valuemin="0" aria-valuemax="100" aria-label="Used capacity"><span data-width="' + percent + '"></span></div><small>' + percent + '% used</small>'];
    });
  }

  function renderNetwork() {
    const host = selectedHost();
    const records = host && host.snapshot ? host.snapshot.networks || [] : [];
    return simplePage("network", records, ["Adapter", "Description", "State", "Addresses"], network => [
      escapeHtml(network.name), escapeHtml(network.description), /up/i.test(network.status) ? statusBadge(network.status, "online") : statusBadge(network.status, "neutral"),
      '<span class="mono">' + escapeHtml((network.addresses || []).join(", ") || "No address") + '</span>'
    ], host ? '<button class="button" type="button" data-action="network-flush">Flush DNS cache</button>' : "");
  }

  function renderUpdates() {
    const host = selectedHost();
    const update = host && host.snapshot ? host.snapshot.updates : null;
    if (!update) return pageHeading("updates", hostLabel(host)) + '<section class="panel empty-state"><h2>Update status is not available</h2><p>The agent has not returned an update summary.</p></section>';
    const pending = update.pending || [];
    return pageHeading("updates", hostLabel(host)) + '<div class="two"><section class="panel" data-i="1"><div class="panel-head"><h2>Windows Update</h2>' + statusBadge(update.status, pending.length ? "warning" : "online") + '</div>' +
      '<dl class="kv-list"><dt>Last checked</dt><dd>' + escapeHtml(formatDate(update.lastCheckedAt)) + '</dd><dt>Pending items</dt><dd class="mono">' + pending.length + '</dd></dl></section>' +
      '<section class="panel" data-i="2"><h2>Pending</h2>' + (pending.length ? '<ul>' + pending.map(item => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>' : '<p class="hint">No pending update names were reported.</p>') + '<p class="hint">This view is read-only. Install updates during the computer\'s maintenance time.</p></section></div>';
  }

  function renderFirewall() {
    const host = selectedHost();
    const firewall = host && host.snapshot ? host.snapshot.firewall : null;
    if (!firewall) return pageHeading("firewall", hostLabel(host)) + '<section class="panel empty-state"><h2>Firewall status is not available</h2><p>The agent has not returned profile data.</p></section>';
    const profile = (name, value) => '<section class="panel span-4" data-i="1"><div class="lab">' + escapeHtml(name) + '</div><div class="metric-value">' + escapeHtml(value) + '</div>' + statusBadge(/on|enabled|true/i.test(value) ? "Protected" : "Check this profile", /on|enabled|true/i.test(value) ? "online" : "warning") + '</section>';
    return pageHeading("firewall", hostLabel(host)) + '<div class="bento">' + profile("Domain", firewall.domain) + profile("Private", firewall.private) + profile("Public", firewall.public) + '</div>' +
      '<p class="hint">Profile state is read-only here. Manage firewall rules on the computer until a reviewed typed policy workflow exists.</p>';
  }

  function renderOperations() {
    const records = state.dashboard.operations || [];
    return simplePage("operations", records, ["Requested", "Computer", "Action", "Status", "Result", "By"], operation => {
      const host = state.dashboard.hosts.find(item => item.id === operation.hostId);
      const kind = operation.status === "succeeded" ? "online" : operation.status === "failed" ? "danger" : "neutral";
      return ['<span class="mono">' + escapeHtml(formatDate(operation.createdAt)) + '</span>', escapeHtml(host ? hostName(host) : operation.hostId), '<code>' + escapeHtml(operation.kind) + '</code>', statusBadge(operation.status, kind), escapeHtml(summarizeResult(operation)), escapeHtml(operation.requestedBy)];
    }, '<button class="button" type="button" data-action="export-operations">Export CSV</button><button class="button" type="button" data-action="agent-refresh">' + escapeHtml(say("Request fresh inventory")) + '</button>', (state.dashboard.operations || []).length + " recent actions");
  }

  function renderAudit() {
    const records = state.dashboard.audit || [];
    return simplePage("audit", records, ["Time", "Actor", "Action", "Target", "Outcome", "Details"], entry => [
      '<span class="mono">' + escapeHtml(formatDate(entry.time)) + '</span>', escapeHtml(entry.actor), '<code>' + escapeHtml(entry.action) + '</code>', escapeHtml(entry.target), escapeHtml(entry.outcome), escapeHtml(entry.detail || "")
    ], '<button class="button" type="button" data-action="audit-export" data-format="json">Export JSON</button><button class="button" type="button" data-action="audit-export" data-format="csv">Export CSV</button>', records.length + " records kept on the controller");
  }

  function summarizeResult(operation) {
    if (!operation.result) return operation.status === "queued" ? "Waiting for the computer" : operation.status === "running" ? "In progress" : "";
    if (!operation.kind.startsWith("codex.")) return operation.result;
    try {
      const value = JSON.parse(operation.result);
      if (value.detail) return value.detail;
      if (value.kind === "status") return value.installed ? "Tool " + (value.version || "found") + (value.signedIn ? ", signed in" : ", not signed in") : "Tool not found";
      if (value.kind === "login") return "Sign-in " + (value.state || "updated");
      if (value.kind === "pair") return "Pairing code created";
      if (value.kind === "remote") return "Remote control " + (value.state || "updated");
      if (value.kind === "logout") return "Signed out";
      return value.state || "Done";
    } catch {
      return operation.result;
    }
  }

  /* Slop Machine remote */
  function remoteStatus(hostId) {
    const id = hostId || (selectedHost() || {}).id;
    if (!id || state.remote.hostId !== id || !state.remote.data) return null;
    return state.remote.data.status || null;
  }

  function remoteSecret(kind) {
    const data = state.remote.data;
    if (!data || !Array.isArray(data.secrets)) return null;
    const secret = data.secrets.find(item => item.kind === kind);
    if (!secret || new Date(secret.expiresAt).getTime() <= Date.now()) return null;
    return secret;
  }

  function trustedUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && trustedSignInHosts.some(host => url.hostname === host || url.hostname.endsWith("." + host)) ? url.href : null;
    } catch { return null; }
  }

  async function loadRemote(force) {
    const host = selectedHost();
    if (!host) return;
    if (state.remote.hostId !== host.id) state.remote = { hostId: host.id, data: null, error: "", fastUntil: 0, timer: state.remote.timer };
    try {
      state.remote.data = await request("/api/hosts/" + encodeURIComponent(host.id) + "/codex");
      state.remote.error = "";
    } catch (error) {
      if (error.status === 401) return handleExpiredSession();
      state.remote.error = error.message;
    }
    if (force) await render();
  }

  function scheduleRemotePolling() {
    if (state.remote.timer) clearTimeout(state.remote.timer);
    state.remote.timer = null;
    if (!state.user) return;
    const waiting = Boolean(remoteSecret("login")) || Date.now() < state.remote.fastUntil ||
      (state.remote.data && (state.remote.data.operations || []).some(operation => operation.status === "queued" || operation.status === "running"));
    const onRemote = state.activeView === "remote" || state.activeView === "overview";
    if (!onRemote) return;
    state.remote.timer = setTimeout(async () => {
      const before = JSON.stringify(state.remote.data);
      const signedBefore = Boolean(remoteStatus() && remoteStatus().signedIn);
      await loadRemote(false);
      if (JSON.stringify(state.remote.data) !== before) {
        await refreshDashboard(false, true);
        const signedAfter = Boolean(remoteStatus() && remoteStatus().signedIn);
        if (!signedBefore && signedAfter) { toast("Signed in", "The command-line tool is signed in on this computer."); cheer(); }
      } else {
        scheduleRemotePolling();
      }
    }, waiting ? 2500 : 15000);
  }

  function renderRemote() {
    const host = selectedHost();
    if (!host) return pageHeading("remote", "No computer selected") + noHostCard();
    const data = state.remote.hostId === host.id ? state.remote.data : null;
    const status = data ? data.status : null;
    const login = remoteSecret("login");
    const pair = remoteSecret("pair");
    const operations = data ? data.operations || [] : [];
    const busy = operations.some(operation => operation.status === "queued" || operation.status === "running");
    const installed = Boolean(status && status.installed);
    const signedIn = Boolean(status && status.signedIn);
    const running = Boolean(status && status.remoteState === "running") || Boolean(pair);
    const loginWaiting = Boolean(login);
    const step = (done, now, label, detail) => '<li class="' + (done ? "done" : now ? "now" : "") + '"><div class="lab">' + escapeHtml(label) + '</div><div>' + escapeHtml(detail) + '</div></li>';
    const lastFailure = operations.find(operation => operation.status === "failed");
    const signInUrl = login && login.values.verificationUrl ? trustedUrl(login.values.verificationUrl) : null;
    const loginPanel = '<section class="panel" data-i="2" aria-labelledby="sign-in-heading"><div class="panel-head"><h2 id="sign-in-heading">' + escapeHtml(say("Sign-in assist")) + '</h2>' +
      (login ? countdown(login) : signedIn ? '<span class="chip ok">Signed in</span>' : '<span class="chip">Not started</span>') + '</div>' +
      (login
        ? '<p class="hint">On any device, open the sign-in page and enter this code. The computer keeps waiting until you finish or the code expires.</p>' +
          '<div class="url-box">' + escapeHtml(login.values.verificationUrl || "Sign-in address not reported") + '</div><div class="one-time-code" aria-label="One-time sign-in code">' + escapeHtml(login.values.userCode || "") + '</div>' +
          '<div class="row-actions">' + (signInUrl ? '<a class="button primary" href="' + escapeHtml(signInUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(say("Open sign-in page")) + '</a>' : "") +
          '<button class="button" type="button" data-action="copy-text" data-copy="' + escapeHtml(login.values.userCode || "") + '">' + escapeHtml(say("Copy code")) + '</button>' +
          '<button class="button" type="button" data-action="remote-op" data-kind="codex.login.cancel">' + escapeHtml(say("Cancel")) + '</button></div>'
        : '<p class="hint">' + (signedIn ? escapeHtml(status.signInDetail || "The tool is signed in.") : "Starts device-code sign-in on the computer and shows the code here, so you can finish in any browser.") + '</p>' +
          '<div class="one-time-code empty" aria-hidden="true">— — — —</div><div class="row-actions"><button class="button' + (signedIn ? "" : " primary") + '" type="button" data-action="remote-op" data-kind="codex.login.start"' + (!installed || busy ? " disabled" : "") + '>' + escapeHtml(signedIn ? "Sign in again" : say("Start sign-in")) + '</button></div>') +
      '<p class="hint">Device-code sign-in must be allowed for the account. Workspace accounts may need an administrator to turn it on.</p></section>';
    const remotePanel = '<section class="panel" data-i="3" aria-labelledby="remote-heading"><div class="panel-head"><h2 id="remote-heading">' + escapeHtml(say("Remote control")) + '</h2>' + (running ? '<span class="chip on"><span class="live-dot"></span>Running</span>' : '<span class="chip">' + escapeHtml(status ? status.remoteState || "unknown" : "unknown") + '</span>') + '</div>' +
      '<p class="hint">Keeps an outbound, encrypted relay connection so a paired phone can follow and steer sessions on this computer.</p>' +
      '<div class="row-actions" data-align="start"><button class="button primary" type="button" data-action="remote-op" data-kind="codex.remote.start"' + (!installed || busy || (status && status.remoteControl === false) ? " disabled" : "") + '>' + escapeHtml(say("Start remote control")) + '</button>' +
      '<button class="button" type="button" data-action="remote-op" data-kind="codex.remote.stop"' + (!installed || busy ? " disabled" : "") + '>' + escapeHtml(say("Stop")) + '</button></div>' +
      '<h3>' + escapeHtml(say("Pair a phone")) + '</h3><ol class="hint"><li>In the ChatGPT phone app, open Remote.</li><li>Choose Enter code manually.</li><li>Type the pairing code and confirm the account on the phone.</li></ol>' +
      (pair ? '<div class="panel-head"><span class="lab">Pairing code</span>' + countdown(pair) + '</div><div class="one-time-code" aria-label="Phone pairing code">' + escapeHtml(pair.values.manualPairingCode || pair.values.pairingCode || "") + '</div>' +
        '<div class="row-actions"><button class="button" type="button" data-action="copy-text" data-copy="' + escapeHtml(pair.values.manualPairingCode || pair.values.pairingCode || "") + '">Copy pairing code</button></div>'
        : '<div class="one-time-code empty" aria-hidden="true">— — — —</div>') +
      '<div class="row-actions"><button class="button" type="button" data-action="remote-op" data-kind="codex.remote.pair"' + (!installed || busy || (status && status.pairing === false) ? " disabled" : "") + '>' + escapeHtml(say("Create pairing code")) + '</button></div></section>';
    const activity = operations.slice(0, 8).map(operation => '<li><span class="mono">' + escapeHtml(formatTime(operation.createdAt)) + '</span><span>' + escapeHtml(remoteKindLabel(operation.kind)) + ' · ' + escapeHtml(operation.status) + '</span><span>' + escapeHtml(summarizeResult(operation)) + '</span></li>').join("");
    return pageHeading("remote", hostLabel(host), '<button class="button" type="button" data-action="remote-op" data-kind="codex.status"' + (busy ? " disabled" : "") + '>' + escapeHtml(say("Run status check")) + '</button>', say("Slop Machine link")) +
      (state.remote.error ? '<div class="notice danger"><strong>Remote status could not load.</strong><p>' + escapeHtml(state.remote.error) + '</p></div>' : "") +
      (lastFailure && operations[0] === lastFailure ? '<div class="notice danger"><strong>' + escapeHtml(remoteKindLabel(lastFailure.kind)) + ' failed.</strong><p>' + escapeHtml(lastFailure.result || "The computer did not report a reason.") + '</p></div>' : "") +
      (status && status.enabled === false ? '<div class="notice warning"><strong>Remote agent integration is off on this computer.</strong><p>' + escapeHtml(status.detail || "") + '</p></div>' : "") +
      (status && status.installed === false && status.enabled !== false ? '<div class="notice warning"><strong>The codex tool was not found.</strong><p>' + escapeHtml(status.detail || "Install it on the computer, then run a status check.") + '</p></div>' : "") +
      '<section class="panel" data-i="1"><div class="lab">Link topology</div><div class="link-topology" role="img" aria-label="' + escapeHtml("This computer " + (signedIn ? "signed in" : "not signed in") + ", relay " + (running ? "connected" : "idle") + ", phone " + (pair ? "pairing code ready" : "not paired")) + '">' +
      '<div class="link-node' + (installed ? " on" : "") + '">' + svg("computer") + 'THIS PC</div><div class="link-wire' + (signedIn || running ? " on" : "") + '"></div>' +
      '<div class="link-node relay' + (running ? " on" : "") + '">' + svg("relay") + 'RELAY</div><div class="link-wire b' + (running && pair ? " on" : "") + '"></div>' +
      '<div class="link-node phone' + (pair ? " on" : "") + '">' + svg("phone") + 'PHONE</div></div>' +
      '<ol class="steps" aria-label="Remote setup progress">' +
      step(installed, !status, "01 · Tool", status ? (installed ? "codex " + (status.version || "") : "Not found") : "Run a status check") +
      step(signedIn, installed && !signedIn, "02 · Sign in", signedIn ? "Signed in" : loginWaiting ? "Waiting for browser" : "Not signed in") +
      step(running, signedIn && !running, "03 · Remote", running ? "Running" : "Stopped") +
      step(false, running, "04 · Phone", pair ? "Code ready" : "Not paired") + '</ol>' +
      (data && data.statusUpdatedAt ? '<p class="hint">Status checked ' + escapeHtml(formatDate(data.statusUpdatedAt)) + (status && status.runAs ? ' · runs as ' + escapeHtml(status.runAs === "interactive-user" ? "the signed-in Windows user" : "the agent service account") : "") + '</p>' : '<p class="hint">Status has not been checked on this computer yet.</p>') + '</section>' +
      '<div class="two">' + loginPanel + remotePanel + '</div>' +
      '<section class="panel" data-i="4"><div class="panel-head"><h2>' + escapeHtml(say("Activity")) + '</h2><span class="lab">Codes redacted</span></div>' + (activity ? '<ul class="activity">' + activity + '</ul>' : '<p class="hint">No remote agent actions yet.</p>') + '</section>' +
      '<section class="panel alert" data-i="5"><div class="panel-head"><div><h2>Sign out of the tool</h2><p class="hint">Removes the saved sign-in on this computer after you type the exact phrase.</p></div>' +
      '<button class="button danger" type="button" data-action="remote-op" data-kind="codex.logout"' + (!installed || busy ? " disabled" : "") + '>Sign out</button></div></section>';
  }

  function remoteKindLabel(kind) {
    return ({ "codex.status": "Status check", "codex.login.start": "Sign-in", "codex.login.cancel": "Cancel sign-in", "codex.logout": "Sign out", "codex.remote.start": "Start remote", "codex.remote.stop": "Stop remote", "codex.remote.pair": "Pairing code" })[kind] || kind;
  }

  function countdown(secret) {
    const total = Math.max(1, new Date(secret.expiresAt).getTime() - new Date(secret.createdAt).getTime());
    return '<svg class="countdown" viewBox="0 0 100 100" data-countdown data-expires="' + escapeHtml(secret.expiresAt) + '" data-total="' + total + '" role="timer" aria-label="Code expiry"><circle class="track" cx="50" cy="50" r="45"/><circle class="arc" cx="50" cy="50" r="45"/><text x="50" y="57" text-anchor="middle">--</text></svg>';
  }

  function tickCountdowns() {
    for (const element of root.querySelectorAll("[data-countdown]")) {
      const remaining = Math.max(0, new Date(element.dataset.expires).getTime() - Date.now());
      const total = Number(element.dataset.total) || 1;
      const arc = element.querySelector(".arc");
      const text = element.querySelector("text");
      arc.style.strokeDashoffset = String(283 * (1 - remaining / total));
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      text.textContent = minutes > 0 ? minutes + "m" : seconds + "s";
      element.setAttribute("aria-label", "Expires in " + minutes + " minutes " + seconds + " seconds");
      if (remaining === 0 && !element.dataset.expired) {
        element.dataset.expired = "true";
        void render();
      }
    }
    const time = root.querySelector("[data-clock-time]");
    if (time) {
      const now = new Date();
      time.textContent = formatTime(now);
      const date = root.querySelector("[data-clock-date]");
      if (date) date.textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(now).toUpperCase();
    }
  }

  async function remoteOperation(kind) {
    state.remote.fastUntil = Date.now() + 120000;
    await requestHostOperation(kind, null, true);
    await loadRemote(true);
    scheduleRemotePolling();
  }

  /* Settings */
  function settingSwitch(key, label, hint) {
    return '<div class="setting" data-setting-text="' + escapeHtml(label + " " + hint) + '"><div class="setting-text"><label for="pref-' + key + '">' + escapeHtml(label) + '</label><span class="hint">' + escapeHtml(hint) + '</span></div>' +
      '<span class="switch"><input id="pref-' + key + '" type="checkbox" data-pref="' + key + '"' + (state.preferences[key] ? " checked" : "") + '><span aria-hidden="true"></span></span></div>';
  }

  function settingSegment(key, label, hint, options) {
    return '<div class="setting stack" data-setting-text="' + escapeHtml(label + " " + hint) + '"><div class="setting-text"><span id="label-' + key + '">' + escapeHtml(label) + '</span><span class="hint">' + escapeHtml(hint) + '</span></div>' +
      '<div class="segmented" role="radiogroup" aria-labelledby="label-' + key + '">' + options.map(([value, text]) =>
        '<button type="button" role="radio" data-pref-value="' + escapeHtml(value) + '" data-pref-key="' + key + '" aria-checked="' + (String(state.preferences[key]) === String(value)) + '">' + escapeHtml(text) + '</button>').join("") + '</div></div>';
  }

  function settingRange(key, label, hint, minimum, maximum, step, suffix) {
    return '<div class="setting stack" data-setting-text="' + escapeHtml(label + " " + hint) + '"><div class="range-head"><label for="pref-' + key + '">' + escapeHtml(label) + '</label><output for="pref-' + key + '" data-output="' + key + '">' + escapeHtml(state.preferences[key] + suffix) + '</output></div>' +
      '<input id="pref-' + key + '" type="range" min="' + minimum + '" max="' + maximum + '" step="' + step + '" value="' + escapeHtml(state.preferences[key]) + '" data-pref="' + key + '" data-suffix="' + escapeHtml(suffix) + '"><span class="hint">' + escapeHtml(hint) + '</span></div>';
  }

  function renderSettings() {
    const prefs = state.preferences;
    const accents = [["cyan", "#3DE8FF", "Signal cyan"], ["violet", "#7C5CFF", "Violet"], ["jade", "#7CFFB2", "Jade"], ["amber", "#FFB23E", "Amber"], ["rose", "#FF4D6A", "Rose"]];
    const voices = state.voices.map(voice => '<option value="' + escapeHtml(voice.voiceURI) + '"' + (voice.voiceURI === prefs.voice ? " selected" : "") + '>' + escapeHtml(voice.name + " (" + voice.lang + ")") + '</option>').join("");
    const vocabularyCount = Object.keys(prefs.vocabulary).length;
    return pageHeading("settings", "This browser only", '<button class="button" type="button" data-action="settings-export">Export</button><button class="button" type="button" data-action="settings-import">Import</button><button class="button danger" type="button" data-action="preferences-reset">Reset all</button>') +
      '<div class="toolbar">' + searchBar("settings", "settings") + '<span class="search-results" data-settings-count></span></div>' +
      '<div class="settings-grid">' +
      '<section class="panel" data-i="1"><h2>Language and voice</h2>' +
      settingSegment("language", "Interface language", "Navigation, headings and main buttons follow this choice.", [["en", "English"], ["zh", "廣東話"], ["both", "Both"]]) +
      settingRange("playfulEnglish", "English playfulness", "From 3 up, notices add a light line. School mode turns this off.", 0, 5, 1, " of 5") +
      settingRange("playfulCantonese", "Cantonese playfulness", "Same as above, for Cantonese notices.", 0, 5, 1, " of 5") +
      settingSwitch("emoji", "Emoji in notices", "Adds a small emoji to notice titles.") +
      '<div class="setting stack" data-setting-text="Product name rename"><label class="field"><span>Product name shown here</span><input class="text-input" data-pref="productName" value="' + escapeHtml(prefs.productName) + '" maxlength="40" minlength="2"></label></div>' +
      '<div class="setting stack" data-setting-text="Personal vocabulary JSON words"><div class="drop-zone" data-drop="vocabulary"><strong>Personal vocabulary</strong><span class="hint">Drop a JSON word list here or choose a file. Use {"from word": "to word"} or {"terms": [{"from": "…", "to": "…"}]}. It stays in this browser and only changes words shown on screen.</span>' +
      '<div class="row-actions" data-align="start"><button class="button small" type="button" data-action="vocabulary-choose">Choose JSON file</button>' + (vocabularyCount ? '<button class="button small" type="button" data-action="vocabulary-clear">Remove ' + vocabularyCount + ' words</button>' : "") + '</div>' +
      '<span class="hint" role="status">' + (vocabularyCount ? vocabularyCount + " words active." : "No words loaded.") + '</span></div></div></section>' +
      '<section class="panel" data-i="2"><h2>Appearance</h2>' +
      settingSegment("theme", "Theme", "Command centre is dark. Daylight is a bright theme for sunny rooms.", [["system", "Match device"], ["dark", "Command centre"], ["light", "Daylight"]]) +
      '<div class="setting stack" data-setting-text="Accent colour picker"><div class="setting-text"><span>Accent colour</span><span class="hint">Used for the active state, focus ring and primary buttons in the command centre theme.</span></div><div class="swatches">' +
      accents.map(([name, value, label]) => '<button class="swatch ' + name + '" type="button" data-action="accent" data-value="' + value + '" aria-label="' + escapeHtml(label) + '" aria-pressed="' + (prefs.accent.toUpperCase() === value) + '"></button>').join("") +
      '<label class="color-input"><span class="mono">' + escapeHtml(prefs.accent.toUpperCase()) + '</span><input type="color" data-pref="accent" value="' + escapeHtml(prefs.accent) + '" aria-label="Any accent colour"></label></div></div>' +
      settingRange("textScale", "Text size", "Scales every text and control size.", 85, 150, 5, "%") +
      settingSegment("density", "Table spacing", "Compact fits more rows on screen.", [["comfortable", "Comfortable"], ["compact", "Compact"]]) +
      settingSwitch("highContrast", "High contrast", "Stronger borders and text.") +
      settingSegment("motion", "Motion", "Match device follows your system's reduce-motion setting.", [["device", "Match device"], ["full", "Full"], ["reduced", "Reduced"]]) + '</section>' +
      '<section class="panel" data-i="3"><h2>Focus and reading</h2>' +
      settingSwitch("schoolMode", "School mode", "Plain words, a short tip on every page, and no jokes or celebrations.") +
      settingSwitch("spotlight", "Focus spotlight", "Dims every panel except the one under your pointer or focus.") +
      settingSwitch("oneThing", "One thing at a time", "Hides the side menu until you open it from the top bar.") +
      settingSwitch("cheer", "Progress cheer", "A small celebration when a queued action finishes.") + '</section>' +
      '<section class="panel" data-i="4"><h2>Sound and narration</h2>' +
      settingSwitch("narration", "Read notices aloud", "Uses your browser's built-in voices.") +
      '<div class="setting stack" data-setting-text="Voice narrator picker"><label class="field"><span>Voice</span><select data-pref="voice"><option value="">Browser default</option>' + voices + '</select></label>' + (state.voices.length ? "" : '<span class="hint">No voices were reported by this browser yet.</span>') + '<div class="row-actions" data-align="start"><button class="button small" type="button" data-action="voice-test">Test voice</button></div></div>' +
      settingSwitch("sounds", "Action sounds", "A short tone when an action succeeds or fails.") +
      '<h3>Data and refresh</h3>' +
      settingSwitch("autoRefresh", "Refresh automatically", "Requests the latest controller state at a fixed interval.") +
      settingSegment("refreshSeconds", "Refresh interval", "How often this browser asks the controller for updates.", [["10", "10 s"], ["15", "15 s"], ["30", "30 s"], ["60", "60 s"]]) +
      settingSwitch("hideHostNames", "Hide computer names", "Masks names in this browser, useful when sharing your screen.") + '</section>' +
      '<section class="panel" data-i="5"><h2>Operational boundaries</h2><ul class="hint"><li>Only fixed operation identifiers are accepted by the controller.</li><li>Restart, shutdown, stopping a service, ending a process and signing out of the remote tool need an exact typed phrase.</li>' +
      '<li>One-time sign-in and pairing codes are kept in controller memory until they expire and never written to disk or the audit log.</li><li>The browser uses a same-origin, HTTP-only session cookie and stores no bearer token.</li></ul></section>' +
      '</div>';
  }

  /* Rendering */
  let renderSequence = 0;
  async function render() {
    applyPreferences();
    if (!state.user) {
      root.innerHTML = state.setupRequired ? renderSetup() : renderLogin();
      hydrate(false);
      return;
    }
    const sequence = ++renderSequence;
    const steady = state.lastRenderedView === state.activeView + ":" + (selectedHost() || {}).id;
    let content;
    try {
      content = await contentForActiveView();
    } catch (error) {
      content = pageHeading(state.activeView, "Could not load") + '<section class="notice danger"><strong>This view could not load.</strong><p>' + escapeHtml(error.message) + '</p><button class="button" type="button" data-action="refresh">Try again</button></section>';
    }
    if (sequence !== renderSequence) return;
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.role === "search" ? '[data-role="search"][data-placement="' + active.dataset.placement + '"]' : active.id ? "#" + CSS.escape(active.id) : null : null;
    const selection = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    const scroll = window.scrollY;
    root.innerHTML = shell(content, steady);
    state.lastRenderedView = state.activeView + ":" + (selectedHost() || {}).id;
    hydrate(steady);
    if (steady) window.scrollTo(0, scroll);
    if (focusKey && root.contains(active) === false) {
      const next = root.querySelector(focusKey);
      if (next) {
        next.focus({ preventScroll: true });
        if (selection != null && typeof next.setSelectionRange === "function") next.setSelectionRange(selection, selection);
      }
    }
    if (state.activeView === "settings") filterSettings();
    scheduleRemotePolling();
  }

  async function contentForActiveView() {
    switch (state.activeView) {
      case "overview": return renderOverview();
      case "hosts": return renderHosts();
      case "services": return renderServices();
      case "processes": return renderProcesses();
      case "events": return renderEvents();
      case "storage": return renderStorage();
      case "network": return renderNetwork();
      case "updates": return renderUpdates();
      case "firewall": return renderFirewall();
      case "remote": return renderRemote();
      case "operations": return renderOperations();
      case "audit": return renderAudit();
      case "settings": return renderSettings();
      default: return renderOverview();
    }
  }

  function hydrate(steady) {
    for (const panel of root.querySelectorAll("[data-i]")) panel.style.setProperty("--i", panel.dataset.i);
    if (steady) {
      for (const element of root.querySelectorAll(".panel, .table-wrap, .notice, .activity li, .telemetry .draw, .login-card")) element.style.animation = "none";
    }
    for (const bar of root.querySelectorAll("[data-width]")) {
      const width = clamp(Number(bar.dataset.width) || 0, 0, 100) + "%";
      if (steady || motionReduced()) { bar.style.transition = "none"; bar.style.width = width; }
      else requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = width; }));
    }
    for (const arc of root.querySelectorAll("[data-gauge]")) {
      const offset = String(283 * (1 - clamp(Number(arc.dataset.gauge) || 0, 0, 100) / 100));
      if (steady || motionReduced()) { arc.style.transition = "none"; arc.style.strokeDashoffset = offset; }
      else requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = offset; }));
    }
    for (const blip of root.querySelectorAll(".blip")) {
      blip.style.left = blip.dataset.x + "px";
      blip.style.top = blip.dataset.y + "px";
    }
    const topbar = root.querySelector(".topbar");
    if (topbar) document.documentElement.style.setProperty("--topbar-h", topbar.offsetHeight + "px");
    tickCountdowns();
    applyVocabulary(root);
  }

  function applyVocabulary(scope) {
    const entries = Object.entries(state.preferences.vocabulary);
    if (!entries.length) return;
    const pattern = new RegExp("\\b(" + entries.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|") + ")\\b", "gi");
    const lookup = new Map(entries.map(([from, to]) => [from.toLocaleLowerCase(), to]));
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement && node.parentElement.closest("input, textarea, code, .mono, .one-time-code, .url-box, [data-row] td small") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const replaced = node.nodeValue.replace(pattern, match => lookup.get(match.toLocaleLowerCase()) ?? match);
      if (replaced !== node.nodeValue) node.nodeValue = replaced;
    }
  }

  function renderSetup() {
    const step = state.setup.step;
    const labels = ["Owner account", "Security review", "Create owner"];
    const progress = labels.map((label, index) => '<li class="' + (index <= step ? "current" : "") + '" aria-current="' + (index === step ? "step" : "false") + '">' + escapeHtml(label) + '</li>').join("");
    let body;
    if (step === 0) {
      body = '<h2>Create the owner</h2><p class="hint">Use the one-time code from the setup assistant. The owner name is saved so you can resume; the code and password never are.</p>' +
        (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
        '<form class="form-grid" data-form="setup"><label class="field"><span>One-time pairing code</span><input name="code" type="password" autocomplete="one-time-code" required minlength="24" maxlength="256"></label>' +
        '<label class="field"><span>Owner name</span><input name="username" value="' + escapeHtml(state.setup.username) + '" autocomplete="username" required minlength="3" maxlength="64"></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="new-password" required minlength="14" maxlength="256"></label>' +
        '<p class="hint">Use at least 14 characters.</p><div class="dialog-actions"><span></span><button class="button primary" type="submit">Next</button></div></form>';
    } else if (step === 1) {
      body = '<h2>Review the security boundary</h2><p class="hint">Confirm this controller stays on a trusted private network and uses HTTPS with a certificate you have checked.</p>' +
        '<ul class="hint"><li>The pairing code works once.</li><li>The owner password is stored only as a salted hash.</li><li>Computer actions use fixed operation names and are audited.</li><li>Restart and shutdown need an expiring challenge and an exact typed phrase.</li></ul>' +
        '<label class="toggle"><input type="checkbox" data-setup="security-confirm"><span>I understand the dashboard is for the trusted local network and must not be exposed to the public Internet.</span></label>' +
        '<div class="dialog-actions"><button class="button" type="button" data-action="setup-back">Back</button><button class="button primary" type="button" data-action="setup-next" data-needs-confirm="true">Next</button></div>';
    } else {
      body = '<h2>Create the owner</h2><p class="hint">This creates the first owner and opens the command centre. No computer is enrolled until a separate one-time agent code is used.</p>' +
        (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
        '<div class="notice"><strong>Ready for ' + escapeHtml(state.setup.username || "the first owner") + '.</strong><p>If this page was refreshed, go back and enter the one-time code again.</p></div>' +
        '<div class="dialog-actions"><button class="button" type="button" data-action="setup-back">Back</button><button class="button primary" type="button" data-action="setup-finish">Create owner and open dashboard</button></div>';
    }
    return loginFrame('<div class="lab">First run · step ' + (step + 1) + ' of 3</div><ol class="wizard-progress">' + progress + '</ol>' + body);
  }

  function loginFrame(content) {
    return '<main class="login-screen" id="main-content"><section class="login-hero"><div class="brand">' + brandMark() + '<div><div class="brand-name">' + escapeHtml(state.preferences.productName) + '</div><span class="lab">Command centre</span></div></div>' +
      '<div><div class="lab">Private network administration</div><h1>Someone has to keep watch.</h1><p>One owner. Fixed, typed computer actions. A typed phrase before anything that can switch a computer off. Every action lands in the audit log.</p></div>' +
      '<div class="telemetry" aria-hidden="true"><svg viewBox="0 0 520 90" preserveAspectRatio="none"><path class="line draw" d="M0 60 H140 L155 60 L165 18 L178 78 L190 60 H330 L345 60 L355 24 L368 74 L380 60 H520"/></svg></div></section>' +
      '<section class="login-side"><div class="login-card">' + content + '</div></section></main>';
  }

  function renderLogin() {
    return loginFrame('<h2>Sign in</h2>' + (state.pendingSetupError ? '<p class="form-error" role="alert">' + escapeHtml(state.pendingSetupError) + '</p>' : "") +
      '<form class="form-grid" data-form="login"><label class="field"><span>Owner name</span><input name="username" autocomplete="username" required></label>' +
      '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="button primary" type="submit">Sign in</button></form><p class="hint">The controller only accepts credentials over HTTPS.</p>');
  }

  /* Dialogs */
  function openDialog(content, focusSelector) {
    dialogContent.innerHTML = content;
    if (!dialog.open) dialog.showModal();
    applyVocabulary(dialogContent);
    const target = focusSelector ? dialogContent.querySelector(focusSelector) : null;
    if (target) target.focus();
  }

  function closeDialog() { if (dialog.open) dialog.close(); }

  function openRegexBuilder(viewId) {
    const search = searchFor(viewId);
    if (search.mode !== "regex" && !search.pattern) search.pattern = search.query;
    const flags = ["g", "i", "m", "s", "u", "y"];
    const tokens = [["^", "start"], ["$", "end"], ["\\d", "digit"], ["\\w", "word"], ["\\s", "space"], [".*", "anything"], ["(a|b)", "either"], ["[A-Z]", "range"], ["+", "one or more"], ["?", "optional"]];
    openDialog('<h2 id="dialog-title">Regular expression builder</h2><p class="hint">JavaScript regular expressions for ' + escapeHtml(viewTitle(views.find(item => item.id === viewId) || { title: viewId })) +
      '. Matching runs in a background worker with length and time limits. Engine features JavaScript lacks are not simulated.</p>' +
      '<div class="form-grid"><label class="field"><span>Pattern</span><input data-regex="pattern" class="mono" maxlength="256" value="' + escapeHtml(search.pattern || search.query) + '" spellcheck="false" autocomplete="off"></label>' +
      '<div class="field"><span>Flags</span><div class="regex-flags" role="group" aria-label="Flags">' + flags.map(flag => '<button type="button" data-action="regex-flag" data-flag="' + flag + '" aria-pressed="' + (search.flags || "").includes(flag) + '">' + flag + '</button>').join("") + '</div></div>' +
      '<div class="field"><span>Insert</span><div class="regex-tokens">' + tokens.map(([token, label]) => '<button type="button" data-action="regex-token" data-token="' + escapeHtml(token) + '">' + escapeHtml(token) + ' <span class="hint">' + escapeHtml(label) + '</span></button>').join("") + '</div></div>' +
      '<label class="field"><span>Test text</span><textarea data-regex="sample" rows="3" maxlength="4096" class="mono">' + escapeHtml(search.sample || "") + '</textarea></label>' +
      '<div class="regex-preview" id="regex-preview" aria-live="polite">Type test text to see matches highlighted.</div>' +
      '<div class="notice" id="regex-result" role="status">Example: ^(warning|error)$ with flags gi</div>' +
      '<div class="dialog-actions"><button class="button" type="button" data-action="regex-text" data-view="' + escapeHtml(viewId) + '">Use plain-text search</button><button class="button primary" type="button" data-action="regex-save" data-view="' + escapeHtml(viewId) + '">Apply regex search</button></div></div>', '[data-regex="pattern"]');
    dialogContent.dataset.flags = search.flags || "gi";
    checkRegex();
  }

  function checkRegex() {
    const pattern = dialogContent.querySelector('[data-regex="pattern"]');
    if (!pattern) return;
    const sample = dialogContent.querySelector('[data-regex="sample"]').value;
    const flags = dialogContent.dataset.flags || "";
    const result = dialogContent.querySelector("#regex-result");
    const preview = dialogContent.querySelector("#regex-preview");
    if (pattern.value.length > 256) { result.textContent = "Pattern is longer than the 256-character limit."; return; }
    try {
      const expression = new RegExp(pattern.value, flags.includes("g") ? flags : flags + "g");
      let count = 0;
      let html = "";
      let last = 0;
      if (pattern.value && sample) {
        for (const match of sample.matchAll(expression)) {
          if (count > 500 || match[0].length === 0) break;
          html += escapeHtml(sample.slice(last, match.index)) + "<mark>" + escapeHtml(match[0]) + "</mark>";
          last = match.index + match[0].length;
          count += 1;
        }
      }
      html += escapeHtml(sample.slice(last));
      preview.innerHTML = sample ? html : "Type test text to see matches highlighted.";
      result.className = "notice success";
      result.textContent = "Valid pattern · " + count + " match" + (count === 1 ? "" : "es") + " in the test text.";
    } catch (error) {
      result.className = "notice danger";
      result.textContent = "Invalid pattern: " + error.message;
    }
  }

  function openNotifications() {
    const list = state.notifications.map(item => '<li class="' + (item.error ? "error" : "") + '"><strong>' + escapeHtml(item.title) + '</strong><div class="hint mono">' + escapeHtml(formatTime(item.time)) + '</div><p>' + escapeHtml(item.detail) + '</p></li>').join("");
    openDialog('<h2 id="dialog-title">' + escapeHtml(say("Notifications")) + '</h2>' + (list ? '<ul class="drawer-list">' + list + '</ul>' : '<p class="hint">Nothing yet. Notices from this browser session appear here.</p>') +
      '<div class="dialog-actions"><button class="button" type="button" data-action="notifications-clear">Clear all</button><button class="button primary" type="button" data-action="dialog-close">Done</button></div>');
    state.notifications.forEach(item => { item.read = true; });
    storeNotifications();
    updateBell();
  }

  /* Command palette */
  function paletteCommands() {
    const host = selectedHost();
    const commands = views.map(view => ({ label: viewTitle(view), group: "Go to", run: () => changeView(view.id) }));
    commands.push(
      { label: "Refresh now", group: "Controller", run: () => refreshDashboard(true) },
      { label: say("Pair a computer"), group: "Computers", run: createInvitation },
      { label: "Notifications", group: "Controller", run: openNotifications },
      { label: "Toggle theme", group: "Settings", run: () => { state.preferences.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; savePreferences(); render(); } },
      { label: "Toggle reduced motion", group: "Settings", run: () => { state.preferences.motion = motionReduced() ? "full" : "reduced"; savePreferences(); render(); } },
      { label: "Export settings", group: "Settings", run: exportSettings },
      { label: "Sign out", group: "Session", run: logout }
    );
    if (host) {
      commands.push(
        { label: say("Request fresh inventory"), group: "Computer", run: requestInventory },
        { label: "Flush DNS cache", group: "Network", run: () => requestHostOperation("network.flushDns", null) },
        { label: "Remote status check", group: "Slop Machine", run: () => { changeView("remote"); void remoteOperation("codex.status"); } },
        { label: "Start remote sign-in", group: "Slop Machine", run: () => { changeView("remote"); void remoteOperation("codex.login.start"); } },
        { label: "Start remote control", group: "Slop Machine", run: () => { changeView("remote"); void remoteOperation("codex.remote.start"); } },
        { label: "Create phone pairing code", group: "Slop Machine", run: () => { changeView("remote"); void remoteOperation("codex.remote.pair"); } },
        { label: say("Restart computer") + "…", group: "Power", danger: true, run: () => preparePower("host.restart") },
        { label: say("Shut down computer") + "…", group: "Power", danger: true, run: () => preparePower("host.shutdown") }
      );
      for (const service of (host.snapshot && host.snapshot.services) || []) {
        commands.push({ label: "Restart service " + service.displayName, group: "Services", run: () => requestHostOperation("service.restart", service.id), hidden: true });
      }
    }
    return commands;
  }

  function openPalette() {
    if (!state.user) return;
    closeContextMenu();
    paletteQuery.value = "";
    state.paletteIndex = 0;
    updatePalette();
    if (!palette.open) palette.showModal();
    paletteQuery.focus();
  }

  function updatePalette() {
    const query = paletteQuery.value.trim().toLocaleLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    state.paletteItems = paletteCommands().filter(command => (!command.hidden || words.length) && words.every(word => (command.label + " " + command.group).toLocaleLowerCase().includes(word))).slice(0, 40);
    state.paletteIndex = clamp(state.paletteIndex, 0, Math.max(0, state.paletteItems.length - 1));
    paletteList.innerHTML = state.paletteItems.map((command, index) => '<li role="option" id="palette-' + index + '" data-palette-index="' + index + '" aria-selected="' + (index === state.paletteIndex) + '" class="' + (command.danger ? "danger" : "") + '"><span>' + escapeHtml(command.label) + '</span><span class="lab">' + escapeHtml(command.group) + '</span></li>').join("") ||
      '<li class="palette-empty" role="option" aria-disabled="true">No matching commands</li>';
    paletteQuery.setAttribute("aria-activedescendant", state.paletteItems.length ? "palette-" + state.paletteIndex : "");
    const selected = paletteList.querySelector('[aria-selected="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function runPaletteItem(index) {
    const command = state.paletteItems[index];
    if (!command) return;
    palette.close();
    void command.run();
  }

  /* Context menu */
  function openContextMenu(x, y, items) {
    contextMenu.innerHTML = items.map((item, index) => '<button type="button" role="menuitem" data-menu-index="' + index + '"><span>' + escapeHtml(item.label) + '</span>' + (item.shortcut ? '<kbd>' + escapeHtml(item.shortcut) + '</kbd>' : "") + '</button>').join("");
    contextMenu.hidden = false;
    contextMenu._items = items;
    const width = 240;
    contextMenu.style.left = Math.min(x, window.innerWidth - width - 8) + "px";
    contextMenu.style.top = Math.min(y, window.innerHeight - items.length * 40 - 20) + "px";
    contextMenu.querySelector("button").focus();
  }

  function closeContextMenu() { contextMenu.hidden = true; }

  function contextItemsFor(target) {
    const row = target.closest("[data-row]");
    const items = [];
    if (row) {
      const text = Array.from(row.cells).map(cell => cell.innerText.trim()).filter(Boolean).join("\t");
      items.push({ label: "Copy row", shortcut: "Ctrl C", run: () => copyText(text) });
      items.push({ label: "Copy row as JSON", run: () => copyText(JSON.stringify(JSON.parse(row.dataset.row), null, 2)) });
      items.push({ label: "Search for this", run: () => { const search = searchFor(state.activeView); search.mode = "text"; search.query = row.cells[0].innerText.split("\n")[0].trim(); void render(); } });
    }
    items.push({ label: "Refresh", shortcut: "R", run: () => refreshDashboard(true) });
    items.push({ label: "Command palette", shortcut: "Ctrl Shift F", run: openPalette });
    items.push({ label: "Copy page address", run: () => copyText(location.href) });
    return items;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "Copied to the clipboard.");
    } catch {
      toast("Copy unavailable", "Select the text and copy it manually.", true);
    }
  }

  /* Data */
  async function refreshDashboard(showNotice, keepRemote) {
    if (!state.user) return;
    try {
      state.dashboard = await request("/api/dashboard");
      recordTelemetry();
      const selectedStillExists = state.dashboard.hosts.some(host => host.id === state.activeHostId);
      if (!selectedStillExists) state.activeHostId = state.dashboard.hosts[0] ? state.dashboard.hosts[0].id : null;
      if (!keepRemote && (state.activeView === "remote" || state.activeView === "overview" || state.remote.hostId !== state.activeHostId)) await loadRemote(false);
      if (showNotice) toast("Updated", "Controller data refreshed.");
      await render();
    } catch (error) {
      if (error.status === 401) handleExpiredSession();
      else if (showNotice) toast("Refresh failed", error.message, true);
    }
  }

  function handleExpiredSession() {
    state.user = null;
    state.dashboard = null;
    state.pendingSetupError = "Your session expired. Sign in again.";
    restartRefreshTimer();
    void render();
  }

  async function loadInitialState() {
    applyPreferences();
    try { state.health = await request("/health"); } catch { state.health = null; }
    try {
      const setup = await request("/api/setup/status");
      state.setupRequired = Boolean(setup.pairingRequired);
      if (state.setupRequired) {
        try {
          const saved = JSON.parse(localStorage.getItem(setupKey) || "{}");
          state.setup.username = typeof saved.username === "string" ? saved.username : "";
        } catch { /* start fresh */ }
        state.setup.step = 0;
        await render();
        return;
      }
      state.user = await request("/api/session");
      await refreshDashboard(false);
    } catch (error) {
      state.user = null;
      state.setupRequired = false;
      if (error.status !== 401) state.pendingSetupError = error.message;
      await render();
    }
  }

  async function createInvitation() {
    openDialog('<h2 id="dialog-title">Pair a computer</h2><p class="hint">Name the computer you are about to pair. A one-time code is created for it.</p>' +
      '<form class="form-grid" data-form="invitation"><label class="field"><span>Computer name</span><input name="displayName" required minlength="2" maxlength="80" autocomplete="off"></label>' +
      '<div class="dialog-actions"><button class="button" type="button" data-action="dialog-close">Cancel</button><button class="button primary" type="submit">Create pairing code</button></div></form>', 'input[name="displayName"]');
  }

  async function submitInvitation(name) {
    try {
      const invitation = await request("/api/agents/invitations", { method: "POST", body: { displayName: name } });
      openDialog('<h2 id="dialog-title">Pairing code created</h2><p class="hint">Give this code to the trusted agent setup for ' + escapeHtml(invitation.displayName) + '. It expires at ' + escapeHtml(formatDate(invitation.expiresAt)) + ' and works once. It is only shown now.</p>' +
        '<div class="one-time-code">' + escapeHtml(invitation.code) + '</div><p class="hint">The code is not written to the audit log. Keep it out of chat and support records.</p>' +
        '<div class="dialog-actions"><button class="button" type="button" data-action="copy-text" data-copy="' + escapeHtml(invitation.code) + '">Copy code</button><button class="button primary" type="button" data-action="dialog-close">Done</button></div>');
      toast("Pairing code created", "Use it once before it expires.");
    } catch (error) {
      toast("Could not create pairing code", error.message, true);
    }
  }

  async function requestHostOperation(kind, targetId, quiet) {
    const host = selectedHost();
    if (!host) return toast("No computer selected", "Pair a computer before requesting an action.", true);
    try {
      await request("/api/hosts/" + encodeURIComponent(host.id) + "/operations", { method: "POST", body: { kind, targetId: targetId || null, confirmationPhrase: null } });
      if (!quiet) toast("Action queued", "The computer reports the result when it finishes.");
      else toast(remoteKindLabel(kind) + " queued", "The computer is working on it.");
      watchForCompletion();
      await refreshDashboard(false, true);
    } catch (error) {
      if (error.status === 409 && error.body && error.body.error === "confirmation-required") {
        openOperationConfirmation(host, kind, targetId, error.body.requiredPhrase);
        return;
      }
      toast("Action not queued", error.message, true);
    }
  }

  let completionWatch = null;
  function watchForCompletion() {
    const pending = new Set(((state.dashboard && state.dashboard.operations) || []).filter(operation => operation.status === "queued" || operation.status === "running").map(operation => operation.id));
    if (completionWatch) clearInterval(completionWatch);
    let rounds = 0;
    completionWatch = setInterval(async () => {
      rounds += 1;
      if (!state.user || rounds > 40) { clearInterval(completionWatch); completionWatch = null; return; }
      const before = new Map(((state.dashboard && state.dashboard.operations) || []).map(operation => [operation.id, operation.status]));
      await refreshDashboard(false, state.activeView !== "remote");
      if (state.activeView === "remote") await loadRemote(true);
      for (const operation of (state.dashboard && state.dashboard.operations) || []) {
        const previous = before.get(operation.id);
        if ((previous === "queued" || previous === "running" || pending.has(operation.id)) && (operation.status === "succeeded" || operation.status === "failed")) {
          pending.delete(operation.id);
          if (operation.status === "succeeded") { toast("Finished", remoteKindLabel(operation.kind) + ": " + summarizeResult(operation)); cheer(); }
          else toast("Action failed", remoteKindLabel(operation.kind) + ": " + (operation.result || "No reason was reported."), true);
        }
      }
      if (!((state.dashboard && state.dashboard.operations) || []).some(operation => operation.status === "queued" || operation.status === "running")) { clearInterval(completionWatch); completionWatch = null; }
    }, 3000);
  }

  function openOperationConfirmation(host, kind, targetId, phrase) {
    openDialog('<h2 id="dialog-title">Confirm ' + escapeHtml(remoteKindLabel(kind)) + '</h2><p class="hint">Checked against the current computer state. Type the exact phrase below.</p>' +
      '<div class="code-block">' + escapeHtml(phrase) + '</div><label class="field"><span>Confirmation phrase</span><input data-confirm="operation" autocomplete="off" spellcheck="false"></label>' +
      '<div class="dialog-actions"><button class="button" type="button" data-action="dialog-close">Cancel</button><button class="button danger" type="button" data-action="operation-confirm" data-host="' + escapeHtml(host.id) + '" data-kind="' + escapeHtml(kind) + '" data-target="' + escapeHtml(targetId || "") + '">Queue action</button></div>', '[data-confirm="operation"]');
  }

  async function confirmOperation(button) {
    const phrase = dialogContent.querySelector('[data-confirm="operation"]').value;
    try {
      await request("/api/hosts/" + encodeURIComponent(button.dataset.host) + "/operations", { method: "POST", body: { kind: button.dataset.kind, targetId: button.dataset.target || null, confirmationPhrase: phrase } });
      closeDialog();
      toast("Action queued", "The computer reports the result when it finishes.");
      watchForCompletion();
      await refreshDashboard(false);
    } catch (error) {
      toast("Action not queued", error.message, true);
    }
  }

  async function preparePower(kind) {
    const host = selectedHost();
    if (!host) return toast("No computer selected", "Pair a computer before requesting a power action.", true);
    try {
      const challenge = await request("/api/hosts/" + encodeURIComponent(host.id) + "/power/prepare", { method: "POST", body: { kind, hostId: host.id } });
      openDialog('<h2 id="dialog-title">' + (kind === "host.restart" ? "Restart" : "Shut down") + ' computer</h2><div class="notice danger"><strong>This changes the computer\'s power state.</strong><p>The request expires at ' + escapeHtml(formatDate(challenge.expiresAt)) + '. Unsaved work on that computer may be interrupted.</p></div>' +
        '<p>Type the exact phrase:</p><div class="code-block">' + escapeHtml(challenge.confirmationPhrase) + '</div><label class="field"><span>Confirmation phrase</span><input data-confirm="power" autocomplete="off" spellcheck="false"></label>' +
        '<div class="dialog-actions"><button class="button" type="button" data-action="dialog-close">Cancel</button><button class="button danger" type="button" data-action="power-confirm" data-id="' + escapeHtml(challenge.challengeId) + '">Confirm ' + (kind === "host.restart" ? "restart" : "shutdown") + '</button></div>', '[data-confirm="power"]');
    } catch (error) {
      toast("Power action not prepared", error.message, true);
    }
  }

  async function confirmPower(button) {
    const phrase = dialogContent.querySelector('[data-confirm="power"]').value;
    try {
      await request("/api/power/" + encodeURIComponent(button.dataset.id) + "/confirm", { method: "POST", body: { confirmationPhrase: phrase } });
      closeDialog();
      toast("Power action queued", "The agent reports its status when available.");
      await refreshDashboard(false);
    } catch (error) {
      toast("Power action not queued", error.message, true);
    }
  }

  function requestInventory() { return requestHostOperation("system.refresh", null); }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCsv(rows, columns) {
    const cell = value => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return [columns.map(cell).join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\r\n");
  }

  function exportAudit(format) {
    const records = state.dashboard.audit || [];
    if (format === "csv") download("watchdog-audit.csv", toCsv(records, ["time", "actor", "action", "target", "outcome", "detail"]), "text/csv");
    else download("watchdog-audit.json", JSON.stringify(records, null, 2), "application/json");
    toast("Audit export created", "The file contains audit records only, never credentials.");
  }

  function exportOperations() {
    download("watchdog-operations.csv", toCsv(state.dashboard.operations || [], ["createdAt", "hostId", "kind", "targetId", "status", "result", "requestedBy", "completedAt"]), "text/csv");
    toast("Operations export created", "One-time codes are already redacted in these records.");
  }

  function exportSettings() {
    download("watchdog-browser-settings.json", JSON.stringify({ schemaVersion: 2, preferences: state.preferences }, null, 2), "application/json");
    toast("Settings exported", "Import the file in another browser to copy these choices.");
  }

  function chooseFile(accept, handler) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => { if (input.files && input.files[0]) void handler(input.files[0]); });
    input.click();
  }

  async function readJsonFile(file) {
    if (file.size > 262144) throw new Error("The file is larger than 256 KB.");
    return JSON.parse(await file.text());
  }

  async function importSettings(file) {
    try {
      const value = await readJsonFile(file);
      state.preferences = sanitizePreferences(value && value.preferences ? value.preferences : value);
      savePreferences();
      await render();
      toast("Settings imported", "This browser now uses the imported choices.");
    } catch (error) {
      toast("Settings not imported", error.message, true);
    }
  }

  async function importVocabulary(file) {
    try {
      const vocabulary = sanitizeVocabulary(await readJsonFile(file));
      if (!Object.keys(vocabulary).length) throw new Error("No usable word pairs were found.");
      state.preferences.vocabulary = vocabulary;
      savePreferences();
      await render();
      toast("Vocabulary loaded", Object.keys(vocabulary).length + " words now change on screen.");
    } catch (error) {
      toast("Vocabulary not loaded", error.message, true);
    }
  }

  async function revokeHost(hostId) {
    const host = state.dashboard.hosts.find(item => item.id === hostId);
    if (!host) return;
    openDialog('<h2 id="dialog-title">Revoke ' + escapeHtml(hostName(host)) + '?</h2><p class="hint">Its agent credential stops working immediately. Pair it again to reconnect.</p>' +
      '<div class="dialog-actions"><button class="button" type="button" data-action="dialog-close">Cancel</button><button class="button danger" type="button" data-action="host-revoke-confirm" data-id="' + escapeHtml(hostId) + '">Revoke access</button></div>');
  }

  async function revokeHostConfirmed(hostId) {
    try {
      await request("/api/agents/" + encodeURIComponent(hostId), { method: "DELETE" });
      closeDialog();
      toast("Computer access revoked", "The agent can no longer authenticate.");
      await refreshDashboard(false);
    } catch (error) {
      toast("Could not revoke access", error.message, true);
    }
  }

  async function logout() {
    try { await request("/api/session", { method: "DELETE" }); } catch { /* already signed out */ }
    state.user = null;
    state.dashboard = null;
    state.telemetry = Object.create(null);
    state.remote = { hostId: null, data: null, error: "", fastUntil: 0, timer: null };
    restartRefreshTimer();
    await render();
  }

  function setupNext(needsConfirm) {
    if (needsConfirm && !root.querySelector('[data-setup="security-confirm"]')?.checked) {
      toast("Review required", "Confirm that the controller stays on a trusted private network.", true);
      return;
    }
    state.setup.step = Math.min(2, state.setup.step + 1);
    state.pendingSetupError = "";
    void render();
  }

  function setupBack() {
    state.setup.step = Math.max(0, state.setup.step - 1);
    state.pendingSetupError = "";
    void render();
  }

  async function setupFinish() {
    if (!state.setup.code || !state.setup.password || !state.setup.username) {
      state.setup.step = 0;
      state.pendingSetupError = "The one-time code and password were cleared when the page was refreshed. Enter them again.";
      await render();
      return;
    }
    try {
      state.user = await request("/api/setup/pair", { method: "POST", body: { code: state.setup.code, username: state.setup.username, password: state.setup.password } });
      state.setup.code = "";
      state.setup.password = "";
      localStorage.removeItem(setupKey);
      state.setupRequired = false;
      toast("Owner created", "Setup is complete. The command centre is ready.");
      cheer();
      await refreshDashboard(false);
    } catch (error) {
      state.pendingSetupError = error.status === 426 ? "HTTPS is required before the first owner can be created." : error.message;
      await render();
    }
  }

  function changeView(viewId) {
    if (!views.some(view => view.id === viewId)) return;
    closeDialog();
    if (palette.open) palette.close();
    state.menuOpen = false;
    const go = async () => {
      state.activeView = viewId;
      if (viewId === "remote" || viewId === "overview") await loadRemote(false);
      await render();
      document.getElementById("main-content")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    if (document.startViewTransition && !motionReduced()) document.startViewTransition(go);
    else void go();
  }

  function selectHost(hostId) {
    state.activeHostId = hostId;
    closeDialog();
    const go = async () => { await loadRemote(false); await render(); };
    if (document.startViewTransition && !motionReduced()) document.startViewTransition(go);
    else void go();
  }

  function updateSearch(viewId, query) {
    const search = searchFor(viewId);
    search.query = query;
    if (search.mode === "regex") search.pattern = query;
    if (viewId === "settings") { filterSettings(); return; }
    if (viewId === state.activeView) void render();
  }

  async function filterSettings() {
    const rows = Array.from(root.querySelectorAll("[data-setting-text]"));
    const search = searchFor("settings");
    let visible = rows;
    try {
      visible = await rowSearch("settings", rows, row => row.dataset.settingText);
    } catch (error) {
      const counter = root.querySelector("[data-settings-count]");
      if (counter) counter.textContent = error.message;
      return;
    }
    for (const row of rows) row.hidden = !visible.includes(row);
    const counter = root.querySelector("[data-settings-count]");
    if (counter) counter.textContent = (search.query ? visible.length + " of " + rows.length : rows.length) + " settings";
  }

  function setPreference(key, value) {
    if (["playfulEnglish", "playfulCantonese", "textScale", "refreshSeconds"].includes(key)) value = Number(value);
    if (["highContrast", "emoji", "schoolMode", "spotlight", "oneThing", "cheer", "narration", "sounds", "autoRefresh", "hideHostNames"].includes(key)) value = Boolean(value);
    const next = sanitizePreferences(Object.assign({}, state.preferences, { [key]: value }));
    state.preferences = next;
    savePreferences();
  }

  /* Events */
  async function onSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.dataset.form === "invitation") {
      const name = String(data.get("displayName") || "").trim();
      if (name.length < 2 || name.length > 80) return toast("Invitation not created", "Use a name between 2 and 80 characters.", true);
      return submitInvitation(name);
    }
    if (form.dataset.form === "setup") {
      state.setup.code = String(data.get("code") || "");
      state.setup.username = String(data.get("username") || "").trim();
      state.setup.password = String(data.get("password") || "");
      if (state.setup.username.length < 3 || state.setup.password.length < 14 || state.setup.code.length < 24) {
        state.pendingSetupError = "Check the owner name, one-time code and 14-character minimum password.";
        return render();
      }
      try { localStorage.setItem(setupKey, JSON.stringify({ username: state.setup.username, started: true })); } catch { /* optional */ }
      state.setup.step = 1;
      state.pendingSetupError = "";
      return render();
    }
    if (form.dataset.form === "login") {
      try {
        state.user = await request("/api/session", { method: "POST", body: { username: String(data.get("username") || ""), password: String(data.get("password") || "") } });
        state.pendingSetupError = "";
        await refreshDashboard(false);
      } catch {
        state.pendingSetupError = "The sign-in was not accepted. Check the owner name and password.";
        await render();
      }
    }
  }

  const actions = {
    "setup-next": target => setupNext(target.dataset.needsConfirm === "true"),
    "setup-back": setupBack,
    "setup-finish": setupFinish,
    "dialog-close": closeDialog,
    "palette-open": openPalette,
    "refresh": () => refreshDashboard(true),
    "logout": logout,
    "notifications": openNotifications,
    "notifications-clear": () => { state.notifications = []; storeNotifications(); updateBell(); closeDialog(); },
    "menu-toggle": () => { state.menuOpen = !state.menuOpen; root.querySelector(".shell")?.classList.toggle("menu-open", state.menuOpen); },
    "regex-open": target => openRegexBuilder(target.dataset.view || state.activeView),
    "regex-flag": target => {
      const flag = target.dataset.flag;
      let flags = dialogContent.dataset.flags || "";
      flags = flags.includes(flag) ? flags.replace(flag, "") : flags + flag;
      dialogContent.dataset.flags = flags;
      target.setAttribute("aria-pressed", String(flags.includes(flag)));
      checkRegex();
    },
    "regex-token": target => {
      const input = dialogContent.querySelector('[data-regex="pattern"]');
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + target.dataset.token + input.value.slice(end);
      input.focus();
      input.setSelectionRange(start + target.dataset.token.length, start + target.dataset.token.length);
      checkRegex();
    },
    "regex-text": target => { searchFor(target.dataset.view || state.activeView).mode = "text"; closeDialog(); void render(); },
    "regex-save": target => {
      const viewId = target.dataset.view || state.activeView;
      const search = searchFor(viewId);
      search.pattern = dialogContent.querySelector('[data-regex="pattern"]').value;
      search.flags = dialogContent.dataset.flags || "";
      search.sample = dialogContent.querySelector('[data-regex="sample"]').value;
      search.query = search.pattern;
      search.mode = "regex";
      closeDialog();
      if (viewId === "settings") void render(); else void render();
    },
    "invitation-create": createInvitation,
    "host-operation": target => requestHostOperation(target.dataset.kind, target.dataset.target),
    "operation-confirm": confirmOperation,
    "power-prepare": target => preparePower(target.dataset.kind),
    "power-confirm": confirmPower,
    "agent-refresh": requestInventory,
    "network-flush": () => requestHostOperation("network.flushDns", null),
    "audit-export": target => exportAudit(target.dataset.format),
    "export-operations": exportOperations,
    "host-revoke": target => revokeHost(target.dataset.id),
    "host-revoke-confirm": target => revokeHostConfirmed(target.dataset.id),
    "remote-op": target => remoteOperation(target.dataset.kind),
    "copy-text": target => copyText(target.dataset.copy || ""),
    "accent": target => { setPreference("accent", target.dataset.value); void render(); },
    "settings-export": exportSettings,
    "settings-import": () => chooseFile("application/json,.json", importSettings),
    "vocabulary-choose": () => chooseFile("application/json,.json", importVocabulary),
    "vocabulary-clear": () => { state.preferences.vocabulary = {}; savePreferences(); void render(); toast("Vocabulary removed", "Interface words are back to normal."); },
    "voice-test": () => { const was = state.preferences.narration; state.preferences.narration = true; speak(say("Command centre", "指揮中心") + ". Voice test."); state.preferences.narration = was; },
    "preferences-reset": () => {
      try { localStorage.removeItem(preferenceKey); localStorage.removeItem(legacyPreferenceKey); } catch { /* optional */ }
      state.preferences = defaults();
      applyPreferences();
      void render();
      toast("Preferences reset", "Browser-only settings returned to their defaults.");
    }
  };

  async function onClick(event) {
    const target = event.target.closest("[data-action], [data-view], [data-host], [data-pref-key]");
    if (!target) return;
    if (target.dataset.prefKey) {
      setPreference(target.dataset.prefKey, target.dataset.prefValue);
      await render();
      return;
    }
    const action = target.dataset.action;
    if (action && actions[action]) {
      event.preventDefault();
      await actions[action](target);
      return;
    }
    if (target.dataset.view && !target.matches("[data-role='search']")) return changeView(target.dataset.view);
    if (target.dataset.host) return selectHost(target.dataset.host);
  }

  function onInput(event) {
    const input = event.target;
    if (input.matches('[data-role="search"]')) return updateSearch(input.dataset.view, input.value);
    if (input.dataset.regex) return checkRegex();
    if (input.type === "range" && input.dataset.pref) {
      const output = root.querySelector('[data-output="' + input.dataset.pref + '"]');
      if (output) output.textContent = input.value + (input.dataset.suffix || "");
      setPreference(input.dataset.pref, input.value);
    }
  }

  function onChange(event) {
    const input = event.target;
    if (!input.dataset.pref || input.type === "range") return;
    const key = input.dataset.pref;
    if (key === "productName" && input.value.trim().length < 2) {
      toast("Name not changed", "Use between 2 and 40 characters.", true);
      return;
    }
    setPreference(key, input.type === "checkbox" ? input.checked : input.value);
    void render();
  }

  root.addEventListener("submit", event => void onSubmit(event));
  root.addEventListener("click", event => void onClick(event));
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  dialogContent.addEventListener("click", event => void onClick(event));
  dialogContent.addEventListener("input", onInput);
  dialogContent.addEventListener("submit", event => void onSubmit(event));
  dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });

  root.addEventListener("dragover", event => {
    const zone = event.target.closest("[data-drop]");
    if (zone) { event.preventDefault(); zone.classList.add("dragging"); }
  });
  root.addEventListener("dragleave", event => { event.target.closest("[data-drop]")?.classList.remove("dragging"); });
  root.addEventListener("drop", event => {
    const zone = event.target.closest("[data-drop]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove("dragging");
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) void importVocabulary(file);
  });

  root.addEventListener("contextmenu", event => {
    if (!state.user || event.target.closest("input, textarea, a")) return;
    event.preventDefault();
    openContextMenu(event.clientX, event.clientY, contextItemsFor(event.target));
  });
  contextMenu.addEventListener("click", event => {
    const button = event.target.closest("[data-menu-index]");
    if (!button) return;
    const item = contextMenu._items[Number(button.dataset.menuIndex)];
    closeContextMenu();
    if (item) void item.run();
  });
  contextMenu.addEventListener("keydown", event => {
    const buttons = Array.from(contextMenu.querySelectorAll("button"));
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown") { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length].focus(); }
    if (event.key === "Escape") { closeContextMenu(); }
  });
  document.addEventListener("click", event => { if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu(); });

  paletteQuery.addEventListener("input", () => { state.paletteIndex = 0; updatePalette(); });
  paletteQuery.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1); updatePalette(); }
    if (event.key === "ArrowUp") { event.preventDefault(); state.paletteIndex = Math.max(0, state.paletteIndex - 1); updatePalette(); }
    if (event.key === "Enter") { event.preventDefault(); runPaletteItem(state.paletteIndex); }
  });
  paletteList.addEventListener("click", event => {
    const item = event.target.closest("[data-palette-index]");
    if (item) runPaletteItem(Number(item.dataset.paletteIndex));
  });
  palette.addEventListener("click", event => { if (event.target === palette) palette.close(); });

  document.addEventListener("keydown", event => {
    const typing = event.target.closest && event.target.closest("input, textarea, select");
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); openPalette(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openPalette(); return; }
    if (typing || !state.user || dialog.open || palette.open) return;
    if (event.key === "/") { event.preventDefault(); root.querySelector("#omnibox-input")?.focus(); }
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) void refreshDashboard(true);
    if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && document.activeElement && root.contains(document.activeElement)) {
      event.preventDefault();
      const rect = document.activeElement.getBoundingClientRect();
      openContextMenu(rect.left + 20, rect.bottom, contextItemsFor(document.activeElement));
    }
  });

  window.addEventListener("resize", () => { const topbar = root.querySelector(".topbar"); if (topbar) document.documentElement.style.setProperty("--topbar-h", topbar.offsetHeight + "px"); });
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (state.preferences.theme === "system") applyPreferences(); });
  if ("speechSynthesis" in window) {
    const loadVoices = () => { state.voices = speechSynthesis.getVoices().slice(0, 200); if (state.activeView === "settings" && state.user) void render(); };
    state.voices = speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
  }
  setInterval(tickCountdowns, 1000);
  void loadInitialState();
})();
