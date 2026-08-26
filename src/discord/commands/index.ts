import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  SlashCommandBuilder,
} from 'discord.js';

export interface AshenCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['setName']>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction) => Promise<boolean>;
  handleSelect?: (interaction: StringSelectMenuInteraction) => Promise<boolean>;
}

import { profileCommand }   from './profile.js';
import { statusCommand }    from './status.js';
import { huntCommand }      from './hunt.js';
import { adventureCommand } from './adventure.js';
import { inventoryCommand } from './inventory.js';
import { gearCommand }      from './gear.js';

const COMMANDS: AshenCommand[] = [
  profileCommand,
  statusCommand,
  huntCommand,
  adventureCommand,
  inventoryCommand,
  gearCommand,
];

export function getCommands(): AshenCommand[] {
  return COMMANDS;
}
