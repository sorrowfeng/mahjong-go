#!/usr/bin/env node
// build.js — 一键打包 & 发布脚本
// 用法:
//   node build.js              # 仅打包
//   node build.js --release    # 打包 + 发布到 GitHub Release

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
const DIST_SRC    = path.join(TAURI_DIR, 'dist');
const ICON_SRC    = path.resolve(__dirname, 'assets/icon.ico');
const ICON_DEST   = path.join(TAURI_DIR, `png/${APP_NAME}_256.ico`);
const GAME_FILES  = ['index.html', 'css', 'js', 'assets'];
const OUTPUT_EXE  = path.join(
  TAURI_DIR,
  'target/x86_64-pc-windows-msvc/release',
  `pake-${APP_NAME}.exe`
);
const DEST_EXE    = path.resolve(__dirname, `dist/${APP_NAME}.exe`);
const GH_CLI      = 'C:\\Program Files\\GitHub CLI\\gh.exe';

// ── 参数解析 ─────────────────────────────────────────────────────────────────

const DO_RELEASE = process.argv.includes('--release');

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✔ ${msg}`); }
function fail(msg) { console.error(`  ✘ ${msg}`); process.exit(1); }

function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', env: process.env, ...opts });
}

function execOut(cmd) {
  return execSync(cmd, { env: process.env }).toString().trim();
}

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
process.env.PATH = `${process.env.PATH};${path.join(process.env.USERPROFILE, '.cargo/bin')}`;
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
  const src  = path.resolve(__dirname, item);
  const dest = path.join(DIST_SRC, item);
  if (!fs.existsSync(src)) { console.warn(`  ! 跳过不存在的: ${item}`); continue; }
  if (fs.statSync(src).isDirectory()) copyDir(src, dest);
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
    macos:   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    linux:   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
  system_tray: { macos: false, linux: false, windows: false },
  system_tray_path: `png/${APP_NAME}_256.ico`,
  inject: [],
  proxy_url: '',
  multi_instance: false,
};
fs.writeFileSync(path.join(TAURI_DIR, '.pake/pake.json'), JSON.stringify(pakeJson, null, 4));
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
fs.writeFileSync(path.join(TAURI_DIR, '.pake/tauri.conf.json'), JSON.stringify(tauriConf, null, 4));
ok('.pake/tauri.conf.json');

// 6. Cargo 构建
log('编译 (cargo build)...');
try {
  exec(
    `npm run build -- -c "src-tauri/.pake/tauri.conf.json" --target x86_64-pc-windows-msvc --features cli-build`,
    { cwd: PAKE_DIR }
  );
} catch {
  fail('编译失败，请查看上方错误信息');
}

// 7. 复制产物
log('复制产物');
if (!fs.existsSync(OUTPUT_EXE)) fail(`未找到编译产物: ${OUTPUT_EXE}`);
fs.mkdirSync(path.dirname(DEST_EXE), { recursive: true });
fs.copyFileSync(OUTPUT_EXE, DEST_EXE);
const sizeMB = (fs.statSync(DEST_EXE).size / 1024 / 1024).toFixed(1);
ok(`dist/${APP_NAME}.exe (${sizeMB} MB)`);

console.log(`\n✔ 打包完成: ${DEST_EXE}`);

// 8. 发布到 GitHub Release（仅 --release 模式）
if (!DO_RELEASE) {
  console.log('  提示: 运行 node build.js --release 可自动发布到 GitHub Release\n');
  process.exit(0);
}

log('发布到 GitHub Release');

// 检查 gh CLI
if (!fs.existsSync(GH_CLI)) fail(`未找到 GitHub CLI: ${GH_CLI}\n  请先安装: winget install GitHub.cli`);

// 检查登录状态
try {
  execOut(`"${GH_CLI}" auth status`);
} catch {
  fail('GitHub CLI 未登录，请先运行: gh auth login');
}

// 获取当前版本 tag（取最新 commit 的短 hash 作为版本号）
const shortHash = execOut('git rev-parse --short HEAD');
const tag = `v1.0.0-${shortHash}`;
const title = `${APP_NAME} ${tag}`;
const notes = `## 下载\n\n直接下载 \`${APP_NAME}.exe\` 运行即可，无需安装。\n\n**系统要求**：Windows 10/11（64位）`;

// 删除同名 tag（若重新发布）
try {
  execOut(`"${GH_CLI}" release delete ${tag} --yes`);
  execOut(`git push origin :refs/tags/${tag}`);
} catch { /* 首次发布，tag 不存在，忽略 */ }

// 创建 release 并上传 exe
exec(`"${GH_CLI}" release create ${tag} "${DEST_EXE}#${APP_NAME}.exe" --title "${title}" --notes "${notes}"`);

// 获取 release URL
const url = execOut(`"${GH_CLI}" release view ${tag} --json url -q .url`);
ok(`Release 已发布: ${url}`);
console.log();
