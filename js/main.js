// main.js — 入口、初始化、按钮绑定

document.addEventListener('DOMContentLoaded', () => {
  const boardEl = document.getElementById('board');

  // 初始化拖拽控制器
  initDragController(boardEl, handleDragEnd, handleTileClick);

  // 游戏内按钮绑定
  document.getElementById('btn-hint').addEventListener('click', handleHint);
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-new').addEventListener('click', handleNewGame);
  document.getElementById('btn-new-victory').addEventListener('click', handleNewGame);

  // 规则按钮：在游戏中随时查看动画说明
  document.getElementById('btn-rules').addEventListener('click', () => {
    showTutorial(false);
  });

  // 教学界面按钮：首次进入时开始游戏，游戏中查看时直接关闭
  document.getElementById('btn-tutorial-start').addEventListener('click', () => {
    const isFirst = document.getElementById('btn-tutorial-start').dataset.first === '1';
    hideTutorial();
    if (isFirst) initNewGame();
  });

  // 首次进入页面：先展示规则动画，不立即开始游戏
  showTutorial(true);
});
