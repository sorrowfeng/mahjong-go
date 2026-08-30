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
// 配色与游戏"木韵/翡翠"主题统一：翡翠绿强调 + 金色点缀 + 米色面板。
function drawScoreCard(info, palette = {
  bgTop: '#eef4ef',
  bgBottom: '#dce9e1',
  panel: '#fbfdfb',
  accent: '#2b8564',
  accentDeep: '#1d624c',
  gold: '#d2a33a',
  text: '#1b332a',
  muted: '#62746c',
}) {
  const W = 560, H = 340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const R = 18; // 卡片圆角

  // 背景：径向柔光 + 垂直渐变（呼应页面 body 背景）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, R);
  ctx.fill();

  // 顶部翡翠主题条（带金色细线点缀）
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, palette.accentDeep);
  topGrad.addColorStop(0.55, palette.accent);
  topGrad.addColorStop(1, palette.accentDeep);
  ctx.fillStyle = topGrad;
  roundRect(ctx, 0, 0, W, 10, { tl: R, tr: R, bl: 0, br: 0 });
  ctx.fill();
  ctx.fillStyle = palette.gold;
  ctx.fillRect(0, 10, W, 2);

  // 中央分数面板（浅色卡片，浮起感）
  ctx.fillStyle = palette.panel;
  roundRect(ctx, 40, 96, W - 80, 150, 14);
  ctx.fill();
  // 面板描边
  ctx.strokeStyle = 'rgba(43,133,100,0.28)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 40, 96, W - 80, 150, 14);
  ctx.stroke();

  const cx = W / 2;

  // 标题（渐变文字：翡翠 → 深绿，与游戏标题一致）
  const scope = info.levelId != null ? `关卡 ${info.levelId}` : (info.modeName || '经典模式');
  const title = `麻将消消乐 · ${scope}`;
  ctx.save();
  ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
  const titleW = ctx.measureText(title).width;
  const titleGrad = ctx.createLinearGradient(cx - titleW / 2, 0, cx + titleW / 2, 0);
  titleGrad.addColorStop(0, '#2f9a73');
  titleGrad.addColorStop(1, '#1a5a47');
  ctx.fillStyle = titleGrad;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, 52);
  ctx.restore();

  // 星级（金色）
  if (info.stars) {
    ctx.fillStyle = palette.gold;
    ctx.font = '34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★'.repeat(info.stars) + '☆'.repeat(3 - info.stars), cx, 88);
  }

  // 得分（大号，翡翠色）+ 标签
  if (info.score != null) {
    ctx.fillStyle = palette.accentDeep;
    ctx.font = 'bold 58px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(info.score), cx, 182);
    ctx.fillStyle = palette.muted;
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillText('得　分', cx, 208);
  }

  // 用时 / 步数 / 提示（居中排布，浅色分隔）
  ctx.fillStyle = palette.text;
  ctx.font = '19px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const metaParts = [];
  metaParts.push(`用时 ${_fmtClock(info.elapsed)}`);
  metaParts.push(`步数 ${info.moves}`);
  if (info.hints) metaParts.push(`提示 ${info.hints}`);
  ctx.fillText(metaParts.join('　·　'), cx, 262);

  // 底部标签
  ctx.fillStyle = palette.muted;
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText(info.date || new Date().toLocaleDateString('zh-CN'), cx, 306);

  // 底部金线点缀
  ctx.fillStyle = palette.gold;
  roundRect(ctx, W / 2 - 40, 322, 80, 3, 2);
  ctx.fill();

  return canvas;
}

// canvas 圆角路径工具（支持四角统一或单个角覆盖）
function roundRect(ctx, x, y, w, h, r) {
  const o = typeof r === 'number'
    ? { tl: r, tr: r, br: r, bl: r }
    : { tl: r?.tl ?? 0, tr: r?.tr ?? 0, br: r?.br ?? 0, bl: r?.bl ?? 0 };
  ctx.beginPath();
  ctx.moveTo(x + o.tl, y);
  ctx.lineTo(x + w - o.tr, y);
  ctx.arcTo(x + w, y, x + w, y + o.tr, o.tr);
  ctx.lineTo(x + w, y + h - o.br);
  ctx.arcTo(x + w, y + h, x + w - o.br, y + h, o.br);
  ctx.lineTo(x + o.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - o.bl, o.bl);
  ctx.lineTo(x, y + o.tl);
  ctx.arcTo(x, y, x + o.tl, y, o.tl);
  ctx.closePath();
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
