// timer.js — 独立计时器（供 gameController 与 tutorial 共用）
//
// 从 gameController 抽出，消除 gameController ↔ tutorial 的循环依赖：
// 两边都只 import timer.js，互不引用。

function formatTime(secs) {
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

let timerInterval = null;
let timerStart = 0;
let timerElapsed = 0;
let timerPaused = false;
let timerPausedAt = 0;

function getElapsedSeconds(now = Date.now()) {
  if (timerStart <= 0) return timerElapsed;
  const elapsed = Math.floor((now - timerStart) / 1000);
  return Math.max(0, elapsed);
}

function renderTimer(secs = getElapsedSeconds()) {
  const el = document.getElementById('game-timer');
  if (el) el.textContent = formatTime(secs);
}

function startTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  timerStart = Date.now();
  timerElapsed = 0;
  timerPaused = false;
  timerPausedAt = 0;
  renderTimer(0);
  timerInterval = setInterval(() => {
    renderTimer();
  }, 1000);
}

// 从已累积的秒数继续计时（存档恢复用）
function startTimerFromElapsed(elapsed) {
  if (timerInterval !== null) clearInterval(timerInterval);
  const secs = Math.max(0, Math.floor(elapsed) || 0);
  timerStart = Date.now() - secs * 1000;
  timerElapsed = secs;
  timerPaused = false;
  timerPausedAt = 0;
  renderTimer(secs);
  timerInterval = setInterval(() => {
    renderTimer();
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerElapsed = getElapsedSeconds(timerPaused ? timerPausedAt : Date.now());
  timerStart = 0;
  timerPaused = false;
  timerPausedAt = 0;
  return timerElapsed;
}

function resetTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerStart = 0;
  timerElapsed = 0;
  timerPaused = false;
  timerPausedAt = 0;
  renderTimer(0);
}

// 暂停/恢复计时器（覆盖层显示时调用）
function pauseTimer() {
  if (timerStart <= 0 || timerInterval === null || timerPaused) return;
  timerPaused = true;
  timerPausedAt = Date.now();
  timerElapsed = getElapsedSeconds(timerPausedAt);
  clearInterval(timerInterval);
  timerInterval = null;
}

function resumeTimer() {
  if (!timerPaused || timerStart <= 0) return;
  timerPaused = false;
  // 补偿暂停的时间差
  const pausedDuration = Date.now() - timerPausedAt;
  timerStart += pausedDuration;
  timerPausedAt = 0;
  renderTimer();
  timerInterval = setInterval(() => {
    renderTimer();
  }, 1000);
}

export { formatTime, getElapsedSeconds, startTimer, startTimerFromElapsed, stopTimer, resetTimer, pauseTimer, resumeTimer };
