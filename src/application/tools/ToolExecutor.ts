/**
 * Application: Tool Execution Pipeline.
 * Handles tool discovery, policy checks, and safe execution.
 */

import type { ToolDefinition, ToolContext, ToolResult, ToolRegistry, ToolPolicy, ToolCategory, ToolRiskLevel } from '../../domain/tools/types.js';

/**
 * In-memory tool registry implementation.
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  list(category?: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => !category || t.category === category);
  }

  getDefinitionsForLLM(): Array<{ name: string; description: string; parameters: Record<string, string> }> {
    return this.list('READ_ONLY').map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

/**
 * Default tool policy implementation.
 */
export class DefaultToolPolicy implements ToolPolicy {
  private confirmations = new Set<string>();
  private riskLevels = new Map<string, ToolRiskLevel>();
  private registry: ToolRegistry | null = null;

  constructor(registry?: ToolRegistry) {
    this.registry = registry ?? null;
  }

  isAllowed(toolName: string, _userId: string, isAdmin: boolean): boolean {
    // Look up the tool from the registry
    const tool = this.registry?.get(toolName) ?? this.getToolForPolicy(toolName);

    // Read-only tools are always allowed
    if (tool?.category === 'READ_ONLY') return true;

    // Action tools require admin
    if (tool?.category === 'ACTION' && !isAdmin) return false;

    // Dangerous tools require admin
    if (tool?.category === 'DANGEROUS' && !isAdmin) return false;

    return true;
  }

  requiresConfirmation(toolName: string): boolean {
    return this.confirmations.has(toolName);
  }

  getRiskLevel(toolName: string): ToolRiskLevel {
    return this.riskLevels.get(toolName) ?? 'low';
  }

  /** @internal */ setToolRisk(toolName: string, level: ToolRiskLevel): void {
    this.riskLevels.set(toolName, level);
  }

  /** @internal */ setRequiresConfirmation(toolName: string, requires: boolean): void {
    if (requires) this.confirmations.add(toolName);
    else this.confirmations.delete(toolName);
  }

  private getToolForPolicy(toolName: string): ToolDefinition | null {
    // Fallback if no registry injected
    return null;
  }
}

/**
 * Tool executor with policy enforcement.
 */
export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private policy: ToolPolicy,
  ) {}

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    // 1. Look up tool
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { success: false, error: `Tool '${toolName}' not found` };
    }

    // 2. Policy check
    if (!this.policy.isAllowed(toolName, ctx.userId, ctx.isAdmin)) {
      return { success: false, error: `Tool '${toolName}' is not permitted for this user` };
    }

    // 3. Confirmation check
    if (this.policy.requiresConfirmation(toolName)) {
      return {
        success: false,
        requiresConfirmation: true,
        error: `Tool '${toolName}' requires confirmation`,
      };
    }

    // 4. Execute
    try {
      const result = await tool.execute(params, ctx);
      return result;
    } catch (err) {
      return {
        success: false,
        error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
