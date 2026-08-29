import type {
  ChatInputCommandInteraction, ButtonInteraction,
  StringSelectMenuInteraction, SlashCommandBuilder,
} from 'discord.js';

export interface AshenCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['setName']> | { name: string; description: string };
  execute:       (interaction: ChatInputCommandInteraction)   => Promise<void>;
  handleButton?: (interaction: ButtonInteraction)             => Promise<boolean>;
  handleSelect?: (interaction: StringSelectMenuInteraction)   => Promise<boolean>;
}

// AI commands
import * as chatCmd        from './chat.js';
import * as describeCmd    from './describe.js';
import * as askCmd         from './ask.js';
import * as modelCmd       from './model.js';
import * as sessionCmd     from './session.js';
import * as resetCmd       from './reset.js';
import * as clearCmd       from './clear.js';
import * as understandCmd  from './understand.js';
import * as summarizeCmd   from './summarize.js';
import * as translateCmd   from './translate.js';
import * as narrateCmd     from './narrate.js';
import * as loreCmd        from './lore.js';
import * as rollCmd        from './roll.js';

// Utility commands
import * as pingCmd        from './ping.js';
import * as helpCmd        from './help.js';
import * as remindCmd      from './remind.js';
import * as idsCmd         from './ids.js';
import * as avatarCmd      from './avatar.js';
import * as statusCmd      from './status.js';
import * as serverinfoCmd  from './serverinfo.js';
import * as userinfoCmd    from './userinfo.js';
import * as channelinfoCmd from './channelinfo.js';
import * as roleinfoCmd    from './roleinfo.js';

const COMMANDS: AshenCommand[] = [
  // AI
  { data: chatCmd.data, execute: chatCmd.execute },
  { data: describeCmd.data, execute: describeCmd.execute },
  { data: askCmd.data, execute: askCmd.execute },
  { data: modelCmd.data, execute: modelCmd.execute },
  { data: sessionCmd.data, execute: sessionCmd.execute },
  { data: resetCmd.data, execute: resetCmd.execute },
  { data: clearCmd.data, execute: clearCmd.execute },
  { data: understandCmd.data, execute: understandCmd.execute },
  { data: summarizeCmd.data, execute: summarizeCmd.execute },
  { data: translateCmd.data, execute: translateCmd.execute },
  { data: narrateCmd.data, execute: narrateCmd.execute },
  { data: loreCmd.data, execute: loreCmd.execute },
  { data: rollCmd.data, execute: rollCmd.execute },

  // Utility
  { data: pingCmd.data, execute: pingCmd.execute },
  { data: helpCmd.data, execute: helpCmd.execute },
  { data: remindCmd.data, execute: remindCmd.execute },
  { data: idsCmd.data, execute: idsCmd.execute },
  { data: avatarCmd.data, execute: avatarCmd.execute },
  { data: statusCmd.data, execute: statusCmd.execute },
  { data: serverinfoCmd.data, execute: serverinfoCmd.execute },
  { data: userinfoCmd.data, execute: userinfoCmd.execute },
  { data: channelinfoCmd.data, execute: channelinfoCmd.execute },
  { data: roleinfoCmd.data, execute: roleinfoCmd.execute },
];

export function getCommands(): AshenCommand[] {
  return COMMANDS;
}
