/**
 * Domain: Tool contracts.
 * Interfaces for the AI tool system.
 */

export type ToolCategory = 'READ_ONLY' | 'ACTION' | 'DANGEROUS';

export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool category for permission checks */
  category: ToolCategory;
  /** Risk level for confirmation prompts */
  riskLevel: ToolRiskLevel;
  /** Parameter schema */
  parameters: Record<string, 'string' | 'number' | 'boolean'>;
  /** Whether this tool requires confirmation before execution */
  requiresConfirmation: boolean;
  /** Execute the tool with given parameters */
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  /** Discord client for API calls */
  client: unknown;
  /** Guild ID if in a server */
  guildId?: string;
  /** Channel ID */
  channelId?: string;
  /** User ID requesting the tool */
  userId: string;
  /** Whether the user is an admin */
  isAdmin: boolean;
}

export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Whether this result requires user confirmation */
  requiresConfirmation?: boolean;
}

export interface ToolRegistry {
  /** Register a tool */
  register(tool: ToolDefinition): void;
  /** Get a tool by name */
  get(name: string): ToolDefinition | null;
  /** List all tools, optionally filtered by category */
  list(category?: ToolCategory): ToolDefinition[];
  /** Get tool definitions formatted for LLM consumption */
  getDefinitionsForLLM(): Array<{ name: string; description: string; parameters: Record<string, string> }>;
}

export interface ToolPolicy {
  /** Check if a user is allowed to use a tool */
  isAllowed(toolName: string, userId: string, isAdmin: boolean): boolean;
  /** Check if a tool requires confirmation */
  requiresConfirmation(toolName: string): boolean;
  /** Get the risk level of a tool */
  getRiskLevel(toolName: string): ToolRiskLevel;
}

export interface ToolExecutor {
  /** Execute a tool with policy checks */
  execute(toolName: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
