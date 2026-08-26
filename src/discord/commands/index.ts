import type {
  ChatInputCommandInteraction, ButtonInteraction,
  StringSelectMenuInteraction, SlashCommandBuilder,
} from 'discord.js';

export interface AshenCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['setName']>;
  execute:       (interaction: ChatInputCommandInteraction)   => Promise<void>;
  handleButton?: (interaction: ButtonInteraction)             => Promise<boolean>;
  handleSelect?: (interaction: StringSelectMenuInteraction)   => Promise<boolean>;
}

import { profileCommand }   from './profile.js';
import { statusCommand }    from './status.js';
import { huntCommand }      from './hunt.js';
import { adventureCommand } from './adventure.js';
import { inventoryCommand } from './inventory.js';
import { gearCommand }      from './gear.js';
import { petsCommand }      from './pets.js';
import { questsCommand }    from './quests.js';
import { titleCommand }     from './title.js';

const COMMANDS: AshenCommand[] = [
  profileCommand,
  statusCommand,
  huntCommand,
  adventureCommand,
  inventoryCommand,
  gearCommand,
  petsCommand,
  questsCommand,
  titleCommand,
];

export function getCommands(): AshenCommand[] {
  return COMMANDS;
}
