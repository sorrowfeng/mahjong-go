module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // V8 原生覆盖率引擎，可追踪通过 vm.runInContext 加载的代码（配合 filename 选项）
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'js/constants.js',
    'js/tileDefinitions.js',
    'js/boardState.js',
    'js/gameLogic.js',
    'js/movementLogic.js',
    'js/hintSystem.js',
  ],
  coverageThreshold: {
    global: {
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
