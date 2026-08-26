/**
 * Quest system: templates, progress tracking, reward claiming.
 * Rewards are deterministic.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Player, Quest, QuestObjective, QuestType, TitleId } from './types.js';

export type QuestEventType =
  | 'monster_kill'
  | 'boss_kill'
  | 'hunt_complete'
  | 'item_collected'
  | 'damage_dealt'
  | 'coins_earned'
  | 'death';

export interface QuestEvent {
  type: QuestEventType;
  count?: number;
}

interface ObjectiveTemplate {
  id: QuestEventType;
  description: string;
  required: number;
}

interface QuestTemplate {
  templateId: string;
  name: string;
  description: string;
  type: QuestType;
  objectives: ObjectiveTemplate[];
  rewards: { xp: number; coins: number; title?: TitleId; reputation?: number };
  durationHours?: number;
}

const DAILY_TEMPLATES: readonly QuestTemplate[] = [
  { templateId: 'daily_hunter',   name: 'Daily Monster Hunt', description: 'Slay 5 monsters.',      type: 'daily',   objectives: [{ id: 'monster_kill',  description: 'Kill monsters',     required: 5    }], rewards: { xp: 150, coins: 100 }, durationHours: 24 },
  { templateId: 'daily_explorer', name: 'Daily Explorer',     description: 'Complete 5 hunts.',      type: 'daily',   objectives: [{ id: 'hunt_complete',  description: 'Complete hunts',    required: 5    }], rewards: { xp: 120, coins: 80  }, durationHours: 24 },
  { templateId: 'daily_collector',name: 'Daily Collector',    description: 'Collect 3 items.',       type: 'daily',   objectives: [{ id: 'item_collected', description: 'Collect items',     required: 3    }], rewards: { xp: 100, coins: 120 }, durationHours: 24 },
  { templateId: 'daily_brawler',  name: 'Daily Brawler',      description: 'Deal 2000 damage.',      type: 'daily',   objectives: [{ id: 'damage_dealt',   description: 'Deal damage',       required: 2000 }], rewards: { xp: 180, coins: 90  }, durationHours: 24 },
  { templateId: 'daily_earner',   name: 'Daily Earner',       description: 'Earn 500 coins.',        type: 'daily',   objectives: [{ id: 'coins_earned',   description: 'Earn coins',        required: 500  }], rewards: { xp: 90,  coins: 150 }, durationHours: 24 },
] as const;

const WEEKLY_TEMPLATES: readonly QuestTemplate[] = [
  { templateId: 'weekly_slayer',      name: 'Weekly Slayer',      description: 'Kill 30 monsters.',  type: 'weekly', objectives: [{ id: 'monster_kill',  description: 'Kill monsters',  required: 30 }], rewards: { xp: 1000, coins: 600  }, durationHours: 168 },
  { templateId: 'weekly_boss_hunter', name: 'Weekly Boss Hunter', description: 'Defeat 3 bosses.',   type: 'weekly', objectives: [{ id: 'boss_kill',     description: 'Defeat bosses',  required: 3  }], rewards: { xp: 2000, coins: 1500 }, durationHours: 168 },
  { templateId: 'weekly_veteran',     name: 'Weekly Veteran',     description: 'Complete 20 hunts.', type: 'weekly', objectives: [{ id: 'hunt_complete', description: 'Complete hunts', required: 20 }], rewards: { xp: 800,  coins: 500  }, durationHours: 168 },
  { templateId: 'weekly_collector',   name: 'Weekly Collector',   description: 'Collect 15 items.',  type: 'weekly', objectives: [{ id: 'item_collected',description: 'Collect items',  required: 15 }], rewards: { xp: 900,  coins: 700  }, durationHours: 168 },
] as const;

const STORY_TEMPLATES: readonly QuestTemplate[] = [
  { templateId: 'story_first_hunt',    name: 'First Steps',       description: 'Complete your first hunt.',     type: 'story', objectives: [{ id: 'hunt_complete',  description: 'Complete a hunt',       required: 1   }], rewards: { xp: 50,   coins: 50  } },
  { templateId: 'story_first_blood',   name: 'First Blood',       description: 'Slay your first monster.',      type: 'story', objectives: [{ id: 'monster_kill',   description: 'Kill a monster',        required: 1   }], rewards: { xp: 100,  coins: 75  } },
  { templateId: 'story_trial_by_fire', name: 'Trial by Fire',     description: 'Defeat your first boss.',       type: 'story', objectives: [{ id: 'boss_kill',      description: 'Defeat a boss',         required: 1   }], rewards: { xp: 500,  coins: 300, title: 'dragon_slayer' } },
  { templateId: 'story_survivor',      name: 'The Survivor',      description: 'Die and return stronger.',      type: 'story', objectives: [{ id: 'death',          description: 'Be defeated in combat', required: 1   }], rewards: { xp: 200,  coins: 100 } },
  { templateId: 'story_centurion',     name: 'The Centurion',     description: 'Slay 100 monsters.',            type: 'story', objectives: [{ id: 'monster_kill',   description: 'Kill 100 monsters',     required: 100 }], rewards: { xp: 2000, coins: 1000, title: 'hunter' } },
  { templateId: 'story_veteran_hunter',name: 'Veteran Hunter',    description: 'Complete 50 hunts.',            type: 'story', objectives: [{ id: 'hunt_complete',  description: 'Complete 50 hunts',     required: 50  }], rewards: { xp: 1500, coins: 800  } },
] as const;

function templateToQuest(template: QuestTemplate, expiresAt?: string): Quest {
  return {
    id: uuidv4(),
    templateId: template.templateId,
    name:        template.name,
    description: template.description,
    type:        template.type,
    status:      'active',
    objectives:  template.objectives.map((o) => ({
      id: o.id, description: o.description, required: o.required, current: 0, completed: false,
    })),
    rewards: {
      xp:         template.rewards.xp,
      coins:      template.rewards.coins,
      title:      template.rewards.title,
      reputation: template.rewards.reputation,
    },
    startedAt: new Date().toISOString(),
    expiresAt,
  };
}

function pickTemplates(templates: readonly QuestTemplate[], count: number, seed: number): QuestTemplate[] {
  const len    = templates.length;
  const result: QuestTemplate[] = [];
  for (let i = 0; i < count && i < len; i++) result.push(templates[(seed + i) % len]);
  return result;
}

export function refreshQuests(player: Player): Player {
  const now     = Date.now();
  const DAY_MS  = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  let updated = player;

  if (now - (updated.cooldowns.questDailyRefresh ?? 0) >= DAY_MS) {
    const nonDaily   = updated.quests.filter((q) => q.type !== 'daily');
    const expiresAt  = new Date(now + DAY_MS).toISOString();
    const newDailies = pickTemplates(DAILY_TEMPLATES, 3, Math.floor(now / DAY_MS))
      .map((t) => templateToQuest(t, expiresAt));
    updated = { ...updated, quests: [...nonDaily, ...newDailies], cooldowns: { ...updated.cooldowns, questDailyRefresh: now } };
  }

  if (now - (updated.cooldowns.questWeeklyRefresh ?? 0) >= WEEK_MS) {
    const nonWeekly   = updated.quests.filter((q) => q.type !== 'weekly');
    const expiresAt   = new Date(now + WEEK_MS).toISOString();
    const newWeeklies = pickTemplates(WEEKLY_TEMPLATES, 3, Math.floor(now / WEEK_MS))
      .map((t) => templateToQuest(t, expiresAt));
    updated = { ...updated, quests: [...nonWeekly, ...newWeeklies], cooldowns: { ...updated.cooldowns, questWeeklyRefresh: now } };
  }

  return updated;
}

export function ensureStoryQuests(player: Player): Player {
  const existing = new Set(player.quests.map((q) => q.templateId));
  const missing  = STORY_TEMPLATES.filter((t) => !existing.has(t.templateId));
  if (missing.length === 0) return player;
  return { ...player, quests: [...player.quests, ...missing.map((t) => templateToQuest(t))] };
}

export function progressQuests(player: Player, event: QuestEvent): Player {
  const now       = new Date();
  const increment = event.count ?? 1;
  const updatedQuests = player.quests.map((quest): Quest => {
    if (quest.status !== 'active') return quest;
    if (quest.expiresAt && new Date(quest.expiresAt) < now) return { ...quest, status: 'failed' };
    let changed = false;
    const updatedObjectives = quest.objectives.map((obj): QuestObjective => {
      if (obj.completed || obj.id !== event.type) return obj;
      const newCurrent = Math.min(obj.current + increment, obj.required);
      if (newCurrent === obj.current) return obj;
      changed = true;
      return { ...obj, current: newCurrent, completed: newCurrent >= obj.required };
    });
    if (!changed) return quest;
    const allDone = updatedObjectives.every((o) => o.completed);
    return {
      ...quest,
      objectives:  updatedObjectives,
      status:      allDone ? 'completed' : quest.status,
      completedAt: allDone ? new Date().toISOString() : quest.completedAt,
    };
  });
  return { ...player, quests: updatedQuests };
}

export function claimQuestRewards(
  player: Player,
  questId: string
): { player: Player; xp: number; coins: number; title?: TitleId; reputation: number; error?: string } {
  const idx = player.quests.findIndex((q) => q.id === questId);
  if (idx === -1) return { player, xp: 0, coins: 0, reputation: 0, error: 'Quest not found.' };
  const quest = player.quests[idx];
  if (quest.status !== 'completed') {
    return {
      player, xp: 0, coins: 0, reputation: 0,
      error: quest.status === 'claimed' ? 'Rewards already claimed.' : `Quest is not completed yet (${quest.status}).`,
    };
  }
  const xp         = quest.rewards.xp         ?? 0;
  const coins      = quest.rewards.coins      ?? 0;
  const title      = quest.rewards.title;
  const reputation = quest.rewards.reputation ?? 0;
  const updatedQuests = [...player.quests];
  updatedQuests[idx]  = { ...quest, status: 'claimed' };
  let updatedPlayer: Player = { ...player, quests: updatedQuests };
  if (title && !updatedPlayer.titles.includes(title)) {
    updatedPlayer = { ...updatedPlayer, titles: [...updatedPlayer.titles, title] };
  }
  if (reputation > 0) {
    updatedPlayer = { ...updatedPlayer, reputation: updatedPlayer.reputation + reputation };
  }
  return { player: updatedPlayer, xp, coins, title, reputation };
}

export function objectiveBar(current: number, required: number, length = 10): string {
  const filled = Math.round((current / required) * length);
  return '\u2588'.repeat(Math.min(filled, length)) + '\u2591'.repeat(Math.max(0, length - filled));
}
