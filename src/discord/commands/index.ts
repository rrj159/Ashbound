import type { ChatInputCommandInteraction } from 'discord.js';
export interface AshenCommand { data: { name: string; toJSON(): unknown }; execute: (interaction: ChatInputCommandInteraction) => Promise<void>; }
import * as askCmd from './ask.js';
import * as resetCmd from './reset.js';
import * as pingCmd from './ping.js';
import * as helpCmd from './help.js';
import * as remindCmd from './remind.js';
const COMMANDS: AshenCommand[] = [
  { data: askCmd.data, execute: askCmd.execute }, { data: helpCmd.data, execute: helpCmd.execute },
  { data: resetCmd.data, execute: resetCmd.execute }, { data: pingCmd.data, execute: pingCmd.execute }, { data: remindCmd.data, execute: remindCmd.execute },
];
export function getCommands(): AshenCommand[] { return COMMANDS; }
