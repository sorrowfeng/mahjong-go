// tests/setup.js — 将所有纯逻辑 JS 文件注入到 global 作用域
//
// 方案：vm.createContext(sandbox) + const→var 替换
// var 声明在 runInContext 中会成为 sandbox 的可枚举属性，
// 再通过 Object.keys 批量拷贝到 global。
// VM context 的内置对象（Array/Object 等）是不可枚举的，不会被覆盖。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const jsRoot = path.join(__dirname, '../js');
const files = [
  'constants.js',
  'tileDefinitions.js',
  'boardState.js',
  'gameLogic.js',
  'movementLogic.js',
  'hintSystem.js',
];

const sandbox = {};
vm.createContext(sandbox);

for (const file of files) {
  let code = fs.readFileSync(path.join(jsRoot, file), 'utf8');
  // 将 const/let 替换为 var，使顶层声明成为 sandbox 的可枚举属性
  code = code
    .replace(/\bconst\b/g, 'var')
    .replace(/\blet\b/g, 'var');
  // 传入 filename 使 V8 覆盖率引擎能将执行记录映射到源文件
  vm.runInContext(code, sandbox, { filename: path.resolve(jsRoot, file) });
}

// 将 sandbox 中所有可枚举属性（即我们声明的函数和变量）复制到 global
for (const key of Object.keys(sandbox)) {
  global[key] = sandbox[key];
}
