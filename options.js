document.addEventListener("DOMContentLoaded", async () => {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".config-section");
  const headerSectionTitle = document.getElementById("header-section-title");
  const saveIndicator = document.getElementById("save-indicator");

  const nameInput = document.getElementById("profile-name-input");
  const taskInput = document.getElementById("profile-task-input");

  const settingShorts = document.getElementById("setting-shorts");
  const settingHomefeed = document.getElementById("setting-homefeed");
  const settingSidebar = document.getElementById("setting-sidebar");
  const settingAutoplay = document.getElementById("setting-autoplay");

  const igReels = document.getElementById("ig-reels");
  const igExplore = document.getElementById("ig-explore");
  const igStories = document.getElementById("ig-stories");
  const igSuggested = document.getElementById("ig-suggested");

  const ttFeed = document.getElementById("tt-feed");
  const ttFollowing = document.getElementById("tt-following");
  const ttLive = document.getElementById("tt-live");
  const ttExplore = document.getElementById("tt-explore");

  const dsEnabled = document.getElementById("ds-enabled");
  const dsVelocity = document.getElementById("ds-velocity");
  const dsSession = document.getElementById("ds-session");
  const dsPills = Array.from(document.querySelectorAll(".ds-pill"));

  const lifetimeLine = document.getElementById("lifetime-line");
  const sessionsLine = document.getElementById("sessions-line");

  let saveToastTimeout = null;
  let selectedSensitivity = 15;
  let shareTextCache = "";

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      const target = item.getAttribute("data-target");
      sections.forEach((s) => s.classList.toggle("active", s.id === target));
      headerSectionTitle.textContent = item.textContent.trim();
    });
  });

  dsPills.forEach((pill) => {
    pill.style.cssText = "background:#1f2332;color:#cbd5e1;border:1px solid #2c3041;border-radius:999px;padding:6px 10px;font-size:12px;cursor:pointer;";
    pill.addEventListener("click", () => {
      selectedSensitivity = Number(pill.dataset.mins);
      syncPills();
      triggerAutoSave();
    });
  });

  await loadDashboardData();

  const listeners = [
    nameInput, taskInput,
    settingShorts, settingHomefeed, settingSidebar, settingAutoplay,
    igReels, igExplore, igStories, igSuggested,
    ttFeed, ttFollowing, ttLive, ttExplore,
    dsEnabled, dsVelocity, dsSession
  ];
  listeners.forEach((el) => el?.addEventListener(el.tagName === "INPUT" && el.type === "text" ? "input" : "change", triggerAutoSave));

  document.getElementById("export-data-btn")?.addEventListener("click", async () => {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get(null)
    ]);
    const blob = new Blob([JSON.stringify({ sync, local }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clearfeed-data.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  const resetModal = document.getElementById("reset-modal");
  document.getElementById("reset-stats-btn")?.addEventListener("click", () => {
    resetModal.classList.add("open");
  });
  document.getElementById("modal-cancel")?.addEventListener("click", () => {
    resetModal.classList.remove("open");
  });
  document.getElementById("modal-confirm")?.addEventListener("click", async () => {
    await chrome.storage.local.set({
      stats: {
        streakDays: 0,
        bestStreak: 0,
        lastActiveDate: null,
        installDate: Date.now(),
        totalElementsRemoved: 0,
        totalMinutesSaved: 0,
        dailyData: {},
        totalExamSessionsCompleted: 0
      }
    });
    resetModal.classList.remove("open");
    flashSaveIndicator();
    loadDashboardData();
  });

  document.getElementById("copy-card-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(shareTextCache).then(() => {
      const copyConfirm = document.getElementById("copy-confirm");
      if (copyConfirm) {
        copyConfirm.style.opacity = "1";
        setTimeout(() => { copyConfirm.style.opacity = "0"; }, 2000);
      }
    });
  });

  async function triggerAutoSave() {
    const profile = { name: nameInput.value.trim(), focusTask: taskInput.value.trim() };
    const settings = {
      removeShorts: settingShorts.checked,
      removeHomefeed: settingHomefeed.checked,
      removeSidebar: settingSidebar.checked,
      removeAutoplay: settingAutoplay.checked
    };

    const platforms = {
      youtube: { enabled: true },
      instagram: {
        enabled: true,
        removeReels: igReels.checked,
        removeExplore: igExplore.checked,
        removeStories: igStories.checked,
        removeSuggested: igSuggested.checked
      },
      tiktok: {
        enabled: true,
        removeFeed: ttFeed.checked && ttFollowing.checked,
        removeLive: ttLive.checked,
        removeExplore: ttExplore.checked
      }
    };

    const existing = await chrome.storage.sync.get("platforms");
    const mergedPlatforms = {
      ...(existing.platforms || {}),
      youtube: { ...(existing.platforms?.youtube || {}), ...(platforms.youtube || {}) },
      instagram: { ...(existing.platforms?.instagram || {}), ...(platforms.instagram || {}) },
      tiktok: { ...(existing.platforms?.tiktok || {}), ...(platforms.tiktok || {}) }
    };

    const doomscroll = {
      enabled: dsEnabled.checked,
      sensitivityMinutes: selectedSensitivity,
      velocityDetection: dsVelocity.checked,
      sessionDurationAlerts: dsSession.checked
    };

    await chrome.storage.sync.set({ profile, settings, platforms: mergedPlatforms, doomscroll });
    flashSaveIndicator();
  }

  async function loadDashboardData() {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(["profile", "settings", "platforms", "doomscroll"]),
      chrome.storage.local.get(["stats"])
    ]);

    const profile = syncData.profile || { name: "", focusTask: "" };
    const settings = syncData.settings || { removeShorts: true, removeHomefeed: true, removeSidebar: true, removeAutoplay: true };
    const platforms = syncData.platforms || {};
    const instagram = platforms.instagram || {};
    const tiktok = platforms.tiktok || {};
    const doomscroll = syncData.doomscroll || {};

    nameInput.value = profile.name || "";
    taskInput.value = profile.focusTask || "";

    settingShorts.checked = settings.removeShorts !== false;
    settingHomefeed.checked = settings.removeHomefeed !== false;
    settingSidebar.checked = settings.removeSidebar !== false;
    settingAutoplay.checked = settings.removeAutoplay !== false;

    igReels.checked = instagram.removeReels !== false;
    igExplore.checked = instagram.removeExplore !== false;
    igStories.checked = instagram.removeStories !== false;
    igSuggested.checked = instagram.removeSuggested !== false;

    const removeFeed = tiktok.removeFeed !== false;
    ttFeed.checked = removeFeed;
    ttFollowing.checked = removeFeed;
    ttLive.checked = tiktok.removeLive !== false;
    ttExplore.checked = tiktok.removeExplore !== false;

    dsEnabled.checked = doomscroll.enabled !== false;
    dsVelocity.checked = doomscroll.velocityDetection !== false;
    dsSession.checked = doomscroll.sessionDurationAlerts !== false;
    selectedSensitivity = Number(doomscroll.sensitivityMinutes || 15);
    syncPills();

    const stats = localData.stats || {};
    const streakDays = stats.streakDays || 0;
    const bestStreak = stats.bestStreak || 0;
    const totalRemoved = stats.totalElementsRemoved || 0;
    const totalHours = ((totalRemoved * 0.5) / 60).toFixed(1);
    const installDate = stats.installDate ? new Date(stats.installDate).toLocaleDateString() : "today";
    const examSessions = stats.totalExamSessionsCompleted || 0;

    const statStreak = document.getElementById("stat-streak");
    const statBest = document.getElementById("stat-best");
    const statHours = document.getElementById("stat-hours");
    if (statStreak) statStreak.textContent = streakDays;
    if (statBest) statBest.textContent = bestStreak;
    if (statHours) statHours.textContent = totalHours;

    if (lifetimeLine) lifetimeLine.textContent = `${totalRemoved.toLocaleString()} elements removed since ${installDate}`;
    if (sessionsLine) sessionsLine.textContent = `${examSessions} Exam Mode sessions completed`;

    const chartEl = document.getElementById("weekly-chart");
    const labelsEl = document.getElementById("weekly-chart-labels");
    if (chartEl && labelsEl) {
      const dailyData = stats.dailyData || {};
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const today = new Date();
      const weekData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        weekData.push({
          label: days[d.getDay() === 0 ? 6 : d.getDay() - 1],
          count: dailyData[key]?.removed || 0,
          isToday: i === 0
        });
      }
      const maxCount = Math.max(...weekData.map((d) => d.count), 1);
      chartEl.innerHTML = "";
      labelsEl.innerHTML = "";
      weekData.forEach((day) => {
        const heightPct = Math.max(4, (day.count / maxCount) * 100);
        const bar = document.createElement("div");
        bar.style.cssText = `flex:1;border-radius:4px 4px 0 0;background:${day.isToday ? "#6366f1" : "#2c3041"};height:${heightPct}%;transition:height 0.4s ease;position:relative;`;
        const countLabel = document.createElement("div");
        countLabel.style.cssText = "position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:#9ca3af;white-space:nowrap;";
        countLabel.textContent = day.count > 0 ? day.count : "";
        bar.appendChild(countLabel);
        chartEl.appendChild(bar);
        const label = document.createElement("div");
        label.style.cssText = `flex:1;text-align:center;font-size:10px;color:${day.isToday ? "#6366f1" : "#9ca3af"};font-weight:${day.isToday ? "700" : "400"};`;
        label.textContent = day.label;
        labelsEl.appendChild(label);
      });
    }

    const shareCardEl = document.getElementById("share-card");
    shareTextCache = `I've reclaimed ${totalHours} hours using ClearFeed 🛡️\n${streakDays} day streak • ${totalRemoved} elements removed\nProtect your attention → clearfeed.app`;
    if (shareCardEl) shareCardEl.textContent = shareTextCache;
  }

  function syncPills() {
    dsPills.forEach((pill) => {
      const isActive = Number(pill.dataset.mins) === selectedSensitivity;
      pill.style.borderColor = isActive ? "#6366f1" : "#2c3041";
      pill.style.color = isActive ? "#fff" : "#cbd5e1";
    });
  }

  function flashSaveIndicator() {
    if (saveToastTimeout) clearTimeout(saveToastTimeout);
    saveIndicator.classList.add("visible");
    saveToastTimeout = setTimeout(() => saveIndicator.classList.remove("visible"), 1200);
  }
});
