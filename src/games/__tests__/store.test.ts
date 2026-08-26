import path from 'path';
import os from 'os';
import fs from 'fs';

// Use a temp dir so tests don't touch real data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashenai-test-'));
process.env.DATA_DIR = tmpDir;

import { getPlayer, savePlayer, updatePlayer, economy } from '../store';
import { createDefaultPlayer } from '../types';

const USER_ID = 'test-user-1';
const USERNAME = 'TestUser';

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getPlayer', () => {
  test('creates a new player with defaults', async () => {
    const player = await getPlayer(USER_ID, USERNAME);
    expect(player.userId).toBe(USER_ID);
    expect(player.username).toBe(USERNAME);
    expect(player.level).toBe(1);
    expect(player.gold).toBe(100);
    expect(player.region).toBe('ashen_village');
    expect(player.unlockedRegions).toContain('ashen_village');
  });

  test('returns same player on second call', async () => {
    const a = await getPlayer(USER_ID, USERNAME);
    const b = await getPlayer(USER_ID, USERNAME);
    expect(a.userId).toBe(b.userId);
    expect(a.gold).toBe(b.gold);
  });
});

describe('updatePlayer', () => {
  test('applies updater atomically', async () => {
    const player = await updatePlayer(USER_ID, USERNAME, (p) => ({
      ...p,
      gold: 999,
    }));
    expect(player.gold).toBe(999);
  });
});

describe('economy', () => {
  test('addCoins increases balance', async () => {
    const before = await economy.getBalance(USER_ID);
    await economy.addCoins(USER_ID, USERNAME, 500);
    const after = await economy.getBalance(USER_ID);
    expect(after).toBe(before + 500);
  });

  test('removeCoins decreases balance', async () => {
    const before = await economy.getBalance(USER_ID);
    await economy.removeCoins(USER_ID, USERNAME, 100);
    const after = await economy.getBalance(USER_ID);
    expect(after).toBe(before - 100);
  });

  test('removeCoins throws on insufficient funds', async () => {
    await expect(economy.removeCoins(USER_ID, USERNAME, 999_999_999)).rejects.toThrow('Insufficient coins');
  });

  test('canAfford returns correct boolean', async () => {
    const balance = await economy.getBalance(USER_ID);
    expect(await economy.canAfford(USER_ID, 1)).toBe(true);
    expect(await economy.canAfford(USER_ID, balance + 1)).toBe(false);
  });

  test('transferCoins moves coins between players', async () => {
    const user2 = 'test-user-2';
    await getPlayer(user2, 'User2');
    const bal1Before = await economy.getBalance(USER_ID);
    const bal2Before = await economy.getBalance(user2);
    await economy.transferCoins(USER_ID, USERNAME, user2, 'User2', 50);
    expect(await economy.getBalance(USER_ID)).toBe(bal1Before - 50);
    expect(await economy.getBalance(user2)).toBe(bal2Before + 50);
  });
});
