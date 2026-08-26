import type { Player, TitleId } from './types.js';

interface TitleDefinition {
  id: TitleId;
  name: string;
  emoji: string;
  description: string;
  check: (p: Player) => boolean;
}

export const TITLE_DEFINITIONS: TitleDefinition[] = [
  {
    id: 'novice',
    name: 'Novice',
    emoji: '🔰',
    description: 'Just starting out.',
    check: () => true, // Everyone starts with this
  },
  {
    id: 'hunter',
    name: 'Hunter',
    emoji: '🏹',
    description: 'Defeated 50 monsters.',
    check: (p) => p.statistics.monstersKilled >= 50,
  },
  {
    id: 'dragon_slayer',
    name: 'Dragon Slayer',
    emoji: '🐉',
    description: 'Slew a dragon.',
    check: (p) => p.statistics.bossesKilled >= 1,
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    emoji: '💰',
    description: 'Accumulated 1,000,000 coins.',
    check: (p) => p.statistics.totalCoinsEarned >= 1_000_000,
  },
  {
    id: 'casino_king',
    name: 'Casino King',
    emoji: '🎰',
    description: 'Won 100,000 coins in the casino.',
    check: (p) => p.statistics.casinoCoinsWon >= 100_000,
  },
  {
    id: 'dungeon_lord',
    name: 'Dungeon Lord',
    emoji: '🏰',
    description: 'Completed 10 dungeons.',
    check: (p) => p.statistics.dungeonsCompleted >= 10,
  },
  {
    id: 'abyss_walker',
    name: 'Abyss Walker',
    emoji: '☠️',
    description: 'Entered the Abyss.',
    check: (p) => p.unlockedRegions.includes('abyss'),
  },
  {
    id: 'godslayer',
    name: 'Godslayer',
    emoji: '⚡',
    description: 'Defeated the Fallen God.',
    check: (p) => p.unlockedRegions.includes('celestial_realm') && p.statistics.bossesKilled >= 5,
  },
  {
    id: 'the_unlucky',
    name: 'The Unlucky',
    emoji: '💀',
    description: 'Died 10 times.',
    check: (p) => p.statistics.deaths >= 10,
  },
  {
    id: 'the_immortal',
    name: 'The Immortal',
    emoji: '✨',
    description: 'Reached level 100.',
    check: (p) => p.level >= 100,
  },
];

/**
 * Check and award any newly unlocked titles.
 * Returns array of newly awarded title IDs.
 */
export function checkAndAwardTitles(player: Player): TitleId[] {
  const newTitles: TitleId[] = [];
  for (const def of TITLE_DEFINITIONS) {
    if (!player.titles.includes(def.id) && def.check(player)) {
      player.titles.push(def.id);
      newTitles.push(def.id);
    }
  }
  return newTitles;
}

export function getTitleDefinition(id: TitleId): TitleDefinition | undefined {
  return TITLE_DEFINITIONS.find((t) => t.id === id);
}
