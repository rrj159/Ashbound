/**
 * /session — Manage persistent AI conversation sessions.
 *
 * Sessions maintain multi-turn context across multiple slash command invocations.
 * Stored in-memory per user, with optional topic/persona.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

interface Session {
  userId: string;
  channelId: string;
  topic: string;
  persona: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; ts: number }>;
  createdAt: number;
  lastActivity: number;
}

const _sessions = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle timeout
const MAX_HISTORY = 20;

function getSession(userId: string): Session {
  let s = _sessions.get(userId);
  if (!s || Date.now() - s.lastActivity > SESSION_TTL_MS) {
    s = {
      userId,
      channelId: '',
      topic: 'Casual conversation',
      persona: 'Ashbound — wise sage of the Ashen Realms',
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    _sessions.set(userId, s);
  }
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of _sessions) {
    if (now - s.lastActivity > SESSION_TTL_MS) _sessions.delete(id);
  }
}, 5 * 60 * 1000);

export const data = new SlashCommandBuilder()
  .setName('session')
  .setDescription('Manage your AI conversation session')
  .addSubcommand((s) =>
    s.setName('start').setDescription('Start a new AI conversation session')
      .addStringOption((o) => o.setName('topic').setDescription('Conversation topic').setMaxLength(200))
      .addStringOption((o) => o.setName('persona').setDescription('AI persona to use').setMaxLength(200)),
  )
  .addSubcommand((s) => s.setName('end').setDescription('End your current session'))
  .addSubcommand((s) => s.setName('status').setDescription('Show your current session status'))
  .addSubcommand((s) =>
    s.setName('send').setDescription('Send a message within your active session')
      .addStringOption((o) => o.setName('message').setDescription('Your message').setRequired(true).setMaxLength(2000)),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const sub    = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'start') {
    const topic  = interaction.options.getString('topic')  ?? 'Casual conversation';
    const rawPersona = interaction.options.getString('persona') ?? 'Ashbound — wise sage of the Ashen Realms';

    // Sanitize persona to prevent system prompt injection
    const persona = rawPersona
      .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[FILTERED]')
      .replace(/you\s+are\s+now\s+(a|an|the)/gi, 'you are a')
      .replace(/system\s*:\s*/gi, '')
      .slice(0, 200);

    const session = getSession(userId);
    session.topic = topic;
    session.persona = persona;
    session.messages = [];
    session.createdAt = Date.now();
    session.lastActivity = Date.now();
    session.channelId = interaction.channelId;
    _sessions.set(userId, session);

    const embed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setTitle('🟢 Session started')
      .setDescription(`**Topic:** ${topic}\n**Persona:** ${persona}\n\nUse \`/session send <message>\` to chat.`)
      .setFooter({ text: 'Session expires after 30 min of inactivity.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === 'end') {
    const existed = _sessions.delete(userId);
    const embed = new EmbedBuilder()
      .setColor(existed ? 0x9e9e9e : 0xff5252)
      .setTitle(existed ? '⚪ Session ended' : 'No active session')
      .setDescription(existed ? 'Your conversation context has been cleared.' : 'Start one with `/session start`.');
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === 'status') {
    const session = _sessions.get(userId);
    if (!session) {
      await interaction.reply({ content: 'No active session. Use `/session start` to begin.', ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x2196f3)
      .setTitle('🟢 Active Session')
      .addFields(
        { name: 'Topic',   value: session.topic,   inline: true  },
        { name: 'Persona', value: session.persona, inline: true  },
        { name: 'Messages', value: `${session.messages.length} / ${MAX_HISTORY}`, inline: true },
        { name: 'Started',  value: new Date(session.createdAt).toLocaleString(), inline: true },
        { name: 'Last activity', value: new Date(session.lastActivity).toLocaleString(), inline: true },
      )
      .setFooter({ text: 'Expires 30 min after last activity.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === 'send') {
    if (isRateLimited(interaction.user.id)) {
      await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
      return;
    }

    const session = _sessions.get(userId);
    if (!session) {
      await interaction.reply({ content: 'No active session. Use `/session start` first.', ephemeral: true });
      return;
    }
    const message = interaction.options.getString('message', true);
    await interaction.deferReply();
    session.messages.push({ role: 'user', content: message, ts: Date.now() });
    if (session.messages.length > MAX_HISTORY) session.messages.shift();
    session.lastActivity = Date.now();

    try {
      const messages = [
        { role: 'system' as const, content: session.persona },
        ...session.messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const response = await router.chat(
        { messages },
        { intent: 'conversation' },
      );
      session.messages.push({ role: 'assistant', content: response.content, ts: Date.now() });
      if (session.messages.length > MAX_HISTORY) session.messages.shift();

      const embed = new EmbedBuilder()
        .setColor(0x6a1b9a)
        .setAuthor({ name: session.topic })
        .setDescription(response.content.length > 2000 ? response.content.slice(0, 1997) + '...' : response.content)
        .setFooter({ text: `${session.messages.length} message${session.messages.length === 1 ? '' : 's'} in session` });
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ content: '❌ The session voice wavers. Try again.' });
    }
  }
}
