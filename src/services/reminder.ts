/**
 * Reminder service — persistent reminders stored on disk.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), '.data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  guildId: string | null;
  message: string;
  fireAt: number; // ms timestamp
  createdAt: number;
  fired: boolean;
}

let _reminders: Reminder[] = [];
let _loaded = false;
const _timers = new Map<string, NodeJS.Timeout>();

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

async function loadReminders(): Promise<void> {
  if (_loaded) return;
  await ensureDir();
  try {
    const data = await fs.readFile(REMINDERS_FILE, 'utf-8');
    _reminders = JSON.parse(data);
  } catch {
    _reminders = [];
  }
  _loaded = true;
}

async function saveReminders(): Promise<void> {
  await ensureDir();
  await fs.writeFile(REMINDERS_FILE, JSON.stringify(_reminders, null, 2), 'utf-8');
}

export function parseDuration(input: string): number | null {
  // Supports: 30s, 5m, 2h, 1d
  const match = input.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60 * 1000;
  if (unit.startsWith('h')) return value * 60 * 60 * 1000;
  if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;
  return null;
}

export async function createReminder(opts: {
  userId: string;
  channelId: string;
  guildId: string | null;
  message: string;
  durationMs: number;
  onFire: (r: Reminder) => Promise<void>;
}): Promise<Reminder> {
  await loadReminders();
  const now = Date.now();
  const reminder: Reminder = {
    id: `r_${now}_${Math.random().toString(36).slice(2, 8)}`,
    userId: opts.userId,
    channelId: opts.channelId,
    guildId: opts.guildId,
    message: opts.message,
    fireAt: now + opts.durationMs,
    createdAt: now,
    fired: false,
  };
  _reminders.push(reminder);
  await saveReminders();
  scheduleTimer(reminder, opts.onFire);
  return reminder;
}

function scheduleTimer(reminder: Reminder, onFire: (r: Reminder) => Promise<void>): void {
  const delay = Math.max(0, reminder.fireAt - Date.now());
  if (delay > 2_147_483_647) return; // > 24.8 days
  const timer = setTimeout(async () => {
    reminder.fired = true;
    try {
      await onFire(reminder);
    } catch (err) {
      console.error('[Reminder] Fire error:', err);
    }
    await saveReminders();
  }, delay);
  _timers.set(reminder.id, timer);
}

export async function restoreReminders(onFire: (r: Reminder) => Promise<void>): Promise<number> {
  await loadReminders();
  let count = 0;
  for (const r of _reminders) {
    if (!r.fired && r.fireAt > Date.now()) {
      scheduleTimer(r, onFire);
      count++;
    } else if (!r.fired && r.fireAt <= Date.now()) {
      r.fired = true;
    }
  }
  await saveReminders();
  return count;
}

export function clearAllTimers(): void {
  for (const t of _timers.values()) clearTimeout(t);
  _timers.clear();
}
