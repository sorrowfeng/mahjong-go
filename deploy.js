#!/usr/bin/env node
// deploy.js — 将游戏部署到 GitHub Pages
// 用法: node deploy.js

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT    = __dirname;
const TMP_DIR = path.join(ROOT, '.gh-pages-tmp');

// 需要部署的文件/目录
const INCLUDES = ['index.html', 'css', 'js', 'assets'];

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 1. 清理并重建临时目录
if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR);

// 2. 复制游戏文件到临时目录
console.log('复制游戏文件...');
for (const item of INCLUDES) {
  const src  = path.join(ROOT, item);
  const dest = path.join(TMP_DIR, item);
  if (!fs.existsSync(src)) {
    console.warn(`  跳过 (不存在): ${item}`);
    continue;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
    console.log(`  复制目录: ${item}/`);
  } else {
    fs.copyFileSync(src, dest);
    console.log(`  复制文件: ${item}`);
  }
}

// 3. 用纯 git 命令推送到 gh-pages 分支（不带 tags）
console.log('\n推送到 gh-pages 分支...');
const ghToken = process.env.GH_TOKEN;
const repoUrl = ghToken
  ? `https://${ghToken}@github.com/sorrowfeng/mahjong-go.git`
  : 'https://github.com/sorrowfeng/mahjong-go.git';

// 在临时目录初始化独立的 git 仓库
run('git init -b gh-pages', { cwd: TMP_DIR });
run('git add -A', { cwd: TMP_DIR });
run('git commit -m "deploy: update GitHub Pages"', { cwd: TMP_DIR });
// 强制推送到远端 gh-pages 分支（不携带任何 tag）
run(`git push "${repoUrl}" gh-pages:gh-pages --force`, { cwd: TMP_DIR });

// 4. 清理临时目录
fs.rmSync(TMP_DIR, { recursive: true });

console.log('\n✓ 部署完成！');
console.log('  稍等约 1-2 分钟后访问:');
console.log('  https://sorrowfeng.github.io/mahjong-go/');
