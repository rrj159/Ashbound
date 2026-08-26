import { checkAndAwardTitles } from '../titles';
import { createDefaultPlayer } from '../types';

describe('checkAndAwardTitles', () => {
  test('new player only has novice', () => {
    const player = createDefaultPlayer('u1', 'User1');
    checkAndAwardTitles(player);
    expect(player.titles).toEqual(['novice']);
  });

  test('awards hunter title at 50 kills', () => {
    const player = createDefaultPlayer('u2', 'User2');
    player.statistics.monstersKilled = 50;
    const newTitles = checkAndAwardTitles(player);
    expect(newTitles).toContain('hunter');
    expect(player.titles).toContain('hunter');
  });

  test('awards millionaire at 1M earned', () => {
    const player = createDefaultPlayer('u3', 'User3');
    player.statistics.totalCoinsEarned = 1_000_000;
    const newTitles = checkAndAwardTitles(player);
    expect(newTitles).toContain('millionaire');
  });

  test('does not re-award existing titles', () => {
    const player = createDefaultPlayer('u4', 'User4');
    player.statistics.monstersKilled = 50;
    checkAndAwardTitles(player);
    const second = checkAndAwardTitles(player);
    expect(second).not.toContain('hunter');
    expect(player.titles.filter((t) => t === 'hunter')).toHaveLength(1);
  });
});
