(async () => {
  const HOST = "instagram.com";

  const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  async function getState() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(["platforms", "doomscroll"]),
      chrome.storage.local.get(["doomscroll"])
    ]);
    return { sync, local };
  }

  function parseRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function clearfeedOverlay(html, allowEscape, onEscape) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Outfit,Arial,sans-serif;";
    overlay.innerHTML = `<div style="width:min(92vw,460px);text-align:center;">${html}</div>`;
    if (allowEscape) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "I need it now";
      link.style.cssText = "display:block;margin-top:16px;color:#94a3b8;font-size:12px;";
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        const ok = confirm("This will reset your doomscroll detection for today.");
        if (!ok) return;
        await onEscape();
        overlay.remove();
      });
      overlay.querySelector("div")?.appendChild(link);
    }
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  async function enforceCooldownOrSoftBlock() {
    try {
      const { sync, local } = await getState();
      const dsSync = sync.doomscroll || {};
      const dsLocal = local.doomscroll || {};

      if (dsSync.enabled === false) return false;

      const cooldownUntil = dsLocal.cooldowns?.[HOST] || 0;
      const softDate = dsLocal.softBlocks?.[HOST] || "";
      const today = toDateKey(new Date());

      if (softDate === today) {
        clearfeedOverlay(`<h2 style="margin:0 0 8px;">You blocked instagram.com for today. See you tomorrow. 👋</h2>`, false);
        return true;
      }

      if (cooldownUntil > Date.now()) {
        const overlay = clearfeedOverlay(`
          <h2 style="margin:0 0 10px;">Taking a break. Back in <span id=\"cf-ig-cool\">${parseRemaining(cooldownUntil - Date.now())}</span></h2>
          <div style="height:8px;background:#1f2937;border-radius:999px;overflow:hidden;margin-top:16px;">
            <div id=\"cf-ig-progress\" style="height:100%;width:100%;background:#6b7280;"></div>
          </div>
        `, true, async () => {
          const latest = await chrome.storage.local.get("doomscroll");
          const next = { ...(latest.doomscroll || {}), cooldowns: { ...(latest.doomscroll?.cooldowns || {}) } };
          delete next.cooldowns[HOST];
          await chrome.storage.local.set({ doomscroll: next });
        });

        const duration = Math.max(1, cooldownUntil - Date.now());
        const timer = setInterval(() => {
          const left = cooldownUntil - Date.now();
          const leftEl = overlay.querySelector("#cf-ig-cool");
          const barEl = overlay.querySelector("#cf-ig-progress");
          if (leftEl) leftEl.textContent = parseRemaining(left);
          if (barEl) barEl.style.width = `${Math.max(0, (left / duration) * 100)}%`;
          if (left <= 0) {
            clearInterval(timer);
            overlay.remove();
          }
        }, 1000);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  const blocked = await enforceCooldownOrSoftBlock();
  if (blocked) return;

  const syncData = await chrome.storage.sync.get(["platforms", "doomscroll"]);
  const ig = syncData.platforms?.instagram || { enabled: true, removeReels: true, removeExplore: true, removeStories: true, removeSuggested: true };
  if (ig.enabled === false) return;

  try {
    // Narrow selectors only — avoid [role="menubar"], [data-visualcompletion],
    // and obfuscated classes (._aa_t, ._aav0) which hide the left nav and post actions.
    const css = `
      nav a[href="/reels/"],
      nav a[href^="/reels/"],
      a[href="/reels/"]:not(main a),
      [aria-label="Reels"] {
        display: ${ig.removeReels === false ? "revert" : "none !important"};
      }
      nav a[href="/explore/"],
      nav a[href^="/explore/"],
      a[href="/explore/"]:not(main a) {
        display: ${ig.removeExplore === false ? "revert" : "none !important"};
      }
      main[role="main"] > div > div:first-child:has(a[href*="/stories/"]),
      main[role="main"] > div > div:first-child:has(ul li a[href*="/stories/"]) {
        display: ${ig.removeStories === false ? "revert" : "none !important"};
      }
    `;
    const style = document.createElement("style");
    style.id = "clearfeed-instagram";
    style.textContent = css;
    document.head.appendChild(style);
  } catch {}

  function hideSuggestedBlocks() {
    if (ig.removeSuggested === false) return;
    try {
      const headings = ["Suggested for you", "Suggested posts"];
      document.querySelectorAll("main span, main h2, main h3, main div, aside span, aside h2").forEach((el) => {
        if (el.dataset.cfHidden) return;
        const text = (el.textContent || "").trim();
        if (!headings.includes(text)) return;

        let block = el.parentElement;
        for (let i = 0; i < 10 && block; i++) {
          const tag = block.tagName?.toLowerCase();
          if (tag === "aside" || (tag === "main" && block !== document.querySelector("main"))) {
            block.style.setProperty("display", "none", "important");
            block.dataset.cfHidden = "1";
            break;
          }
          if (tag === "article" || block.getAttribute("role") === "presentation") {
            const section = block.parentElement;
            if (section) {
              section.style.setProperty("display", "none", "important");
              section.dataset.cfHidden = "1";
            }
            break;
          }
          block = block.parentElement;
        }
      });
    } catch {}
  }

  function refreshSurgicalHides() {
    hideSuggestedBlocks();
  }

  function handleInstagramNavigation(url) {
    try {
      if (ig.removeReels !== false && url.includes("/reels/")) {
        document.body.innerHTML = "<div style='min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Outfit,Arial,sans-serif;color:#fff;background:#0f0f0f;font-size:24px;'>Reels are hidden. Go to DMs →</div>";
      } else if (ig.removeExplore !== false && url.includes("/explore/")) {
        document.body.innerHTML = "<div style='min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Outfit,Arial,sans-serif;color:#fff;background:#0f0f0f;font-size:24px;'>Explore is hidden to protect your attention. Go to your feed →</div>";
      }
    } catch {}
  }

  try {
    let lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleInstagramNavigation(location.href);
        refreshSurgicalHides();
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
    handleInstagramNavigation(location.href);
    refreshSurgicalHides();
    setTimeout(refreshSurgicalHides, 1500);
    setTimeout(refreshSurgicalHides, 4000);
  } catch {}

  let suggestedDebounce = null;
  try {
    const feedObserver = new MutationObserver(() => {
      if (suggestedDebounce) clearTimeout(suggestedDebounce);
      suggestedDebounce = setTimeout(refreshSurgicalHides, 400);
    });
    feedObserver.observe(document.body, { childList: true, subtree: true });
  } catch {}

  if (syncData.doomscroll?.enabled === false) return;

  let sessionStart = Date.now();
  let levelTriggered = 0;
  let velocityHighCount = 0;
  let lastScrollY = window.scrollY;
  let lastScrollTime = Date.now();

  function showPill(msg) {
    try {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.9);color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;z-index:999999;font-family:Outfit,Arial,sans-serif;";
      el.textContent = msg;
      document.documentElement.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    } catch {}
  }

  function level2Card() {
    try {
      document.documentElement.style.filter = "grayscale(100%)";
      const card = document.createElement("div");
      card.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;background:#111827;color:#fff;border:1px solid #374151;border-radius:14px;padding:18px;width:min(92vw,360px);font-family:Outfit,Arial,sans-serif;";
      card.innerHTML = `
        <div style="margin-bottom:12px;font-size:14px;">Your brain is in scroll mode. Take a breath.</div>
        <div style="display:flex;gap:8px;">
          <button id="cf-ig-keep" style="flex:1;background:#374151;color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;">Keep grayscale on</button>
          <button id="cf-ig-done" style="flex:1;background:#6366f1;color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;">I'm done scrolling</button>
        </div>
      `;
      document.documentElement.appendChild(card);
      card.querySelector("#cf-ig-keep")?.addEventListener("click", () => card.remove());
      card.querySelector("#cf-ig-done")?.addEventListener("click", () => {
        document.documentElement.style.filter = "";
        sessionStart = Date.now();
        velocityHighCount = 0;
        card.remove();
      });
    } catch {}
  }

  function level3Overlay(minutes) {
    try {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Outfit,Arial,sans-serif;";
      overlay.innerHTML = `
        <style>@keyframes cfBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}</style>
        <div style="text-align:center;">
          <div id="cf-breath-txt" style="margin-bottom:12px;">Breathe in...</div>
          <div style="width:80px;height:80px;border-radius:50%;background:rgba(99,102,241,0.6);margin:0 auto 16px;animation:cfBreathe 4s ease-in-out infinite;"></div>
          <div style="margin-bottom:16px;">You've been here for ${minutes} minutes.</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button id="cf-ig-break" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:10px 12px;cursor:pointer;">Take a 5-minute break</button>
            <button id="cf-ig-today" style="background:#1f2937;color:#e5e7eb;border:none;border-radius:8px;padding:10px 12px;cursor:pointer;">I'm done for today</button>
          </div>
        </div>
      `;
      document.documentElement.appendChild(overlay);

      let breatheIn = true;
      const breathTimer = setInterval(() => {
        const t = overlay.querySelector("#cf-breath-txt");
        if (!t) return;
        breatheIn = !breatheIn;
        t.textContent = breatheIn ? "Breathe in..." : "Breathe out...";
      }, 2000);

      overlay.querySelector("#cf-ig-break")?.addEventListener("click", async () => {
        const data = await chrome.storage.local.get("doomscroll");
        const next = { ...(data.doomscroll || {}), cooldowns: { ...(data.doomscroll?.cooldowns || {}) } };
        next.cooldowns[HOST] = Date.now() + 5 * 60 * 1000;
        await chrome.storage.local.set({ doomscroll: next });
        clearInterval(breathTimer);
        window.location.href = "about:blank";
      });

      overlay.querySelector("#cf-ig-today")?.addEventListener("click", async () => {
        const data = await chrome.storage.local.get("doomscroll");
        const next = { ...(data.doomscroll || {}), softBlocks: { ...(data.doomscroll?.softBlocks || {}) } };
        next.softBlocks[HOST] = toDateKey(new Date());
        await chrome.storage.local.set({ doomscroll: next });
        clearInterval(breathTimer);
        window.location.href = "about:blank";
      });
    } catch {}
  }

  function triggerLevel(level) {
    if (level <= levelTriggered) return;
    levelTriggered = level;
    const mins = Math.floor((Date.now() - sessionStart) / 60000);

    if (level === 1) showPill("You've been scrolling for 15 minutes 👀");
    if (level === 2) level2Card();
    if (level === 3) level3Overlay(mins);
  }

  setInterval(() => {
    try {
      const mins = Math.floor((Date.now() - sessionStart) / 60000);
      if (mins >= 45) triggerLevel(3);
      else if (mins >= 30) triggerLevel(2);
      else if (mins >= 15) triggerLevel(1);
    } catch {}
  }, 60000);

  window.addEventListener("scroll", () => {
    try {
      requestAnimationFrame(() => {
        const now = Date.now();
        const dy = Math.abs(window.scrollY - lastScrollY);
        const dt = (now - lastScrollTime) / 1000;
        if (dt <= 0) return;
        const scrollVelocity = dy / dt;
        lastScrollY = window.scrollY;
        lastScrollTime = now;
        if (scrollVelocity > 400) velocityHighCount += 1;
        if (velocityHighCount > 10) triggerLevel(1);
      });
    } catch {}
  }, { passive: true });
})();
