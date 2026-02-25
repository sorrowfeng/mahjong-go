// tileDefinitions.js — 34种牌定义 + 牌组生成

// 中文数字
const CHINESE_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 34种基础牌型定义
const TILE_TYPES = [
  // 万子 1-9（id: 0-8）
  ...Array.from({ length: 9 }, (_, i) => ({
    id: i,
    type: TILE_TYPE.WAN,
    value: i + 1,
    label: CHINESE_NUMS[i] + '万',
    topChar: CHINESE_NUMS[i],
    bottomChar: '万',
  })),
  // 条子 1-9（id: 9-17）
  ...Array.from({ length: 9 }, (_, i) => ({
    id: 9 + i,
    type: TILE_TYPE.TIAO,
    value: i + 1,
    label: CHINESE_NUMS[i] + '条',
    topChar: CHINESE_NUMS[i],
    bottomChar: '条',
  })),
  // 筒子 1-9（id: 18-26）
  ...Array.from({ length: 9 }, (_, i) => ({
    id: 18 + i,
    type: TILE_TYPE.TONG,
    value: i + 1,
    label: CHINESE_NUMS[i] + '筒',
    topChar: CHINESE_NUMS[i],
    bottomChar: '筒',
  })),
  // 字牌 东南西北中发白（id: 27-33）
  { id: 27, type: TILE_TYPE.ZI, value: 1, label: '东', topChar: '东', bottomChar: '' },
  { id: 28, type: TILE_TYPE.ZI, value: 2, label: '南', topChar: '南', bottomChar: '' },
  { id: 29, type: TILE_TYPE.ZI, value: 3, label: '西', topChar: '西', bottomChar: '' },
  { id: 30, type: TILE_TYPE.ZI, value: 4, label: '北', topChar: '北', bottomChar: '' },
  { id: 31, type: TILE_TYPE.ZI, value: 5, label: '中', topChar: '中', bottomChar: '' },
  { id: 32, type: TILE_TYPE.ZI, value: 6, label: '发', topChar: '发', bottomChar: '' },
  { id: 33, type: TILE_TYPE.ZI, value: 7, label: '白', topChar: '', bottomChar: '' },
];

// 每种牌的副数：万/条/筒各4副，字牌各4副
// 万子9×4=36, 条子9×4=36, 筒子9×4=36, 字牌7×4=28, 合计136
function generateDeck() {
  const deck = [];
  let instanceId = 0;

  for (const tileDef of TILE_TYPES) {
    const copies = 4;
    for (let c = 0; c < copies; c++) {
      deck.push({
        instanceId: instanceId++,
        tileTypeId: tileDef.id,
        type: tileDef.type,
        value: tileDef.value,
        label: tileDef.label,
        topChar: tileDef.topChar,
        bottomChar: tileDef.bottomChar,
      });
    }
  }

  return deck; // 136张
}

// Fisher-Yates 洗牌
function shuffleDeck(deck) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
