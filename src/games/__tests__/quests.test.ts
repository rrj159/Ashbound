import {
  refreshQuests, ensureStoryQuests, progressQuests,
  claimQuestRewards, objectiveBar,
} from '../quests';
import { createDefaultPlayer } from '../types';

describe('ensureStoryQuests', () => {
  test('adds story quests to new player', () => {
    const p = ensureStoryQuests(createDefaultPlayer('u1', 'Qt1'));
    expect(p.quests.filter(q => q.type === 'story').length).toBeGreaterThan(0);
  });
  test('is idempotent', () => {
    const once = ensureStoryQuests(createDefaultPlayer('u2', 'Qt2'));
    expect(once.quests.length).toBe(ensureStoryQuests(once).quests.length);
  });
});

describe('refreshQuests', () => {
  test('generates daily quests', () => {
    const p = refreshQuests(createDefaultPlayer('u3', 'Qt3'));
    expect(p.quests.filter(q => q.type === 'daily').length).toBeGreaterThan(0);
  });
  test('generates weekly quests', () => {
    const p = refreshQuests(createDefaultPlayer('u4', 'Qt4'));
    expect(p.quests.filter(q => q.type === 'weekly').length).toBeGreaterThan(0);
  });
  test('does not re-generate within window', () => {
    const once = refreshQuests(createDefaultPlayer('u5', 'Qt5'));
    expect(refreshQuests(once).quests.length).toBe(once.quests.length);
  });
});

describe('progressQuests', () => {
  test('increments matching objective', () => {
    let p = ensureStoryQuests(createDefaultPlayer('u6', 'Qt6'));
    const before = p.quests.find(q => q.templateId === 'story_first_blood')!;
    expect(before.objectives[0].current).toBe(0);
    const up = progressQuests(p, { type: 'monster_kill', count: 1 });
    const after = up.quests.find(q => q.templateId === 'story_first_blood')!;
    expect(after.objectives[0].current).toBe(1);
    expect(after.status).toBe('completed');
  });
  test('does not increment mismatched type', () => {
    let p  = ensureStoryQuests(createDefaultPlayer('u7', 'Qt7'));
    const up = progressQuests(p, { type: 'boss_kill', count: 1 });
    expect(up.quests.find(q => q.templateId === 'story_first_blood')!.objectives[0].current).toBe(0);
  });
  test('accumulates events', () => {
    let p = ensureStoryQuests(createDefaultPlayer('u8', 'Qt8'));
    p = progressQuests(p, { type: 'monster_kill', count: 1 });
    p = progressQuests(p, { type: 'monster_kill', count: 1 });
    expect(p.quests.find(q => q.templateId === 'story_centurion')!.objectives[0].current).toBe(2);
  });
  test('does not progress claimed quest', () => {
    let p = ensureStoryQuests(createDefaultPlayer('u9', 'Qt9'));
    p = progressQuests(p, { type: 'hunt_complete', count: 1 });
    const comp = p.quests.find(q => q.templateId === 'story_first_hunt' && q.status === 'completed')!;
    const { player: claimed } = claimQuestRewards(p, comp.id);
    const after = progressQuests(claimed, { type: 'hunt_complete', count: 1 });
    expect(after.quests.find(q => q.templateId === 'story_first_hunt')!.status).toBe('claimed');
  });
});

describe('claimQuestRewards', () => {
  test('claims and returns rewards', () => {
    let p = ensureStoryQuests(createDefaultPlayer('u10', 'Qt10'));
    p = progressQuests(p, { type: 'hunt_complete', count: 1 });
    const q = p.quests.find(q => q.templateId === 'story_first_hunt' && q.status === 'completed')!;
    const r = claimQuestRewards(p, q.id);
    expect(r.error).toBeUndefined();
    expect(r.xp).toBeGreaterThan(0);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.player.quests.find(qq => qq.id === q.id)?.status).toBe('claimed');
  });
  test('error for nonexistent quest',  () => expect(claimQuestRewards(createDefaultPlayer('u11', 'Qt11'), 'bad').error).toBeDefined());
  test('error for incomplete quest',   () => {
    let p = ensureStoryQuests(createDefaultPlayer('u12', 'Qt12'));
    const active = p.quests.find(q => q.status === 'active')!;
    expect(claimQuestRewards(p, active.id).error).toBeDefined();
  });
  test('grants title reward', () => {
    let p = ensureStoryQuests(createDefaultPlayer('u13', 'Qt13'));
    p = progressQuests(p, { type: 'boss_kill', count: 1 });
    const q = p.quests.find(q => q.templateId === 'story_trial_by_fire')!;
    const r = claimQuestRewards(p, q.id);
    expect(r.title).toBe('dragon_slayer');
    expect(r.player.titles).toContain('dragon_slayer');
  });
});

describe('objectiveBar', () => {
  test('full bar',    () => expect(objectiveBar(10, 10, 10)).toBe('\u2588'.repeat(10)));
  test('empty bar',   () => expect(objectiveBar(0, 10, 10)).toBe('\u2591'.repeat(10)));
  test('partial bar', () => {
    const bar = objectiveBar(5, 10, 10);
    expect(bar).toContain('\u2588');
    expect(bar).toContain('\u2591');
    expect(bar.length).toBe(10);
  });
});
