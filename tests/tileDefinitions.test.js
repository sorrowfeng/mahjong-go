// tests/tileDefinitions.test.js

describe('tileDefinitions', () => {
  describe('generateDeck()', () => {
    let deck;
    beforeEach(() => {
      deck = generateDeck();
    });

    test('returns exactly 136 tiles', () => {
      expect(deck).toHaveLength(136);
    });

    test('each tile has required properties', () => {
      for (const tile of deck) {
        expect(tile).toHaveProperty('instanceId');
        expect(tile).toHaveProperty('tileTypeId');
        expect(tile).toHaveProperty('type');
        expect(tile).toHaveProperty('value');
        expect(tile).toHaveProperty('label');
        expect(tile).toHaveProperty('topChar');
        expect(tile).toHaveProperty('bottomChar');
      }
    });

    test('all instanceIds are unique', () => {
      const ids = deck.map(t => t.instanceId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(136);
    });

    test('instanceIds are sequential from 0 to 135', () => {
      const ids = deck.map(t => t.instanceId).sort((a, b) => a - b);
      for (let i = 0; i < 136; i++) {
        expect(ids[i]).toBe(i);
      }
    });

    test('each tileTypeId appears exactly 4 times', () => {
      const countByTypeId = {};
      for (const tile of deck) {
        countByTypeId[tile.tileTypeId] = (countByTypeId[tile.tileTypeId] || 0) + 1;
      }
      // 34 distinct tileTypeIds
      expect(Object.keys(countByTypeId)).toHaveLength(34);
      for (const [, count] of Object.entries(countByTypeId)) {
        expect(count).toBe(4);
      }
    });

    test('wan tiles have tileTypeId 0-8 and type wan', () => {
      const wanTiles = deck.filter(t => t.type === TILE_TYPE.WAN);
      expect(wanTiles).toHaveLength(36); // 9 types × 4
      const typeIds = [...new Set(wanTiles.map(t => t.tileTypeId))].sort((a, b) => a - b);
      expect(typeIds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('tiao tiles have tileTypeId 9-17 and type tiao', () => {
      const tiaoTiles = deck.filter(t => t.type === TILE_TYPE.TIAO);
      expect(tiaoTiles).toHaveLength(36);
      const typeIds = [...new Set(tiaoTiles.map(t => t.tileTypeId))].sort((a, b) => a - b);
      expect(typeIds).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    test('tong tiles have tileTypeId 18-26 and type tong', () => {
      const tongTiles = deck.filter(t => t.type === TILE_TYPE.TONG);
      expect(tongTiles).toHaveLength(36);
      const typeIds = [...new Set(tongTiles.map(t => t.tileTypeId))].sort((a, b) => a - b);
      expect(typeIds).toEqual([18, 19, 20, 21, 22, 23, 24, 25, 26]);
    });

    test('zi tiles have tileTypeId 27-33 and type zi', () => {
      const ziTiles = deck.filter(t => t.type === TILE_TYPE.ZI);
      expect(ziTiles).toHaveLength(28); // 7 types × 4
      const typeIds = [...new Set(ziTiles.map(t => t.tileTypeId))].sort((a, b) => a - b);
      expect(typeIds).toEqual([27, 28, 29, 30, 31, 32, 33]);
    });

    test('wan tile labels contain 万', () => {
      const wanTiles = deck.filter(t => t.type === TILE_TYPE.WAN);
      for (const tile of wanTiles) {
        expect(tile.label).toContain('万');
        expect(tile.bottomChar).toBe('万');
      }
    });

    test('zi tiles for 东南西北中发白 have correct labels', () => {
      const ziLabels = deck
        .filter(t => t.type === TILE_TYPE.ZI)
        .map(t => t.label);
      const uniqueLabels = [...new Set(ziLabels)].sort();
      expect(uniqueLabels).toEqual(['东', '中', '北', '南', '发', '白', '西'].sort());
    });
  });

  describe('shuffleDeck()', () => {
    let originalDeck;

    beforeEach(() => {
      originalDeck = generateDeck();
    });

    test('returns an array of the same length', () => {
      const shuffled = shuffleDeck(originalDeck);
      expect(shuffled).toHaveLength(originalDeck.length);
    });

    test('does not modify the original deck', () => {
      const originalIds = originalDeck.map(t => t.instanceId);
      shuffleDeck(originalDeck);
      const afterIds = originalDeck.map(t => t.instanceId);
      expect(afterIds).toEqual(originalIds);
    });

    test('returns a new array (not the same reference)', () => {
      const shuffled = shuffleDeck(originalDeck);
      expect(shuffled).not.toBe(originalDeck);
    });

    test('contains the same elements as the original', () => {
      const shuffled = shuffleDeck(originalDeck);
      const originalIds = new Set(originalDeck.map(t => t.instanceId));
      const shuffledIds = new Set(shuffled.map(t => t.instanceId));
      expect(shuffledIds).toEqual(originalIds);
    });

    test('produces different ordering with high probability (run 5 times)', () => {
      // With 136 elements, probability of identical shuffle is astronomically small
      let differentFound = false;
      const originalOrder = originalDeck.map(t => t.instanceId).join(',');
      for (let i = 0; i < 5; i++) {
        const shuffled = shuffleDeck(originalDeck);
        const shuffledOrder = shuffled.map(t => t.instanceId).join(',');
        if (shuffledOrder !== originalOrder) {
          differentFound = true;
          break;
        }
      }
      expect(differentFound).toBe(true);
    });

    test('each tileTypeId still appears exactly 4 times after shuffle', () => {
      const shuffled = shuffleDeck(originalDeck);
      const countByTypeId = {};
      for (const tile of shuffled) {
        countByTypeId[tile.tileTypeId] = (countByTypeId[tile.tileTypeId] || 0) + 1;
      }
      for (const [, count] of Object.entries(countByTypeId)) {
        expect(count).toBe(4);
      }
    });
  });
});
