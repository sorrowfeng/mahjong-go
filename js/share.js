// share.js — 通关/结算成绩分享
//
// 生成两种分享载体：
//  1. 文本成绩单（Web Share API 优先，Clipboard API 兜底）
//  2. 成绩卡片 PNG（Canvas 绘制，可下载）
//
// 纯逻辑部分（buildShareText）不依赖 DOM，便于测试。

// 构造分享文本。
// info: { modeName, levelId?, elapsed, moves, hints, score?, stars?, date }
function buildShareText(info) {
  const lines = [];
  const scope = info.levelId != null ? `关卡 ${info.levelId}` : (info.modeName || '经典模式');
  lines.push(`我在麻将消消乐「${scope}」${info.stars ? '拿到 ' + '★'.repeat(info.stars) : '通关'}！`);
  if (info.score != null) lines.push(`得分：${info.score}`);
  lines.push(`用时：${info.elapsed} · 步数：${info.moves} 步${info.hints ? ` · 提示 ${info.hints} 次` : ''}`);
  lines.push(`#麻将消消乐 #${info.modeName || '经典'}`);
  return lines.join('\n');
}

function _fmtClock(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return h === '00' ? `${m}:${ss}` : `${h}:${m}:${ss}`;
}

// 分享文本：优先系统分享（Web Share），回退剪贴板。
// 返回 Promise<{ method: 'web-share'|'clipboard'|'unsupported' }>
async function shareText(text) {
  // 系统分享仅在有意义时使用：需 https/本地安全上下文，且用户手势调用。
  // 桌面浏览器弹系统分享框可能让玩家困惑，这里限定移动端（触屏）才优先走 Web Share，
  // 其余统一用剪贴板（反馈最明确、最可靠）。
  const isTouch = typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  if (isTouch && navigator.share && navigator.canShare) {
    try {
      await navigator.share({ text });
      return { method: 'web-share' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'aborted' };
      // 其他错误回退剪贴板
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard' };
    } catch (e) {
      // 剪贴板 API 在部分环境需用户授权；降级用 execCommand 兜底
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) return { method: 'clipboard' };
      } catch (_) { /* ignore */ }
    }
  }
  return { method: 'unsupported' };
}

// 生成成绩卡片 Canvas（不加入 DOM），返回 canvas。
// 用于导出 PNG 或分享。info 同 buildShareText，另加 palette。
function drawScoreCard(info, palette = { bg: '#f4f1e8', accent: '#c45a3c', text: '#3a3a3a' }) {
  const W = 560, H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 背景
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部主题条
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, W, 8);

  // 标题
  ctx.fillStyle = palette.text;
  ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const scope = info.levelId != null ? `关卡 ${info.levelId}` : (info.modeName || '经典模式');
  ctx.fillText(`麻将消消乐 · ${scope}`, W / 2, 64);

  // 星级
  if (info.stars) {
    ctx.font = '40px sans-serif';
    ctx.fillText('★'.repeat(info.stars) + '☆'.repeat(3 - info.stars), W / 2, 116);
  }

  // 得分
  if (info.score != null) {
    ctx.fillStyle = palette.accent;
    ctx.font = 'bold 56px "Microsoft YaHei", sans-serif';
    ctx.fillText(String(info.score), W / 2, 182);
    ctx.fillStyle = palette.text;
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText('得分', W / 2, 202);
  }

  // 用时 / 步数 / 提示
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText(`用时 ${_fmtClock(info.elapsed)} · 步数 ${info.moves}${info.hints ? ` · 提示 ${info.hints}` : ''}`, W / 2, 244);

  // 日期
  ctx.fillStyle = '#8a8a8a';
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText(info.date || new Date().toLocaleDateString('zh-CN'), W / 2, 282);

  return canvas;
}

// 触发下载成绩卡片 PNG
function downloadCard(canvas, filename = 'mahjong-score.png') {
  try {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
    return true;
  } catch (e) {
    return false;
  }
}

export { buildShareText, shareText, drawScoreCard, downloadCard, _fmtClock };
