(() => {
  if (window.location.protocol === "chrome:") return;
  if (window.__clearfeedTimerLoaded) return;
  window.__clearfeedTimerLoaded = true;

  let intervalId = null;
  let phaseLabel = "Focus";

  const widget = document.createElement("div");
  widget.id = "clearfeed-exam-timer";
  widget.style.position = "fixed";
  widget.style.bottom = "20px";
  widget.style.right = "20px";
  widget.style.zIndex = "2147483647";
  widget.style.width = "180px";
  widget.style.height = "48px";
  widget.style.background = "rgba(10,10,10,0.9)";
  widget.style.color = "#ffffff";
  widget.style.borderRadius = "999px";
  widget.style.fontFamily = "Outfit, Arial, sans-serif";
  widget.style.display = "none";
  widget.style.alignItems = "center";
  widget.style.justifyContent = "center";
  widget.style.flexDirection = "column";
  widget.style.cursor = "pointer";
  widget.style.gap = "2px";
  widget.style.userSelect = "none";
  widget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";

  const timerLine = document.createElement("div");
  timerLine.style.fontSize = "13px";
  timerLine.style.fontWeight = "700";

  const phaseLine = document.createElement("div");
  phaseLine.style.fontSize = "11px";
  phaseLine.style.opacity = "0.85";

  widget.appendChild(timerLine);
  widget.appendChild(phaseLine);

  const root = document.documentElement || document.body;
  root.appendChild(widget);

  widget.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "openPopupHint" });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "examModeUpdated") {
      applyState(message.examMode);
    }
    if (message.type === "clearfeedRemoveTimerWidget") {
      destroyWidget();
    }
  });

  function formatClock(msLeft) {
    const safe = Math.max(0, Math.floor(msLeft / 1000));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function humanPhase(phase) {
    if (phase === "break") return "Break";
    if (phase === "longBreak") return "Break";
    return "Focus";
  }

  function applyState(examMode) {
    if (!examMode || !examMode.active) {
      widget.style.display = "none";
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }

    phaseLabel = humanPhase(examMode.pomodoroPhase);
    widget.style.display = "flex";

    if (intervalId) clearInterval(intervalId);

    const tick = () => {
      const msLeft = (examMode.startTime + examMode.durationMinutes * 60 * 1000) - Date.now();
      timerLine.textContent = `? ${formatClock(msLeft)} remaining`;
      phaseLine.textContent = phaseLabel;
      if (msLeft <= 0 && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    tick();
    intervalId = setInterval(tick, 1000);
  }

  function destroyWidget() {
    if (intervalId) clearInterval(intervalId);
    if (widget && widget.parentNode) widget.parentNode.removeChild(widget);
    window.__clearfeedTimerLoaded = false;
  }

  chrome.runtime.sendMessage({ type: "getExamStatus" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.ok) applyState(response.examMode);
  });
})();
