document.addEventListener("DOMContentLoaded", async () => {
  const masterBtn = document.getElementById("master-toggle-btn");
  const masterStatusLabel = document.getElementById("master-status-label");
  const platformsContainer = document.getElementById("platforms-container");
  const ytCheckbox = document.getElementById("platform-yt-checkbox");
  const igCheckbox = document.getElementById("platform-ig-checkbox");
  const ttCheckbox = document.getElementById("platform-tt-checkbox");
  const doomToggle = document.getElementById("doomscroll-toggle");
  const todayMetric = document.getElementById("metric-today");
  const streakMetric = document.getElementById("metric-streak");
  const settingsLink = document.getElementById("link-settings");
  const shareBtn = document.getElementById("btn-share");
  const currentDomainText = document.getElementById("current-domain");

  const pausedIndicator = document.getElementById("paused-indicator");
  const mainControls = document.getElementById("main-controls");
  const examInactiveView = document.getElementById("exam-inactive-view");
  const examActiveView = document.getElementById("exam-active-view");
  const examCustomDuration = document.getElementById("exam-custom-duration");
  const examWhitelist = document.getElementById("exam-whitelist");
  const startExamBtn = document.getElementById("start-exam-btn");
  const endEarlyBtn = document.getElementById("end-early-btn");
  const phaseText = document.getElementById("exam-phase-text");
  const examCountdown = document.getElementById("exam-countdown");

  let selectedDuration = 25;
  let countdownInterval = null;

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) currentDomainText.textContent = new URL(activeTab.url).hostname.replace("www.", "");
  } catch {
    currentDomainText.textContent = "clearfeed.app";
  }

  const [syncData, localData, pauseInfo] = await Promise.all([
    chrome.storage.sync.get(["masterEnabled", "platforms", "doomscroll"]),
    chrome.storage.local.get(["stats", "examMode"]),
    chrome.runtime.sendMessage({ type: "isPaused" })
  ]);

  let masterEnabled = syncData.masterEnabled !== false;
  const platforms = syncData.platforms || {};
  const doomscroll = syncData.doomscroll || {};

  ytCheckbox.checked = platforms.youtube?.enabled !== false;
  igCheckbox.checked = platforms.instagram?.enabled !== false;
  ttCheckbox.checked = platforms.tiktok?.enabled !== false;
  doomToggle.checked = doomscroll.enabled !== false;

  const stats = localData.stats || {};
  const dailyData = stats.dailyData || {};
  const todayRemoved = dailyData[formatDate(new Date())]?.removed || 0;
  const streakDays = stats.streakDays || 0;
  todayMetric.textContent = String(todayRemoved);
  streakMetric.textContent = `🔥 ${streakDays} ${streakDays === 1 ? "day" : "days"}`;

  updateMasterUI(masterEnabled);

  if (pauseInfo?.paused) {
    const hoursLeft = Math.max(1, Math.ceil((pauseInfo.pauseUntil - Date.now()) / 3600000));
    pausedIndicator.style.display = "block";
    pausedIndicator.textContent = `Paused — resuming in ${hoursLeft}h`;
    mainControls.style.display = "none";
    platformsContainer.style.display = "none";
  }

  setupExamPills();
  renderExamMode(localData.examMode);

  masterBtn.addEventListener("click", async () => {
    masterEnabled = !masterEnabled;
    await chrome.storage.sync.set({ masterEnabled });
    updateMasterUI(masterEnabled);
    notifyActiveTab();
  });

  ytCheckbox.addEventListener("change", () => updatePlatforms({ youtube: { enabled: ytCheckbox.checked } }));
  igCheckbox.addEventListener("change", () => updatePlatforms({ instagram: { enabled: igCheckbox.checked } }));
  ttCheckbox.addEventListener("change", () => updatePlatforms({ tiktok: { enabled: ttCheckbox.checked } }));

  doomToggle.addEventListener("change", async () => {
    const latest = await chrome.storage.sync.get("doomscroll");
    await chrome.storage.sync.set({ doomscroll: { ...(latest.doomscroll || {}), enabled: doomToggle.checked } });
  });

  async function updatePlatforms(partial) {
    const latest = await chrome.storage.sync.get("platforms");
    const next = {
      ...(latest.platforms || {}),
      youtube: { enabled: latest.platforms?.youtube?.enabled !== false, ...(latest.platforms?.youtube || {}), ...(partial.youtube || {}) },
      instagram: { enabled: latest.platforms?.instagram?.enabled !== false, ...(latest.platforms?.instagram || {}), ...(partial.instagram || {}) },
      tiktok: { enabled: latest.platforms?.tiktok?.enabled !== false, ...(latest.platforms?.tiktok || {}), ...(partial.tiktok || {}) }
    };
    await chrome.storage.sync.set({ platforms: next });
    notifyActiveTab();
  }

  startExamBtn.addEventListener("click", async () => {
    const duration = selectedDuration === "custom" ? Number(examCustomDuration.value) : Number(selectedDuration);
    const whitelist = examWhitelist.value.split(",").map((v) => v.trim()).filter(Boolean);
    const result = await chrome.runtime.sendMessage({ type: "startExamMode", durationMinutes: duration, whitelist });
    if (result?.ok) renderExamMode(result.examMode);
  });

  endEarlyBtn.addEventListener("click", async () => {
    if (!confirm("End session? You'll lose your current Pomodoro progress.")) return;
    await chrome.runtime.sendMessage({ type: "endExamMode", confirmed: true });
    const nowData = await chrome.storage.local.get("examMode");
    renderExamMode(nowData.examMode);
  });

  settingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "options.html" });
  });

  shareBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    let weeklyRemoved = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyRemoved += dailyData[formatDate(d)]?.removed || 0;
    }
    const hours = ((weeklyRemoved * 0.5) / 60).toFixed(1);
    const text = `I've reclaimed ${hours} hours using ClearFeed. Protect your attention. 🛡️\n\nhttps://clearfeed.app`;
    chrome.tabs.create({ url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "examModeUpdated") renderExamMode(message.examMode);
  });

  function setupExamPills() {
    document.querySelectorAll(".exam-pill").forEach((btn) => {
      btn.style.cssText = "background:#1f2332;color:#cbd5e1;border:1px solid #2c3041;border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer;";
      if (btn.dataset.value === "25") btn.style.borderColor = "#6366f1";
      btn.addEventListener("click", () => {
        selectedDuration = btn.dataset.value === "custom" ? "custom" : Number(btn.dataset.value);
        document.querySelectorAll(".exam-pill").forEach((other) => {
          other.style.borderColor = "#2c3041";
          other.style.color = "#cbd5e1";
        });
        btn.style.borderColor = "#6366f1";
        btn.style.color = "#fff";
        examCustomDuration.style.display = selectedDuration === "custom" ? "block" : "none";
      });
    });
  }

  function updateMasterUI(enabled) {
    if (enabled) {
      masterBtn.classList.add("active");
      masterStatusLabel.textContent = "Protection is ON";
      platformsContainer.classList.remove("dimmed");
    } else {
      masterBtn.classList.remove("active");
      masterStatusLabel.textContent = "Protection is OFF";
      platformsContainer.classList.add("dimmed");
    }
  }

  async function notifyActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && /youtube|instagram|tiktok/.test(tab.url || "")) chrome.tabs.reload(tab.id);
    } catch {}
  }

  function renderExamMode(examMode) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (!examMode?.active) {
      examInactiveView.style.display = "flex";
      examActiveView.style.display = "none";
      return;
    }

    examInactiveView.style.display = "none";
    examActiveView.style.display = "flex";

    const tick = () => {
      const leftSec = Math.max(0, Math.floor(((examMode.startTime + examMode.durationMinutes * 60000) - Date.now()) / 1000));
      const mins = String(Math.floor(leftSec / 60)).padStart(2, "0");
      const secs = String(leftSec % 60).padStart(2, "0");
      examCountdown.textContent = `${mins}:${secs}`;

      const isFocus = examMode.pomodoroPhase === "focus";
      const phaseLabel = isFocus ? "Focus" : "Break";
      const sessionNum = Math.max(1, examMode.pomodoroCount + (isFocus ? 1 : 0));
      phaseText.textContent = `🍅 ${phaseLabel} Session ${sessionNum} of 4`;

      if (leftSec <= 0 && countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };

    tick();
    countdownInterval = setInterval(tick, 1000);
  }
});
