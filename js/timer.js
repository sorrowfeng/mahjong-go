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

// ── 倒计时（限时模式）─────────────────────────────────────────────────
// 复用同一 setInterval 通道：countdown 开启时计时方向反转（从 budget 往下数）。
// onTimeout 在归零时触发一次（可由此结束限时局）。

let countdownBudget = 0;      // 倒计时总秒数（>0 表示处于倒计时模式）
let countdownElapsed = 0;     // 已消耗秒数
let countdownOnTimeout = null;

// 开始倒计时：从 budget 秒开始倒数，归零时调用 onTimeout（恰好一次）。
function startCountdown(budget, onTimeout) {
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = null;
  const secs = Math.max(1, Math.floor(budget) || 60);
  countdownBudget = secs;
  countdownElapsed = 0;
  countdownOnTimeout = typeof onTimeout === 'function' ? onTimeout : null;
  timerStart = 1; // 占位：countdown 模式不走 getElapsedSeconds 的 now-timerStart 逻辑
  timerPaused = false;
  timerPausedAt = 0;
  renderTimer(secs);
  timerInterval = setInterval(() => {
    countdownElapsed++;
    const remaining = Math.max(0, countdownBudget - countdownElapsed);
    renderTimer(remaining);
    if (remaining <= 0) {
      stopCountdown();
      if (countdownOnTimeout) {
        const cb = countdownOnTimeout;
        countdownOnTimeout = null;
        cb();
      }
    }
  }, 1000);
}

// 当前倒计时剩余秒数（非倒计时模式返回 0）
function getRemainingSeconds() {
  if (countdownBudget <= 0) return 0;
  return Math.max(0, countdownBudget - countdownElapsed);
}

// 停止倒计时并返回剩余秒数（0 表示已耗尽）
function stopCountdown() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const remaining = getRemainingSeconds();
  countdownBudget = 0;
  countdownElapsed = 0;
  countdownOnTimeout = null;
  return remaining;
}

// 暂停/恢复需同时兼容正计时与倒计时：
// 倒计时模式下，暂停时记录当前剩余，恢复时从该值续走。
const _countdownPausedRemaining = { value: 0 };
let _wasCountdown = false;

function _isCountdown() {
  return countdownBudget > 0;
}

// 覆盖 pauseTimer：倒计时模式下记录剩余
const _origPauseTimer = pauseTimer;
pauseTimer = function () {
  if (countdownBudget > 0) {
    if (timerStart <= 0 || timerInterval === null || timerPaused) return;
    timerPaused = true;
    _countdownPausedRemaining.value = getRemainingSeconds();
    clearInterval(timerInterval);
    timerInterval = null;
    _wasCountdown = true;
    return;
  }
  return _origPauseTimer();
};

const _origResumeTimer = resumeTimer;
resumeTimer = function () {
  if (_wasCountdown && countdownBudget > 0) {
    if (!timerPaused) return;
    timerPaused = false;
    // 从暂停时的剩余秒数续走
    const budget = countdownBudget;
    const startRemaining = _countdownPausedRemaining.value;
    // 重建 interval：以"剩余秒数"为起点继续倒数
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      countdownElapsed++;
      const remaining = Math.max(0, countdownBudget - countdownElapsed);
      renderTimer(remaining);
      if (remaining <= 0) {
        stopCountdown();
        if (countdownOnTimeout) {
          const cb = countdownOnTimeout;
          countdownOnTimeout = null;
          cb();
        }
      }
    }, 1000);
    _countdownPausedRemaining.value = 0;
    _wasCountdown = false;
    renderTimer(startRemaining);
    return;
  }
  return _origResumeTimer();
};

// resetTimer 需同步清倒计时状态
const _origResetTimer = resetTimer;
resetTimer = function () {
  countdownBudget = 0;
  countdownElapsed = 0;
  countdownOnTimeout = null;
  _wasCountdown = false;
  _countdownPausedRemaining.value = 0;
  return _origResetTimer();
};

export {
  formatTime, getElapsedSeconds, startTimer, startTimerFromElapsed, stopTimer,
  resetTimer, pauseTimer, resumeTimer,
  startCountdown, getRemainingSeconds, stopCountdown,
};
