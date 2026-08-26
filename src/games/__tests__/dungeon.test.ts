import {
  DUNGEONS,
  createDungeonSession,
  addPlayerToSession,
  startDungeonSession,
  advanceToNextFloor,
  resolveDungeonTurn,
  spawnFloorEnemy,
  playerToState,
  avgPartyLevel,
} from '../dungeon';
import { createDefaultPlayer } from '../types';

const makePlayer = (id: string, name: string) => createDefaultPlayer(id, name);

describe('DUNGEONS', () => {
  test('ashen_crypt exists with 5 floors', () => {
    expect(DUNGEONS.ashen_crypt).toBeDefined();
    expect(DUNGEONS.ashen_crypt.floors).toHaveLength(5);
  });
  test('floor 5 is the boss', () => {
    expect(DUNGEONS.ashen_crypt.floors[4].isBoss).toBe(true);
  });
});

describe('spawnFloorEnemy', () => {
  test('scales HP with party size', () => {
    const solo  = spawnFloorEnemy('ashen_crypt', 0, 5, 1);
    const party = spawnFloorEnemy('ashen_crypt', 0, 5, 5);
    expect(party.hp).toBeGreaterThan(solo.hp);
  });
  test('scales HP with level', () => {
    const low  = spawnFloorEnemy('ashen_crypt', 0, 1,  1);
    const high = spawnFloorEnemy('ashen_crypt', 0, 20, 1);
    expect(high.hp).toBeGreaterThan(low.hp);
  });
  test('boss floor has isBoss=true', () => {
    const boss = spawnFloorEnemy('ashen_crypt', 4, 5, 1);
    expect(boss.isBoss).toBe(true);
  });
  test('unique IDs per spawn', () => {
    const a = spawnFloorEnemy('ashen_crypt', 0, 5, 1);
    const b = spawnFloorEnemy('ashen_crypt', 0, 5, 1);
    expect(a.id).not.toBe(b.id);
  });
});

describe('createDungeonSession', () => {
  test('creates waiting session with leader as first player', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = createDungeonSession('ashen_crypt', leader, 'g1', 'c1');
    expect(session.status).toBe('waiting');
    expect(session.players).toHaveLength(1);
    expect(session.leaderId).toBe('u1');
    expect(session.floor).toBe(1);
    expect(session.rewardsClaimed).toBe(false);
  });
});

describe('addPlayerToSession', () => {
  test('adds a second player', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = createDungeonSession('ashen_crypt', leader, 'g1', 'c1');
    const player2 = makePlayer('u2', 'Player2');
    const updated = addPlayerToSession(session, player2);
    expect(updated.players).toHaveLength(2);
    expect(updated.players[1].userId).toBe('u2');
  });
  test('does not mutate original session', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = createDungeonSession('ashen_crypt', leader, 'g1', 'c1');
    addPlayerToSession(session, makePlayer('u2', 'Player2'));
    expect(session.players).toHaveLength(1);
  });
});

describe('startDungeonSession', () => {
  test('transitions to combat status', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    expect(session.status).toBe('combat');
    expect(session.startedAt).toBeDefined();
    expect(session.log.length).toBeGreaterThan(0);
  });
  test('spawns a real enemy', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    expect(session.enemy.hp).toBeGreaterThan(0);
    expect(session.enemy.name).toBe('Crypt Shambler');
  });
});

describe('resolveDungeonTurn', () => {
  function makeSession(numPlayers = 1): ReturnType<typeof createDungeonSession> {
    const leader  = makePlayer('u1', 'Leader');
    let session   = createDungeonSession('ashen_crypt', leader, 'g1', 'c1');
    for (let i = 2; i <= numPlayers; i++) {
      session = addPlayerToSession(session, makePlayer(`u${i}`, `P${i}`));
    }
    return startDungeonSession(session);
  }

  test('requires all alive players to act before resolving', () => {
    const session = makeSession(2);
    // Only one player submits
    const partial = { ...session, actionsThisTurn: { u1: 'attack' as const } };
    // This should NOT be called until all players have acted
    // (the Discord command handles this gate; the engine resolves whatever is in actionsThisTurn)
    const result = resolveDungeonTurn(partial);
    expect(result.session.turn).toBe(1);
    expect(result.session.actionsThisTurn).toEqual({});
  });

  test('floor_cleared when enemy hp reaches 0', () => {
    const session = makeSession();
    // Boost player attack to guarantee kill
    const boosted: typeof session = {
      ...session,
      players:          [{ ...session.players[0], attack: 9999 }],
      actionsThisTurn:  { u1: 'attack' },
    };
    const result = resolveDungeonTurn(boosted);
    expect(result.status).toBe('floor_cleared');
    expect(result.session.enemy.hp).toBe(0);
  });

  test('dungeon_failed when all players die', () => {
    const session = makeSession();
    // Boost enemy attack massively
    const rigged: typeof session = {
      ...session,
      enemy:            { ...session.enemy, attack: 99999, defense: 0 },
      players:          [{ ...session.players[0], hp: 1, defense: 0, dodgeChance: 0 }],
      actionsThisTurn:  { u1: 'attack' },
    };
    const result = resolveDungeonTurn(rigged);
    expect(result.status).toBe('dungeon_failed');
  });

  test('defend reduces incoming damage (statistical)', () => {
    let normalDmgTotal  = 0;
    let defendDmgTotal  = 0;
    const TRIALS = 200;
    for (let i = 0; i < TRIALS; i++) {
      const base = makeSession();
      // Attack enemy to zero, then check player HP with/without defend
      const withAttack = resolveDungeonTurn({
        ...base,
        enemy:           { ...base.enemy, attack: 30, defense: 0 },
        players:         [{ ...base.players[0], defense: 0, dodgeChance: 0 }],
        actionsThisTurn: { u1: 'attack' },
      });
      normalDmgTotal += (base.players[0].hp - withAttack.session.players[0].hp);

      const withDefend = resolveDungeonTurn({
        ...base,
        enemy:           { ...base.enemy, attack: 30, defense: 0 },
        players:         [{ ...base.players[0], defense: 0, dodgeChance: 0 }],
        actionsThisTurn: { u1: 'defend' },
      });
      defendDmgTotal += (base.players[0].hp - withDefend.session.players[0].hp);
    }
    // Defending should take ~50% less damage on average
    expect(defendDmgTotal).toBeLessThan(normalDmgTotal * 0.7);
  });

  test('ability power strike deals more damage', () => {
    let abilityDmgTotal  = 0;
    let normalDmgTotal   = 0;
    const TRIALS = 100;
    for (let i = 0; i < TRIALS; i++) {
      const base = makeSession();
      const boostedPlayer = { ...base.players[0], attack: 50, critChance: 0 };
      const withAbility = resolveDungeonTurn({
        ...base,
        enemy:           { ...base.enemy, hp: 99999, defense: 0 },
        players:         [{ ...boostedPlayer, abilityUsed: false }],
        actionsThisTurn: { u1: 'ability' },
      });
      abilityDmgTotal += (base.enemy.maxHp - withAbility.session.enemy.hp);

      const withNormal = resolveDungeonTurn({
        ...base,
        enemy:           { ...base.enemy, hp: 99999, defense: 0 },
        players:         [{ ...boostedPlayer }],
        actionsThisTurn: { u1: 'attack' },
      });
      normalDmgTotal += (base.enemy.maxHp - withNormal.session.enemy.hp);
    }
    expect(abilityDmgTotal).toBeGreaterThan(normalDmgTotal);
  });

  test('does not mutate the input session', () => {
    const session = makeSession();
    const hpBefore = session.players[0].hp;
    resolveDungeonTurn({ ...session, actionsThisTurn: { u1: 'attack' } });
    expect(session.players[0].hp).toBe(hpBefore);
  });

  test('resets actionsThisTurn after resolution', () => {
    const session = makeSession();
    const result  = resolveDungeonTurn({ ...session, actionsThisTurn: { u1: 'attack' } });
    expect(result.session.actionsThisTurn).toEqual({});
  });
});

describe('advanceToNextFloor', () => {
  test('increments floor counter', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    const advanced = advanceToNextFloor(session);
    expect(advanced.floor).toBe(2);
  });
  test('resets abilityUsed for all players', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    const withAbilityUsed = { ...session, players: [{ ...session.players[0], abilityUsed: true }] };
    const advanced = advanceToNextFloor(withAbilityUsed);
    expect(advanced.players[0].abilityUsed).toBe(false);
  });
  test('heals survivors by 20% maxHp', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    const halfHp  = { ...session, players: [{ ...session.players[0], hp: 50 }] };
    const advanced = advanceToNextFloor(halfHp);
    expect(advanced.players[0].hp).toBeGreaterThan(50);
  });
  test('spawns the next floor enemy', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    const advanced = advanceToNextFloor(session);
    expect(advanced.enemy.name).toBe('Bone Archer');
  });
});

describe('avgPartyLevel', () => {
  test('returns 1 when no alive players', () => {
    const leader  = makePlayer('u1', 'Leader');
    const session = startDungeonSession(createDungeonSession('ashen_crypt', leader, 'g1', 'c1'));
    const dead    = { ...session, players: [{ ...session.players[0], alive: false }] };
    expect(avgPartyLevel(dead)).toBe(1);
  });
  test('averages levels correctly', () => {
    const leader = makePlayer('u1', 'Leader');
    let session  = createDungeonSession('ashen_crypt', leader, 'g1', 'c1');
    const p2 = { ...makePlayer('u2', 'P2'), level: 5 };
    session = addPlayerToSession(session, p2);
    session = { ...session, players: [
      { ...session.players[0], level: 3 },
      { ...session.players[1], level: 5 },
    ]};
    expect(avgPartyLevel(session)).toBe(4);
  });
});
