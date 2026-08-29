/**
 * Tool Registry — safe Discord context tools for AI.
 * Read-only by default. Action tools require confirmation.
 */

import type { Client, Guild, User, TextChannel, Role } from 'discord.js';

export type ToolCategory = 'READ_ONLY' | 'ACTION';

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, 'string' | 'number' | 'boolean'>;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  client: Client;
  guildId?: string;
  channelId?: string;
  userId: string;
}

const tools = new Map<string, ToolDefinition>();

/** Register a tool. */
export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | null {
  return tools.get(name) ?? null;
}

export function listTools(category?: ToolCategory): ToolDefinition[] {
  return Array.from(tools.values()).filter((t) => !category || t.category === category);
}

// === Read-only tools (no confirmation needed) ===

registerTool({
  name: 'get_server_info',
  description: 'Get information about the current Discord server.',
  category: 'READ_ONLY',
  parameters: {},
  execute: async (_params, ctx) => {
    if (!ctx.guildId) return { error: 'No guild context' };
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return { error: 'Guild not found' };
    return {
      name: guild.name,
      memberCount: guild.memberCount,
      createdAt: guild.createdAt.toISOString(),
      boostTier: guild.premiumTier,
      channelCount: guild.channels.cache.size,
    };
  },
});

registerTool({
  name: 'get_user_info',
  description: 'Get public information about a Discord user.',
  category: 'READ_ONLY',
  parameters: { userId: 'string' },
  execute: async (params, ctx) => {
    const userId = (params.userId as string) || ctx.userId;
    try {
      const user = await ctx.client.users.fetch(userId);
      return {
        tag: user.tag,
        bot: user.bot,
        createdAt: user.createdAt.toISOString(),
        avatarUrl: user.displayAvatarURL({ size: 256 }),
      };
    } catch {
      return { error: 'User not found' };
    }
  },
});

registerTool({
  name: 'get_channel_info',
  description: 'Get information about a Discord channel.',
  category: 'READ_ONLY',
  parameters: { channelId: 'string' },
  execute: async (params, ctx) => {
    const channelId = (params.channelId as string) || ctx.channelId;
    if (!channelId) return { error: 'No channel context' };
    try {
      const channel = await ctx.client.channels.fetch(channelId);
      if (!channel) return { error: 'Channel not found' };
      return {
        name: 'name' in channel ? channel.name : 'unknown',
        type: channel.type,
        id: channel.id,
        createdAt: 'createdAt' in channel && channel.createdAt ? channel.createdAt.toISOString() : null,
      };
    } catch {
      return { error: 'Channel not found' };
    }
  },
});

registerTool({
  name: 'get_role_info',
  description: 'Get information about a Discord role.',
  category: 'READ_ONLY',
  parameters: { roleId: 'string' },
  execute: async (params, ctx) => {
    if (!ctx.guildId) return { error: 'No guild context' };
    const roleId = params.roleId as string;
    if (!roleId) return { error: 'roleId required' };
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    const role = guild?.roles.cache.get(roleId);
    if (!role) return { error: 'Role not found' };
    return {
      name: role.name,
      color: role.hexColor,
      memberCount: role.members.size,
      position: role.position,
      hoist: role.hoist,
      mentionable: role.mentionable,
    };
  },
});

registerTool({
  name: 'get_recent_messages',
  description: 'Get a limited number of recent messages from a channel.',
  category: 'READ_ONLY',
  parameters: { channelId: 'string', limit: 'number' },
  execute: async (params, ctx) => {
    const channelId = (params.channelId as string) || ctx.channelId;
    const limit = Math.min(Math.max((params.limit as number) || 10, 1), 25);
    if (!channelId) return { error: 'No channel context' };
    try {
      const channel = await ctx.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return { error: 'Not a text channel' };
      const messages = await channel.messages.fetch({ limit });
      return messages
        .map((m) => ({ author: m.author.tag, content: m.content.slice(0, 500), timestamp: m.createdAt.toISOString() }))
        .reverse();
    } catch {
      return { error: 'Could not fetch messages' };
    }
  },
});

registerTool({
  name: 'calculate',
  description: 'Evaluate a simple math expression.',
  category: 'READ_ONLY',
  parameters: { expression: 'string' },
  execute: async (params) => {
    const expr = String(params.expression || '').replace(/[^0-9+\-*/().% ]/g, '');
    if (!expr) return { error: 'Empty expression' };
    try {
      // Safe-only: no eval with raw user input, restrict chars
      const result = Function(`"use strict"; return (${expr});`)();
      return { expression: expr, result };
    } catch {
      return { error: 'Invalid expression' };
    }
  },
});

/** AI may register action tools (e.g., create_reminder) but they go through a confirmation flow. */
export const ACTION_TOOL_NAMES: string[] = [];

export function getToolDefinitionsForLLM(): Array<{ name: string; description: string; parameters: Record<string, string> }> {
  return listTools('READ_ONLY').map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
