/** Natural AI conversation: DMs, mentions, and replies to Ashbound. */
import { Client, type Message, GatewayIntentBits } from 'discord.js';
import { isRateLimited } from '../../ai/rateLimit.js';
import { conversationKey, converse } from '../../ai/conversation.js';

const USER_ERROR = "❌ I couldn't reach any available AI provider right now. Please try again shortly.";

export function splitDiscordMessage(content: string, max = 2000): string[] {
  const chunks: string[] = [];
  let remaining = content.trim();
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = remaining.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : ['I could not generate a response.'];
}

async function sendResponse(msg: Message, content: string): Promise<void> {
  const [first, ...rest] = splitDiscordMessage(content);
  await msg.reply({ content: first });
  for (const chunk of rest) { if ('send' in msg.channel) await msg.channel.send({ content: chunk }); }
}

export function setupMessageHandler(client: Client): void {
  if (!client.options.intents.has(GatewayIntentBits.MessageContent)) console.warn('[MessageHandler] MessageContent intent not set — enable it in the Discord Developer Portal.');
  client.on('messageCreate', async (msg: Message) => {
    if (msg.author.bot || !msg.content.trim()) return;
    const isDM = msg.channel.isDMBased();
    const mentioned = !!client.user && msg.mentions.has(client.user.id);
    const isReply = !!msg.reference?.messageId;
    let replyContext: string | undefined;
    if (isReply) {
      try {
        const referenced = await msg.fetchReference();
        if (referenced.author.id === client.user?.id) replyContext = referenced.content.slice(0, 4000);
      } catch { /* Deleted/unavailable reference: not a bot reply. */ }
    }
    if (!isDM && !mentioned && !replyContext) return;
    const prompt = mentioned ? msg.content.replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '').trim() : msg.content.trim();
    if (!prompt) { if (mentioned) await msg.reply('What would you like help with?').catch(() => {}); return; }
    if (isRateLimited(msg.author.id)) { await msg.reply('⏸️ You are sending requests too fast. Please slow down and try again in a moment.').catch(() => {}); return; }
    const image = msg.attachments.find((a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name ?? a.url));
    try {
      if ('sendTyping' in msg.channel) await msg.channel.sendTyping();
      const answer = await converse({ key: conversationKey({ userId: msg.author.id, guildId: msg.guildId, channelId: msg.channelId }), prompt, replyContext, imageUrl: image?.url });
      await sendResponse(msg, answer);
    } catch (err) {
      console.error('[MessageHandler] AI error:', err instanceof Error ? err.message : err);
      await msg.reply(USER_ERROR).catch(() => {});
    }
  });
}
