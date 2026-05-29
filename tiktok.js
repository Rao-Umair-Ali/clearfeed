(async () => {
  const HOST = "tiktok.com";
  const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  async function getState() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(["platforms", "doomscroll"]),
      chrome.storage.local.get(["doomscroll"])
    ]);
    return { sync, local };
  }

  async function enforceBlockers() {
    try {
      const { sync, local } = await getState();
      if (sync.doomscroll?.enabled === false) return false;
      const cooldownUntil = local.doomscroll?.cooldowns?.[HOST] || 0;
      const softDate = local.doomscroll?.softBlocks?.[HOST] || "";
      const today = toDateKey(new Date());

      if (softDate === today) {
        const o = document.createElement("div");
        o.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Outfit,Arial,sans-serif;";
        o.innerHTML = "<h2>You blocked tiktok.com for today. See you tomorrow. ??</h2>";
        document.documentElement.appendChild(o);
        return true;
      }

      if (cooldownUntil > Date.now()) {
        const o = document.createElement("div");
        o.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Outfit,Arial,sans-serif;";
        o.innerHTML = `
          <div style="width:min(92vw,460px);text-align:center;">
            <h2>Taking a break. Back in <span id=\"cf-tt-count\">00:00</span></h2>
            <div style="height:8px;background:#1f2937;border-radius:999px;overflow:hidden;margin-top:14px;"><div id=\"cf-tt-progress\" style="height:100%;width:100%;background:#6b7280;"></div></div>
            <a href="#" id="cf-tt-escape" style="display:block;margin-top:12px;color:#94a3b8;font-size:12px;">I need it now</a>
          </div>
        `;
        document.documentElement.appendChild(o);

        const duration = Math.max(1, cooldownUntil - Date.now());
        const timer = setInterval(() => {
          const left = cooldownUntil - Date.now();
          const sec = Math.max(0, Math.floor(left / 1000));
          const mm = String(Math.floor(sec / 60)).padStart(2, "0");
          const ss = String(sec % 60).padStart(2, "0");
          const count = o.querySelector("#cf-tt-count");
          const bar = o.querySelector("#cf-tt-progress");
          if (count) count.textContent = `${mm}:${ss}`;
          if (bar) bar.style.width = `${Math.max(0, (left / duration) * 100)}%`;
          if (left <= 0) {
            clearInterval(timer);
            o.remove();
          }
        }, 1000);

        o.querySelector("#cf-tt-escape")?.addEventListener("click", async (e) => {
          e.preventDefault();
          const ok = confirm("This will reset your doomscroll detection for today.");
          if (!ok) return;
          const data = await chrome.storage.local.get("doomscroll");
          const next = { ...(data.doomscroll || {}), cooldowns: { ...(data.doomscroll?.cooldowns || {}) } };
          delete next.cooldowns[HOST];
          await chrome.storage.local.set({ doomscroll: next });
          o.remove();
        });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  const blocked = await enforceBlockers();
  if (blocked) return;

  const syncData = await chrome.storage.sync.get(["platforms", "doomscroll"]);
  const tt = syncData.platforms?.tiktok || { enabled: true, removeFeed: true, removeLive: true, removeExplore: true };
  if (tt.enabled === false) return;

  try {
    const css = `
      [data-e2e="recommend-list-item-container"] { display: ${tt.removeFeed === false ? "" : "none !important"}; }
      [data-e2e="follow-item-container"] { display: ${tt.removeFeed === false ? "" : "none !important"}; }
      [data-e2e="nav-live"] { display: ${tt.removeLive === false ? "" : "none !important"}; }
      [data-e2e="nav-friends"] { display: ${tt.removeExplore === false ? "" : "none !important"}; }
      [data-e2e="explore-item"] { display: ${tt.removeExplore === false ? "" : "none !important"}; }
      .tiktok-x6y88p-DivItemContainerV2 { display: ${tt.removeFeed === false ? "" : "none !important"}; }
    `;
    const style = document.createElement("style");
    style.id = "clearfeed-tiktok";
    style.textContent = css;
    document.head.appendChild(style);
  } catch {}

  try {
    if (tt.removeFeed !== false) {
      setTimeout(() => {
        const hasFeed = document.querySelector('[data-e2e="recommend-list-item-container"], .tiktok-x6y88p-DivItemContainerV2');
        const parent = hasFeed?.parentElement || document.querySelector("main") || document.body;
        if (!parent || document.getElementById("clearfeed-tt-replace")) return;
        const box = document.createElement("div");
        box.id = "clearfeed-tt-replace";
        box.style.cssText = "padding:48px 16px;text-align:center;color:#fff;font-family:Outfit,Arial,sans-serif;";
        box.innerHTML = "<div style='font-size:40px;margin-bottom:8px;'>??</div><div style='font-size:24px;font-weight:700;margin-bottom:8px;'>Feed hidden by ClearFeed</div><div style='color:#94a3b8;'>Search for a specific creator or topic instead</div>";
        parent.prepend(box);
      }, 800);
    }
  } catch {}

  if (syncData.doomscroll?.enabled === false) return;

  let sessionStart = Date.now();
  let levelTriggered = 0;
  let velocityHighCount = 0;
  let lastScrollY = window.scrollY;
  let lastScrollTime = Date.now();

  function pill(msg) {
    try {
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.9);color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;z-index:999999;";
      p.textContent = msg;
      document.documentElement.appendChild(p);
      setTimeout(() => p.remove(), 6000);
    } catch {}
  }

  function level2() {
    try {
      document.documentElement.style.filter = "grayscale(100%)";
      const c = document.createElement("div");
      c.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;background:#111827;color:#fff;border:1px solid #374151;border-radius:14px;padding:18px;width:min(92vw,360px);";
      c.innerHTML = "<div style='margin-bottom:12px;'>Your brain is in scroll mode. Take a breath.</div><div style='display:flex;gap:8px;'><button id='cf-tt-keep' style='flex:1;background:#374151;color:#fff;border:none;border-radius:8px;padding:10px;'>Keep grayscale on</button><button id='cf-tt-done' style='flex:1;background:#6366f1;color:#fff;border:none;border-radius:8px;padding:10px;'>I'm done scrolling</button></div>";
      document.documentElement.appendChild(c);
      c.querySelector("#cf-tt-keep")?.addEventListener("click", () => c.remove());
      c.querySelector("#cf-tt-done")?.addEventListener("click", () => {
        document.documentElement.style.filter = "";
        sessionStart = Date.now();
        velocityHighCount = 0;
        c.remove();
      });
    } catch {}
  }

  function level3(mins) {
    try {
      const o = document.createElement("div");
      o.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;color:#fff;";
      o.innerHTML = `
        <style>@keyframes cfBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}</style>
        <div style="text-align:center;">
          <div id="cf-tt-bt" style="margin-bottom:12px;">Breathe in...</div>
          <div style="width:80px;height:80px;border-radius:50%;background:rgba(99,102,241,0.6);margin:0 auto 16px;animation:cfBreathe 4s ease-in-out infinite;"></div>
          <div style="margin-bottom:16px;">You've been here for ${mins} minutes.</div>
          <button id="cf-tt-break" style="margin-right:8px;background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:10px 12px;">Take a 5-minute break</button>
          <button id="cf-tt-stop" style="background:#1f2937;color:#e5e7eb;border:none;border-radius:8px;padding:10px 12px;">I'm done for today</button>
        </div>
      `;
      document.documentElement.appendChild(o);

      let inOut = true;
      const b = setInterval(() => {
        const t = o.querySelector("#cf-tt-bt");
        if (!t) return;
        inOut = !inOut;
        t.textContent = inOut ? "Breathe in..." : "Breathe out...";
      }, 2000);

      o.querySelector("#cf-tt-break")?.addEventListener("click", async () => {
        const data = await chrome.storage.local.get("doomscroll");
        const next = { ...(data.doomscroll || {}), cooldowns: { ...(data.doomscroll?.cooldowns || {}) } };
        next.cooldowns[HOST] = Date.now() + 5 * 60 * 1000;
        await chrome.storage.local.set({ doomscroll: next });
        clearInterval(b);
        window.location.href = "about:blank";
      });

      o.querySelector("#cf-tt-stop")?.addEventListener("click", async () => {
        const data = await chrome.storage.local.get("doomscroll");
        const next = { ...(data.doomscroll || {}), softBlocks: { ...(data.doomscroll?.softBlocks || {}) } };
        next.softBlocks[HOST] = toDateKey(new Date());
        await chrome.storage.local.set({ doomscroll: next });
        clearInterval(b);
        window.location.href = "about:blank";
      });
    } catch {}
  }

  function trigger(level) {
    if (level <= levelTriggered) return;
    levelTriggered = level;
    const mins = Math.floor((Date.now() - sessionStart) / 60000);
    if (level === 1) pill("You've been scrolling for 15 minutes ??");
    if (level === 2) level2();
    if (level === 3) level3(mins);
  }

  setInterval(() => {
    try {
      const mins = Math.floor((Date.now() - sessionStart) / 60000);
      if (mins >= 45) trigger(3);
      else if (mins >= 30) trigger(2);
      else if (mins >= 15) trigger(1);
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
        if (velocityHighCount > 10) trigger(1);
      });
    } catch {}
  }, { passive: true });
})();
