module.exports = {
  presets: [
    // 测试环境直接转译为当前 Node 支持的 CJS，
    // 让 Jest 能真正 import 浏览器 ESM 模块（不再依赖 vm 注入全局）。
    ['@babel/preset-env', { targets: { node: 'current' } }],
  ],
};
