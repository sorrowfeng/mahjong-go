#!/usr/bin/env node
// build.js — 一键打包脚本
// 用法: node build.js
// 输出: dist/麻将消消乐.exe

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── 配置 ─────────────────────────────────────────────────────────────────────

const APP_NAME    = '麻将消消乐';
const WIN_WIDTH   = 1280;
const WIN_HEIGHT  = 860;
const PAKE_DIR    = path.join(
  process.env.APPDATA,
  'npm/node_modules/pake-cli'
);
const TAURI_DIR   = path.join(PAKE_DIR, 'src-tauri');
const DIST_SRC    = path.join(TAURI_DIR, 'dist');       // Tauri frontendDist
const ICON_SRC    = path.resolve(__dirname, 'assets/icon.ico');
const ICON_DEST   = path.join(TAURI_DIR, `png/${APP_NAME}_256.ico`);
const GAME_FILES  = ['index.html', 'css', 'js', 'assets'];
const OUTPUT_EXE  = path.join(
  TAURI_DIR,
  'target/x86_64-pc-windows-msvc/release',
  `pake-${APP_NAME}.exe`
);
const DEST_EXE    = path.resolve(__dirname, `dist/${APP_NAME}.exe`);

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✔ ${msg}`); }
function fail(msg) { console.error(`  ✘ ${msg}`); process.exit(1); }

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir))
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── 步骤 ──────────────────────────────────────────────────────────────────────

// 1. 检查依赖
log('检查环境');
if (!fs.existsSync(PAKE_DIR)) fail('未找到 pake-cli，请先运行: npm install -g pake-cli');
const cargoBin = path.join(process.env.USERPROFILE, '.cargo/bin');
process.env.PATH = `${process.env.PATH};${cargoBin}`;
ok('pake-cli 已就绪');

// 2. 复制图标
log('复制图标');
if (!fs.existsSync(ICON_SRC)) fail(`未找到图标文件: ${ICON_SRC}`);
fs.copyFileSync(ICON_SRC, ICON_DEST);
ok(`图标 → ${ICON_DEST}`);

// 3. 同步游戏文件到 Tauri dist
log('同步游戏文件');
rmDir(DIST_SRC);
fs.mkdirSync(DIST_SRC, { recursive: true });
for (const item of GAME_FILES) {
  const src = path.resolve(__dirname, item);
  const dest = path.join(DIST_SRC, item);
  if (!fs.existsSync(src)) { console.warn(`  ! 跳过不存在的: ${item}`); continue; }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) copyDir(src, dest);
  else fs.copyFileSync(src, dest);
  ok(item);
}

// 4. 写 pake.json
log('写入 pake.json');
const pakeJson = {
  windows: [{
    url: 'index.html',
    url_type: 'local',
    hide_title_bar: false,
    fullscreen: false,
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    resizable: true,
    always_on_top: false,
    dark_mode: false,
    activation_shortcut: '',
    disabled_web_shortcuts: false,
    hide_on_close: false,
    incognito: false,
    enable_wasm: false,
    enable_drag_drop: false,
    maximize: false,
    start_to_tray: false,
    force_internal_navigation: false,
    new_window: false,
    zoom: 100,
    min_width: WIN_WIDTH,
    min_height: WIN_HEIGHT,
    ignore_certificate_errors: false,
  }],
  user_agent: {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
  system_tray: { macos: false, linux: false, windows: false },
  system_tray_path: `png/${APP_NAME}_256.ico`,
  inject: [],
  proxy_url: '',
  multi_instance: false,
};
fs.writeFileSync(
  path.join(TAURI_DIR, '.pake/pake.json'),
  JSON.stringify(pakeJson, null, 4)
);
ok('.pake/pake.json');

// 5. 写 tauri.conf.json
log('写入 tauri.conf.json');
const tauriConf = {
  productName: APP_NAME,
  identifier: 'com.pake.mahjong',
  version: '1.0.0',
  app: {
    withGlobalTauri: true,
    security: { headers: {}, csp: null },
  },
  build: { frontendDist: 'dist' },
  bundle: {
    icon: [`png/${APP_NAME}_256.ico`],
    active: true,
    resources: [`png/${APP_NAME}_256.ico`],
    targets: ['nsis'],
    windows: {
      digestAlgorithm: 'sha256',
      nsis: { languages: ['SimpChinese'], displayLanguageSelector: false },
    },
  },
  mainBinaryName: `pake-${APP_NAME}`,
};
fs.writeFileSync(
  path.join(TAURI_DIR, '.pake/tauri.conf.json'),
  JSON.stringify(tauriConf, null, 4)
);
ok('.pake/tauri.conf.json');

// 6. Cargo 构建
log('编译 (cargo build)...');
try {
  execSync(
    `npm run build -- -c "src-tauri/.pake/tauri.conf.json" --target x86_64-pc-windows-msvc --features cli-build`,
    { cwd: PAKE_DIR, stdio: 'inherit', env: process.env }
  );
} catch (e) {
  fail('编译失败，请查看上方错误信息');
}

// 7. 复制产物
log('复制产物');
if (!fs.existsSync(OUTPUT_EXE)) fail(`未找到编译产物: ${OUTPUT_EXE}`);
fs.mkdirSync(path.dirname(DEST_EXE), { recursive: true });
fs.copyFileSync(OUTPUT_EXE, DEST_EXE);
const sizeMB = (fs.statSync(DEST_EXE).size / 1024 / 1024).toFixed(1);
ok(`dist/${APP_NAME}.exe (${sizeMB} MB)`);

console.log(`\n🎉 打包完成: ${DEST_EXE}\n`);
