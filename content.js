// content.js - Primary content script for surgical element blocking and homepage replacement on YouTube.

let observer = null;
let debounceTimeout = null;
let quoteInterval = null;

const quotes = [
  "\"Deep work is the superpower of the 21st century.\" — Cal Newport",
  "\"Focus is a muscle, and you build it by choosing what to ignore.\" — Unknown",
  "\"Your attention is your most valuable asset. Protect it.\" — Unknown",
  "\"Stop scrolling. Start creating.\" — Unknown",
  "\"The successful warrior is the average man, with laser-like focus.\" — Bruce Lee",
  "\"What you focus on grows. Choose wisely.\" — Unknown",
  "\"Starve your distractions, feed your focus.\" — Unknown",
  "\"Focus on being productive instead of busy.\" — Tim Ferriss",
  "\"Where attention goes, energy flows and results show.\" — Tony Robbins",
  "\"Focus is a matter of deciding what things you're not going to do.\" — John Carmack"
];

// Injected CSS Styles for the Distraction-Free Replacement Screen
const customCSS = `
#clearfeed-homepage-replacer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 75vh;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 24px;
  box-sizing: border-box;
  text-align: center;
  font-family: "Outfit", "Roboto", "Arial", sans-serif;
  color: var(--yt-spec-text-primary, #0f0f0f);
  animation: cfFadeIn 0.3s ease-out;
}

html[dark] #clearfeed-homepage-replacer {
  color: var(--yt-spec-text-primary, #f1f1f1);
}

@keyframes cfFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.clearfeed-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.clearfeed-header {
  margin-bottom: 8px;
}

.clearfeed-title {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

html[dark] .clearfeed-title {
  background: linear-gradient(135deg, #818cf8, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.clearfeed-subtitle {
  font-size: 12px;
  color: #606060;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: 700;
}

html[dark] .clearfeed-subtitle {
  color: #aaa;
}

.clearfeed-task-card {
  background: #f8f9fa;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border: 1px solid #e9ecef;
  transition: all 0.2s ease;
}

html[dark] .clearfeed-task-card {
  background: #0f0f0f;
  border-color: #2d2d2d;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.clearfeed-task-label {
  font-size: 11px;
  font-weight: 700;
  color: #888;
  letter-spacing: 1.5px;
}

.clearfeed-task-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

.clearfeed-task-text {
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 8px;
  transition: all 0.2s;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border: 1px dashed transparent;
}

.clearfeed-task-text:hover {
  background: #e9ecef;
  border-color: #ced4da;
}

html[dark] .clearfeed-task-text:hover {
  background: #222;
  border-color: #444;
}

.clearfeed-task-text.empty {
  color: #888;
  font-style: italic;
}

.clearfeed-task-field {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  width: 100%;
  padding: 6px 16px;
  border: 2px solid #6366f1;
  border-radius: 8px;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
}

.clearfeed-search-section {
  width: 100%;
}

.clearfeed-search-bar {
  display: flex;
  height: 44px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  border: 1px solid #ccc;
  border-radius: 40px;
  overflow: hidden;
  background: #fff;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

html[dark] .clearfeed-search-bar {
  border-color: #303030;
  background: #121212;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
}

.clearfeed-search-bar:focus-within {
  border-color: #065fd4;
  box-shadow: 0 0 8px rgba(6, 95, 212, 0.15);
}

html[dark] .clearfeed-search-bar:focus-within {
  border-color: #3ea6ff;
  box-shadow: 0 0 8px rgba(62, 166, 255, 0.15);
}

.clearfeed-search-input-wrapper {
  flex: 1;
  padding: 0 20px;
  display: flex;
  align-items: center;
}

.clearfeed-search-bar input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 16px;
  font-family: inherit;
}

.clearfeed-search-btn {
  width: 64px;
  background: #f8f8f8;
  border: none;
  border-left: 1px solid #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
}

html[dark] .clearfeed-search-btn {
  background: #222;
  border-left-color: #303030;
}

.clearfeed-search-btn:hover {
  background: #f0f0f0;
}

html[dark] .clearfeed-search-btn:hover {
  background: #2b2b2b;
}

.clearfeed-search-icon {
  width: 20px;
  height: 20px;
  fill: #0f0f0f;
}

html[dark] .clearfeed-search-icon {
  fill: #fff;
}

.clearfeed-quote-card {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clearfeed-quote {
  font-size: 13.5px;
  color: #606060;
  font-style: italic;
  margin: 0;
  line-height: 1.6;
  transition: opacity 0.25s ease-in-out;
}

html[dark] .clearfeed-quote {
  color: #aaa;
}

.clearfeed-stats-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  padding: 8px 18px;
  border-radius: 30px;
  font-size: 13px;
  font-weight: 600;
  margin: 0 auto;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

html[dark] .clearfeed-stats-badge {
  background: rgba(129, 140, 248, 0.08);
  color: #818cf8;
  border-color: rgba(129, 140, 248, 0.15);
}
`;

// Helper: Formats Date objects as YYYY-MM-DD
function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper to dynamically apply and update global stylesheet for instant browser-level hiding
function updateGlobalStyles(settings) {
  let styleEl = document.getElementById("clearfeed-global-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "clearfeed-global-styles";
    document.head.appendChild(styleEl);
  }

  let css = "";
  if (settings.removeShorts) {
    css += `
      ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
      ytd-rich-section-renderer:has(ytd-reel-shelf-renderer),
      ytd-rich-shelf-renderer[is-shorts],
      ytd-reel-shelf-renderer,
      ytd-guide-entry-renderer[entry-id="FEshorts"],
      ytd-guide-entry-renderer:has(a[href*="/shorts"]),
      ytd-guide-entry-renderer:has(a[title*="Shorts"]),
      ytd-guide-entry-renderer a[href*="/shorts"],
      ytd-guide-entry-renderer a[title*="Shorts"],
      ytd-mini-guide-entry-renderer[entry-id="FEshorts"],
      ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[title*="Shorts"]),
      ytd-mini-guide-entry-renderer a[href*="/shorts"],
      ytd-mini-guide-entry-renderer a[title*="Shorts"],
      yt-tab-shape[tab-title="Shorts"],
      yt-tab-shape[tab-title*="Shorts"],
      yt-tab-shape:has(div[title*="Shorts"]),
      yt-tab-shape:has(a[href*="/shorts"]),
      tp-yt-paper-tab:has(a[href*="/shorts"]),
      tp-yt-paper-tab:has(div[title*="Shorts"]),
      ytd-video-renderer:has(a[href*="/shorts/"]),
      ytd-rich-item-renderer:has(a[href*="/shorts/"]),
      ytd-grid-video-renderer:has(a[href*="/shorts/"]),
      a[href*="/shorts"],
      a[href="/shorts"],
      a[title*="Shorts"] {
        display: none !important;
      }
    `;
  }
  if (settings.removeSidebar) {
    css += `
      #secondary ytd-watch-next-secondary-results-renderer,
      ytd-watch-next-secondary-results-renderer,
      ytd-live-chat-frame {
        display: none !important;
      }
    `;
  }
  if (settings.removeAutoplay) {
    css += `
      .ytp-autonav-endscreen-upnext-container,
      .ytp-endscreen-content {
        display: none !important;
      }
    `;
  }
  if (settings.removeHomefeed && (window.location.pathname === "/" || window.location.pathname === "/index.html")) {
    css += `
      ytd-browse[page-subtype="home"] #primary ytd-rich-grid-renderer {
        display: none !important;
      }
    `;
  }
  
  styleEl.textContent = css;
}

// Main function to query, block feed items, and inject homepage replacer
async function clearFeedRunner() {
  // Gracefully handle Extension context invalidated when extension is reloaded/updated
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return;
  }

  try {
    const pauseState = await chrome.storage.local.get("examMode");
    const paused = Boolean(pauseState.examMode?.paused && Date.now() < (pauseState.examMode?.pauseUntil || 0));
    if (paused) {
      removeReplacerScreen();
      const styleEl = document.getElementById("clearfeed-global-styles");
      if (styleEl) styleEl.textContent = "";
      return;
    }

    const syncData = await chrome.storage.sync.get(["masterEnabled", "platforms", "settings"]);
    const youtubeEnabled = typeof syncData.platforms?.youtube === "boolean"
      ? syncData.platforms.youtube
      : (syncData.platforms?.youtube?.enabled !== false);
    if (!syncData.masterEnabled || !youtubeEnabled) {
      // Clear replacer screen and quit if protection is disabled
      removeReplacerScreen();
      // Clear global styles
      const styleEl = document.getElementById("clearfeed-global-styles");
      if (styleEl) styleEl.textContent = "";
      return;
    }

    const settings = syncData.settings || {
      removeShorts: true,
      removeHomefeed: true,
      removeSidebar: true,
      removeAutoplay: true
    };

    // Update dynamic CSS rules for instant hiding
    updateGlobalStyles(settings);

    // 1. Surgical element removal wrapped in requestAnimationFrame
    requestAnimationFrame(() => {
      let elementsRemoved = false;

      // Rule 1: Shorts shelf, sidebars & tabs
      if (settings.removeShorts) {
        elementsRemoved |= removeMatchingElements("ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])");
        elementsRemoved |= removeMatchingElements("ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)");
        elementsRemoved |= removeMatchingElements("ytd-rich-shelf-renderer[is-shorts]");
        elementsRemoved |= removeMatchingElements("ytd-reel-shelf-renderer");
        elementsRemoved |= removeMatchingElements("ytd-guide-entry-renderer[entry-id='FEshorts']");
        elementsRemoved |= removeMatchingElements("ytd-guide-entry-renderer:has(a[href*='/shorts'])");
        elementsRemoved |= removeMatchingElements("ytd-mini-guide-entry-renderer[entry-id='FEshorts']");
        elementsRemoved |= removeMatchingElements("ytd-mini-guide-entry-renderer:has(a[href*='/shorts'])");
        elementsRemoved |= removeMatchingElements("yt-tab-shape[tab-title='Shorts']");
        elementsRemoved |= removeMatchingElements("yt-tab-shape[tab-title*='Shorts']");
        elementsRemoved |= removeMatchingElements("yt-tab-shape:has(div[title*='Shorts'])");
        elementsRemoved |= removeMatchingElements("yt-tab-shape:has(a[href*='/shorts'])");
        elementsRemoved |= removeMatchingElements("tp-yt-paper-tab:has(a[href*='/shorts'])");
        elementsRemoved |= removeMatchingElements("tp-yt-paper-tab:has(div[title*='Shorts'])");
        elementsRemoved |= removeMatchingElements("ytd-video-renderer:has(a[href*='/shorts/'])");
        elementsRemoved |= removeMatchingElements("ytd-rich-item-renderer:has(a[href*='/shorts/'])");
        elementsRemoved |= removeMatchingElements("ytd-grid-video-renderer:has(a[href*='/shorts/'])");
        elementsRemoved |= removeMatchingElements("a[href*='/shorts']");
        elementsRemoved |= removeMatchingElements("a[href='/shorts']");

        // Advanced DOM Text & Link checks for absolute bulletproof hiding
        document.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, yt-tab-shape, tp-yt-paper-tab, ytd-guide-entry-link-renderer, a").forEach(el => {
          if (el.dataset.cfRemoved) return;
          const href = el.getAttribute("href") || "";
          const title = el.getAttribute("title") || "";
          const text = (el.textContent || el.innerText || "").trim().toLowerCase();
          
          const isShortsLink = href.includes("/shorts") || href === "/shorts";
          const isShortsText = text === "shorts" || text.startsWith("shorts");
          const isShortsTitle = title.toLowerCase().includes("shorts");

          if (isShortsLink || isShortsText || isShortsTitle) {
            el.dataset.cfRemoved = "true";
            el.style.setProperty("display", "none", "important");
            el.remove();
            elementsRemoved = true;
          }
        });
      }

      // Rule 2 & 5: Sidebar Recommendations and What to Watch next
      if (settings.removeSidebar) {
        elementsRemoved |= removeMatchingElements("#secondary ytd-watch-next-secondary-results-renderer");
        elementsRemoved |= removeMatchingElements("ytd-watch-next-secondary-results-renderer");
      }

      // Rule 3: Autoplay Next Overlay
      if (settings.removeAutoplay) {
        elementsRemoved |= removeMatchingElements(".ytp-autonav-endscreen-upnext-container");
        elementsRemoved |= removeMatchingElements(".ytp-endscreen-content");
      }

      // Rule 4: Homefeed
      if (settings.removeHomefeed && (window.location.pathname === "/" || window.location.pathname === "/index.html")) {
        elementsRemoved |= removeMatchingElements("ytd-browse[page-subtype='home'] #primary ytd-rich-grid-renderer");
      }
      
      if (elementsRemoved) {
        chrome.runtime.sendMessage({ type: "elementRemoved" });
      }
    });

    // 2. Homepage Injection Logic
    if (settings.removeHomefeed && (window.location.pathname === "/" || window.location.pathname === "/index.html")) {
      injectReplacerScreen();
    } else {
      removeReplacerScreen();
    }
  } catch (error) {
    if (error.message && error.message.includes("Extension context invalidated")) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }
    console.error("ClearFeed: Error execution blocker:", error);
  }
}


// Helper to remove elements and signal background service worker
function removeMatchingElements(selector) {
  const elements = document.querySelectorAll(selector);
  let hasChanges = false;
  elements.forEach(el => {
    if (el.dataset.cfRemoved) return;
    el.dataset.cfRemoved = "true";
    el.remove();
    chrome.runtime.sendMessage({ type: "elementRemoved" });
    hasChanges = true;
  });
  return hasChanges;
}

// Injects the custom replacement card if not already on the homepage
async function injectReplacerScreen() {
  const primaryFeedContainer = document.querySelector("ytd-browse[page-subtype='home'] #primary");
  if (!primaryFeedContainer) return;

  if (document.getElementById("clearfeed-homepage-replacer")) {
    // Already injected: just keep updating data values
    await updateReplacementStats();
    return;
  }

  // Inject Stylesheet if not already present
  if (!document.getElementById("clearfeed-injected-styles")) {
    const styleBlock = document.createElement("style");
    styleBlock.id = "clearfeed-injected-styles";
    styleBlock.textContent = customCSS;
    document.head.appendChild(styleBlock);
  }

  // Create replacer structure
  const replacer = document.createElement("div");
  replacer.id = "clearfeed-homepage-replacer";
  replacer.innerHTML = `
    <div class="clearfeed-container">
      <header class="clearfeed-header">
        <h1 id="clearfeed-greeting" class="clearfeed-title">Good day, there</h1>
        <p class="clearfeed-subtitle">Protect your attention.</p>
      </header>

      <div class="clearfeed-task-card">
        <span class="clearfeed-task-label">TODAY'S MAIN FOCUS</span>
        <div class="clearfeed-task-wrapper">
          <div id="clearfeed-task-display" class="clearfeed-task-text empty" tabindex="0">What are you here to do?</div>
          <input type="text" id="clearfeed-task-input" class="clearfeed-task-field" style="display: none;" placeholder="What are you here to do?" maxlength="120" />
        </div>
      </div>

      <div class="clearfeed-search-section">
        <form id="clearfeed-search-form" action="/results" method="get" class="clearfeed-search-bar">
          <div class="clearfeed-search-input-wrapper">
            <input 
              type="text" 
              name="search_query" 
              id="clearfeed-search-input" 
              placeholder="Search YouTube..." 
              autocomplete="off"
              required
            />
          </div>
          <button type="submit" class="clearfeed-search-btn" aria-label="Search">
            <svg viewBox="0 0 24 24" class="clearfeed-search-icon" preserveAspectRatio="xMidYMid meet">
              <g><path d="M20.87,20.17l-5.59-5.59C16.35,13.35,17,11.75,17,10c0-3.87-3.13-7-7-7s-7,3.13-7,7s3.13,7,7,7c1.75,0,3.35-0.65,4.58-1.71 l5.59,5.59L20.87,20.17z M10,16c-3.31,0-6-2.69-6-6s2.69-6,6-6s6,2.69,6,6S13.31,16,10,16z"></path></g>
            </svg>
          </button>
        </form>
      </div>

      <div class="clearfeed-quote-card">
        <p id="clearfeed-quote-text" class="clearfeed-quote"></p>
      </div>

      <div class="clearfeed-stats-badge">
        <div class="clearfeed-stats-icon">⚡</div>
        <div id="clearfeed-stats-value" class="clearfeed-stats-text">You've reclaimed 0.0 hours this week</div>
      </div>
    </div>
  `;

  primaryFeedContainer.appendChild(replacer);
  
  // Set up interaction handlers
  setupTaskFieldHandlers();
  
  // Initialize and rotate quotes
  startQuoteRotation();
  
  // Load data immediately
  await updateReplacementStats();
}

// Removes the injected replacement card from DOM if navigating away
function removeReplacerScreen() {
  const replacer = document.getElementById("clearfeed-homepage-replacer");
  if (replacer) {
    replacer.remove();
  }
  if (quoteInterval) {
    clearInterval(quoteInterval);
    quoteInterval = null;
  }
}

// Set up inline editing for today's main task field
function setupTaskFieldHandlers() {
  const display = document.getElementById("clearfeed-task-display");
  const input = document.getElementById("clearfeed-task-input");
  
  if (!display || !input) return;

  const switchToEdit = () => {
    display.style.display = "none";
    input.style.display = "block";
    input.focus();
    input.select();
  };

  const saveTask = async () => {
    const value = input.value.trim();
    display.style.display = "flex";
    input.style.display = "none";

    try {
      const syncData = await chrome.storage.sync.get("profile");
      const profile = syncData.profile || { name: "", focusTask: "" };
      profile.focusTask = value;
      await chrome.storage.sync.set({ profile });
      
      if (value === "") {
        display.textContent = "What are you here to do?";
        display.classList.add("empty");
      } else {
        display.textContent = value;
        display.classList.remove("empty");
      }
    } catch (e) {
      console.error("ClearFeed: Error saving focus task:", e);
    }
  };

  display.addEventListener("click", switchToEdit);
  display.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      switchToEdit();
    }
  });

  input.addEventListener("blur", saveTask);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      input.value = display.textContent === "What are you here to do?" ? "" : display.textContent;
      input.blur();
    }
  });
}

// Retrieve and load values dynamically onto the replacement screen
async function updateReplacementStats() {
  try {
    const syncData = await chrome.storage.sync.get(["profile"]);
    const localData = await chrome.storage.local.get(["stats"]);

    const name = syncData.profile?.name || "there";
    const focusTask = syncData.profile?.focusTask || "";
    const stats = localData.stats || {};

    // 1. Time-based Greeting
    const hours = new Date().getHours();
    let greetingString = "Good day";
    if (hours < 12) {
      greetingString = "Good morning";
    } else if (hours < 17) {
      greetingString = "Good afternoon";
    } else {
      greetingString = "Good evening";
    }

    const greetingEl = document.getElementById("clearfeed-greeting");
    if (greetingEl) {
      greetingEl.textContent = `${greetingString}, ${name}`;
    }

    // 2. Active Inline Task Display state
    const display = document.getElementById("clearfeed-task-display");
    const input = document.getElementById("clearfeed-task-input");
    if (display && input && document.activeElement !== input) {
      if (focusTask === "") {
        display.textContent = "What are you here to do?";
        display.classList.add("empty");
        input.value = "";
      } else {
        display.textContent = focusTask;
        display.classList.remove("empty");
        input.value = focusTask;
      }
    }

    // 3. Weekly Hours saved badge
    const statsEl = document.getElementById("clearfeed-stats-value");
    if (statsEl) {
      const weeklyRemovedCount = getWeeklyRemoved(stats);
      const hoursSaved = ((weeklyRemovedCount * 0.5) / 60).toFixed(1);
      statsEl.textContent = `You've reclaimed ${hoursSaved} hours this week`;
    }
  } catch (error) {
    console.error("ClearFeed: Error loading replacement screen details:", error);
  }
}

// Helper: Calculate elements blocked in the last 7 days
function getWeeklyRemoved(stats) {
  if (!stats || !stats.dailyRemoved) return 0;
  let sum = 0;
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const dateToCheck = new Date();
    dateToCheck.setDate(today.getDate() - i);
    const dateStr = formatDate(dateToCheck);
    sum += stats.dailyRemoved[dateStr] || 0;
  }
  return sum;
}

// Start focus quote rotation
function startQuoteRotation() {
  if (quoteInterval) clearInterval(quoteInterval);
  
  const quoteEl = document.getElementById("clearfeed-quote-text");
  if (!quoteEl) return;

  let index = Math.floor(Math.random() * quotes.length);
  quoteEl.textContent = quotes[index];

  quoteInterval = setInterval(() => {
    const nextEl = document.getElementById("clearfeed-quote-text");
    if (!nextEl) {
      clearInterval(quoteInterval);
      return;
    }
    index = (index + 1) % quotes.length;
    
    // Smooth transition
    nextEl.style.opacity = 0;
    setTimeout(() => {
      nextEl.textContent = quotes[index];
      nextEl.style.opacity = 1;
    }, 250);
  }, 30000);
}

// Debounced setup for DOM Mutation Observer
function startObserver() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return;
  }

  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      clearFeedRunner().catch(err => {
        if (err.message && err.message.includes("Extension context invalidated")) return;
        console.error("ClearFeed: Error executing MutationObserver tasks:", err);
      });
    }, 50);
  });

  try {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch (e) {
    // Graceful catch for observer issues during tab cleanup
  }
}

// Run blocker and observer initialization
startObserver();
clearFeedRunner().catch(err => {
  if (err.message && err.message.includes("Extension context invalidated")) return;
  console.error("ClearFeed: Error initializing blocker runner:", err);
});

// YouTube custom event listeners for SPA dynamic transitions
window.addEventListener("yt-navigate-finish", () => {
  clearFeedRunner().catch(err => {
    if (err.message && err.message.includes("Extension context invalidated")) return;
    console.error("ClearFeed: Navigation update execution failed:", err);
  });
  startObserver();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "pauseStateChanged" && message.paused) {
    removeReplacerScreen();
    const styleEl = document.getElementById("clearfeed-global-styles");
    if (styleEl) styleEl.textContent = "";
  }
});
