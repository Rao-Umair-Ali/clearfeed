const DISTRACTING_DOMAINS = [
  "youtube.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "reddit.com",
  "netflix.com",
  "twitch.tv"
];

const EXAM_DNR_RULE_ID_BASE = 1000;
const EXAM_TICK_ALARM = "examModeTick";
const EXAM_PHASE_ALARM = "examModePhase";
const EXAM_END_ALARM = "examModeEnd";
const DAILY_STREAK_ALARM = "dailyStreakCheck";
const PAUSE_CHECK_ALARM = "pauseModeCheck";
const POMODORO_FOCUS_MS = 25 * 60 * 1000;
const POMODORO_BREAK_MS = 5 * 60 * 1000;
const POMODORO_LONG_BREAK_MS = 15 * 60 * 1000;

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureDefaults();
  await setupRecurringAlarms();
  await safelySetUninstallUrl();

  if (details.reason === "install") {
    chrome.tabs.create({ url: "options.html" });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await setupRecurringAlarms();
  await safelySetUninstallUrl();
  await restoreExamModeIfNeeded();
});

chrome.runtime.onSuspend.addListener(() => {
  openUninstallGuardTab().catch(() => {});
});

chrome.management.onDisabled.addListener((info) => {
  if (info.id === chrome.runtime.id) {
    openUninstallGuardTab().catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const { examMode } = await chrome.storage.local.get("examMode");
  if (examMode?.active) {
    injectTimerWidgetInTab(tabId).catch(() => {});
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY_STREAK_ALARM) {
    await checkAndResetStreak();
    return;
  }

  if (alarm.name === EXAM_TICK_ALARM) {
    await tickExamMode();
    return;
  }

  if (alarm.name === EXAM_PHASE_ALARM) {
    await advancePomodoroPhase();
    return;
  }

  if (alarm.name === EXAM_END_ALARM) {
    await finalizeExamSession(true);
    return;
  }

  if (alarm.name === PAUSE_CHECK_ALARM) {
    await checkPauseModeExpiry();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "elementRemoved") {
    handleElementRemoved(message.count || 1).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "startExamMode") {
    startExamMode(message.durationMinutes, message.whitelist || []).then((examMode) => {
      sendResponse({ ok: true, examMode });
    }).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message.type === "endExamMode") {
    endExamMode(Boolean(message.confirmed)).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "getExamStatus") {
    getExamModeStatus().then((data) => sendResponse({ ok: true, ...data })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "pauseFor24Hours") {
    pauseFor24Hours().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "isPaused") {
    isPaused().then((pausedInfo) => sendResponse({ ok: true, ...pausedInfo })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "openPopupHint") {
    chrome.action.openPopup().catch(() => {});
    return false;
  }

  return false;
});

async function ensureDefaults() {
  const syncData = await chrome.storage.sync.get(["masterEnabled", "platforms", "settings", "profile", "doomscroll"]);
  const localData = await chrome.storage.local.get(["stats", "examMode", "doomscroll"]);

  const syncUpdate = {};
  if (syncData.masterEnabled === undefined) syncUpdate.masterEnabled = true;
  const defaultPlatforms = {
    youtube: { enabled: true },
    instagram: {
      enabled: true,
      removeReels: true,
      removeExplore: true,
      removeStories: true,
      removeSuggested: true
    },
    tiktok: {
      enabled: true,
      removeFeed: true,
      removeLive: true,
      removeExplore: true
    }
  };
  if (!syncData.platforms) {
    syncUpdate.platforms = defaultPlatforms;
  } else {
    syncUpdate.platforms = {
      ...defaultPlatforms,
      ...syncData.platforms,
      youtube: {
        enabled: typeof syncData.platforms.youtube === "boolean" ? syncData.platforms.youtube : (syncData.platforms.youtube?.enabled !== false)
      },
      instagram: {
        ...defaultPlatforms.instagram,
        ...(syncData.platforms.instagram || {})
      },
      tiktok: {
        ...defaultPlatforms.tiktok,
        ...(syncData.platforms.tiktok || {})
      }
    };
  }
  if (!syncData.settings) {
    syncUpdate.settings = {
      removeShorts: true,
      removeHomefeed: true,
      removeSidebar: true,
      removeAutoplay: true
    };
  }
  if (!syncData.profile) syncUpdate.profile = { name: "", focusTask: "" };
  const defaultDoomscrollSync = {
    enabled: true,
    sensitivityMinutes: 15,
    velocityDetection: true,
    sessionDurationAlerts: true
  };
  syncUpdate.doomscroll = { ...defaultDoomscrollSync, ...(syncData.doomscroll || {}) };
  if (Object.keys(syncUpdate).length) await chrome.storage.sync.set(syncUpdate);

  const defaultStats = {
    streakDays: 0,
    bestStreak: 0,
    lastActiveDate: "",
    installDate: Date.now(),
    totalElementsRemoved: 0,
    totalMinutesSaved: 0,
    totalExamSessionsCompleted: 0,
    dailyData: {},
    weeklyReport: {}
  };
  const stats = { ...defaultStats, ...(localData.stats || {}) };
  if (!stats.dailyData) stats.dailyData = {};
  await chrome.storage.local.set({ stats });

  const defaultExam = {
    active: false,
    paused: false,
    pauseUntil: 0,
    startTime: 0,
    durationMinutes: 0,
    whitelist: [],
    pomodoroPhase: "focus",
    pomodoroCount: 0,
    pomodoroCycleCount: 0,
    phaseStartTime: 0,
    phaseEndTime: 0,
    sessionHistory: []
  };
  const examMode = { ...defaultExam, ...(localData.examMode || {}) };
  if (!Array.isArray(examMode.sessionHistory)) examMode.sessionHistory = [];
  await chrome.storage.local.set({ examMode });

  const defaultDoomscrollLocal = {
    cooldowns: {},
    softBlocks: {}
  };
  const doomscrollLocal = { ...defaultDoomscrollLocal, ...(localData.doomscroll || {}) };
  await chrome.storage.local.set({ doomscroll: doomscrollLocal });
}

async function safelySetUninstallUrl() {
  try {
    // Chrome only accepts http/https uninstall URLs (not chrome-extension:// URLs).
    await chrome.runtime.setUninstallURL("https://clearfeed.app/goodbye");
  } catch (error) {
    console.warn("ClearFeed: Failed to set uninstall URL:", error);
  }
}

async function setupRecurringAlarms() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  chrome.alarms.create(DAILY_STREAK_ALARM, { when: nextMidnight.getTime(), periodInMinutes: 1440 });
  chrome.alarms.create(PAUSE_CHECK_ALARM, { periodInMinutes: 5 });
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function buildRuleForDomain(domain, index) {
  return {
    id: EXAM_DNR_RULE_ID_BASE + index,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: [
        "main_frame",
        "sub_frame",
        "script",
        "xmlhttprequest",
        "stylesheet",
        "image",
        "font",
        "media",
        "object",
        "ping",
        "csp_report",
        "websocket",
        "other"
      ]
    }
  };
}

async function applyExamBlockingRules(whitelist) {
  const normalizedWhitelist = new Set((whitelist || []).map(normalizeDomain).filter(Boolean));
  const blockedDomains = DISTRACTING_DOMAINS.filter((domain) => {
    if (normalizedWhitelist.has(domain)) return false;
    const parts = domain.split(".");
    if (parts.length > 2 && normalizedWhitelist.has(parts.slice(1).join("."))) return false;
    return true;
  });

  const addRules = blockedDomains.map((domain, index) => buildRuleForDomain(domain, index));
  const removeRuleIds = DISTRACTING_DOMAINS.map((_, index) => EXAM_DNR_RULE_ID_BASE + index);

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function clearExamBlockingRules() {
  const removeRuleIds = DISTRACTING_DOMAINS.map((_, index) => EXAM_DNR_RULE_ID_BASE + index);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
}

async function startExamMode(durationMinutes, whitelistInput) {
  const cleanDuration = Math.max(10, Math.min(180, Number(durationMinutes) || 25));
  const now = Date.now();
  const whitelist = (Array.isArray(whitelistInput) ? whitelistInput : String(whitelistInput || "").split(","))
    .map(normalizeDomain)
    .filter(Boolean);

  const { examMode } = await chrome.storage.local.get("examMode");
  if (examMode?.active) throw new Error("Exam Mode is already active.");

  const updated = {
    ...(examMode || {}),
    active: true,
    startTime: now,
    durationMinutes: cleanDuration,
    whitelist,
    pomodoroPhase: "focus",
    pomodoroCount: 0,
    pomodoroCycleCount: 0,
    phaseStartTime: now,
    phaseEndTime: now + POMODORO_FOCUS_MS
  };

  await applyExamBlockingRules(whitelist);
  await chrome.storage.local.set({ examMode: updated });

  chrome.alarms.create(EXAM_TICK_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(EXAM_PHASE_ALARM, { when: updated.phaseEndTime });
  chrome.alarms.create(EXAM_END_ALARM, { when: updated.startTime + updated.durationMinutes * 60 * 1000 });

  await injectTimerWidgetEverywhere();
  await broadcastExamModeUpdate();
  return updated;
}

async function endExamMode(confirmed) {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode?.active) return;

  if (!confirmed) {
    throw new Error("End session? You'll lose your current Pomodoro progress.");
  }

  await finalizeExamSession(false);
}

async function finalizeExamSession(completed) {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode) return;

  const durationMinutes = Math.max(1, Math.round((Date.now() - (examMode.startTime || Date.now())) / 60000));
  const sessionEntry = {
    date: formatDate(new Date()),
    durationMinutes,
    completed
  };

  const nextHistory = Array.isArray(examMode.sessionHistory) ? [...examMode.sessionHistory, sessionEntry] : [sessionEntry];

  await updateDailyPomodoroCount(1);
  await updateExamSessionStats(sessionEntry, completed);

  const updated = {
    ...examMode,
    active: false,
    startTime: 0,
    durationMinutes: 0,
    whitelist: [],
    pomodoroPhase: "focus",
    pomodoroCount: 0,
    pomodoroCycleCount: 0,
    phaseStartTime: 0,
    phaseEndTime: 0,
    sessionHistory: nextHistory
  };

  await chrome.storage.local.set({ examMode: updated });
  await clearExamBlockingRules();
  chrome.alarms.clear(EXAM_TICK_ALARM);
  chrome.alarms.clear(EXAM_PHASE_ALARM);
  chrome.alarms.clear(EXAM_END_ALARM);

  await removeTimerWidgetEverywhere();
  await broadcastExamModeUpdate();
}

async function tickExamMode() {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode?.active) {
    chrome.alarms.clear(EXAM_TICK_ALARM);
    chrome.alarms.clear(EXAM_PHASE_ALARM);
    return;
  }

  const now = Date.now();
  const sessionEnd = (examMode.startTime || now) + (examMode.durationMinutes || 0) * 60 * 1000;
  if (now >= sessionEnd) {
    await finalizeExamSession(true);
  } else {
    await broadcastExamModeUpdate();
  }
}

async function advancePomodoroPhase() {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode?.active) return;

  const now = Date.now();
  const updated = { ...examMode };

  if (examMode.pomodoroPhase === "focus") {
    updated.pomodoroCount = (updated.pomodoroCount || 0) + 1;
    updated.pomodoroCycleCount = (updated.pomodoroCycleCount || 0) + 1;
    await updateDailyPomodoroCount(1);

    const useLongBreak = updated.pomodoroCycleCount % 4 === 0;
    updated.pomodoroPhase = useLongBreak ? "longBreak" : "break";
    updated.phaseStartTime = now;
    updated.phaseEndTime = now + (useLongBreak ? POMODORO_LONG_BREAK_MS : POMODORO_BREAK_MS);

    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "ClearFeed Exam Mode",
      message: useLongBreak ? "Break time! Rest for 15 minutes." : "Break time! Rest for 5 minutes."
    });
  } else {
    updated.pomodoroPhase = "focus";
    updated.phaseStartTime = now;
    updated.phaseEndTime = now + POMODORO_FOCUS_MS;

    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "ClearFeed Exam Mode",
      message: "Focus time! Back to work."
    });
  }

  await chrome.storage.local.set({ examMode: updated });
  chrome.alarms.create(EXAM_PHASE_ALARM, { when: updated.phaseEndTime });
  await broadcastExamModeUpdate();
}

async function restoreExamModeIfNeeded() {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode?.active) return;
  await applyExamBlockingRules(examMode.whitelist || []);
  chrome.alarms.create(EXAM_TICK_ALARM, { periodInMinutes: 1 });
  if (examMode.phaseEndTime) chrome.alarms.create(EXAM_PHASE_ALARM, { when: examMode.phaseEndTime });
  chrome.alarms.create(EXAM_END_ALARM, { when: examMode.startTime + examMode.durationMinutes * 60 * 1000 });
  await injectTimerWidgetEverywhere();
  await broadcastExamModeUpdate();
}

async function getExamModeStatus() {
  const { examMode } = await chrome.storage.local.get("examMode");
  return {
    examMode: examMode || null,
    now: Date.now()
  };
}

async function broadcastExamModeUpdate() {
  const payload = await getExamModeStatus();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "examModeUpdated", ...payload }).catch(() => {});
  }
}

async function injectTimerWidgetEverywhere() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url || tab.url.startsWith("chrome://")) continue;
    await injectTimerWidgetInTab(tab.id).catch(() => {});
  }
}

async function injectTimerWidgetInTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["timer.js"]
  });
}

async function removeTimerWidgetEverywhere() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "clearfeedRemoveTimerWidget" }).catch(() => {});
  }
}

async function handleElementRemoved(count = 1) {
  const { stats } = await chrome.storage.local.get("stats");
  const next = {
    streakDays: 0,
    bestStreak: 0,
    lastActiveDate: "",
    installDate: Date.now(),
    totalElementsRemoved: 0,
    totalMinutesSaved: 0,
    totalExamSessionsCompleted: 0,
    dailyData: {},
    weeklyReport: {},
    ...(stats || {})
  };

  const today = formatDate(new Date());
  if (!next.dailyData[today]) next.dailyData[today] = { removed: 0, pomodoros: 0 };

  next.totalElementsRemoved += count;
  next.totalMinutesSaved = Number((next.totalElementsRemoved * 0.5).toFixed(1));
  next.dailyData[today].removed += count;

  if (next.dailyData[today].removed >= 20 || next.dailyData[today].pomodoros >= 1) {
    next.lastActiveDate = today;
  }

  await chrome.storage.local.set({ stats: next });
}

async function updateDailyPomodoroCount(incrementBy) {
  const { stats } = await chrome.storage.local.get("stats");
  const next = {
    streakDays: 0,
    bestStreak: 0,
    lastActiveDate: "",
    installDate: Date.now(),
    totalElementsRemoved: 0,
    totalMinutesSaved: 0,
    totalExamSessionsCompleted: 0,
    dailyData: {},
    weeklyReport: {},
    ...(stats || {})
  };

  const today = formatDate(new Date());
  if (!next.dailyData[today]) next.dailyData[today] = { removed: 0, pomodoros: 0 };
  next.dailyData[today].pomodoros += incrementBy;

  if (next.dailyData[today].removed >= 20 || next.dailyData[today].pomodoros >= 1) {
    next.lastActiveDate = today;
  }

  await chrome.storage.local.set({ stats: next });
}

async function updateExamSessionStats(sessionEntry, completed) {
  const { stats } = await chrome.storage.local.get("stats");
  const next = {
    streakDays: 0,
    bestStreak: 0,
    lastActiveDate: "",
    installDate: Date.now(),
    totalElementsRemoved: 0,
    totalMinutesSaved: 0,
    totalExamSessionsCompleted: 0,
    dailyData: {},
    weeklyReport: {},
    ...(stats || {})
  };

  if (completed) {
    next.totalExamSessionsCompleted = (next.totalExamSessionsCompleted || 0) + 1;
  }

  const today = sessionEntry.date;
  if (!next.dailyData[today]) next.dailyData[today] = { removed: 0, pomodoros: 0 };
  next.lastActiveDate = today;

  await chrome.storage.local.set({ stats: next });
}

async function checkAndResetStreak() {
  const { stats } = await chrome.storage.local.get("stats");
  if (!stats) return;

  const today = new Date();
  const todayStr = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const lastActive = stats.lastActiveDate || "";
  const next = { ...stats };

  if (lastActive === yesterdayStr) {
    next.streakDays = (next.streakDays || 0) + 1;
    next.bestStreak = Math.max(next.bestStreak || 0, next.streakDays);
  } else if (lastActive !== todayStr) {
    next.streakDays = 0;
  }

  const day = today.getDay();
  if (day === 1) {
    next.weeklyReport = generateWeeklyReport(next.dailyData || {});
  }

  await chrome.storage.local.set({ stats: next });
}

function generateWeeklyReport(dailyData) {
  const report = { generatedAt: Date.now(), days: [] };
  const start = new Date();
  start.setDate(start.getDate() - 6);

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = formatDate(date);
    report.days.push({
      date: key,
      removed: dailyData[key]?.removed || 0,
      pomodoros: dailyData[key]?.pomodoros || 0
    });
  }

  return report;
}

async function pauseFor24Hours() {
  const { examMode } = await chrome.storage.local.get("examMode");
  const pauseUntil = Date.now() + 24 * 60 * 60 * 1000;

  await chrome.storage.local.set({
    examMode: {
      ...(examMode || {}),
      paused: true,
      pauseUntil
    }
  });

  if (examMode?.active) {
    await finalizeExamSession(false);
  }

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "pauseStateChanged", paused: true, pauseUntil }).catch(() => {});
  }
}

async function checkPauseModeExpiry() {
  const { examMode } = await chrome.storage.local.get("examMode");
  if (!examMode?.paused) return;
  if (Date.now() < (examMode.pauseUntil || 0)) return;

  const updated = { ...examMode, paused: false, pauseUntil: 0 };
  await chrome.storage.local.set({ examMode: updated });

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "pauseStateChanged", paused: false, pauseUntil: 0 }).catch(() => {});
  }
}

async function isPaused() {
  const { examMode } = await chrome.storage.local.get("examMode");
  const paused = Boolean(examMode?.paused && Date.now() < (examMode.pauseUntil || 0));
  return {
    paused,
    pauseUntil: examMode?.pauseUntil || 0
  };
}

async function openUninstallGuardTab() {
  const { stats } = await chrome.storage.local.get("stats");
  const streak = stats?.streakDays || 0;
  const savedHours = Math.floor((stats?.totalMinutesSaved || 0) / 60);
  const installDate = stats?.installDate ? new Date(stats.installDate).toISOString().slice(0, 10) : "";
  const url = chrome.runtime.getURL(`uninstall.html?streak=${encodeURIComponent(streak)}&saved=${encodeURIComponent(savedHours)}&date=${encodeURIComponent(installDate)}`);
  await chrome.tabs.create({ url });
}
