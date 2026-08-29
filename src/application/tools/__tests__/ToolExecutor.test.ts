import { InMemoryToolRegistry, DefaultToolPolicy, ToolExecutor } from '../ToolExecutor';
import type { ToolDefinition, ToolContext } from '../../../domain/tools/types';

describe('ToolExecutor', () => {
  let registry: InMemoryToolRegistry;
  let policy: DefaultToolPolicy;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
    policy = new DefaultToolPolicy();
    executor = new ToolExecutor(registry, policy);
  });

  describe('InMemoryToolRegistry', () => {
    it('should register and retrieve tools', () => {
      const tool: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        category: 'READ_ONLY',
        riskLevel: 'low',
        parameters: {},
        requiresConfirmation: false,
        execute: async () => ({ success: true }),
      };

      registry.register(tool);
      expect(registry.get('test-tool')).toBe(tool);
    });

    it('should list tools by category', () => {
      const readOnly: ToolDefinition = {
        name: 'read-tool',
        description: 'Read only',
        category: 'READ_ONLY',
        riskLevel: 'low',
        parameters: {},
        requiresConfirmation: false,
        execute: async () => ({ success: true }),
      };

      const action: ToolDefinition = {
        name: 'action-tool',
        description: 'Action',
        category: 'ACTION',
        riskLevel: 'medium',
        parameters: {},
        requiresConfirmation: true,
        execute: async () => ({ success: true }),
      };

      registry.register(readOnly);
      registry.register(action);

      expect(registry.list('READ_ONLY')).toHaveLength(1);
      expect(registry.list('ACTION')).toHaveLength(1);
      expect(registry.list()).toHaveLength(2);
    });

    it('should return null for unknown tools', () => {
      expect(registry.get('unknown')).toBeNull();
    });
  });

  describe('ToolExecutor.execute', () => {
    it('should execute allowed tools', async () => {
      const tool: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        category: 'READ_ONLY',
        riskLevel: 'low',
        parameters: {},
        requiresConfirmation: false,
        execute: async () => ({ success: true, data: 'result' }),
      };

      registry.register(tool);

      const ctx: ToolContext = {
        client: {},
        userId: 'user1',
        isAdmin: false,
      };

      const result = await executor.execute('test-tool', {}, ctx);
      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
    });

    it('should reject unknown tools', async () => {
      const ctx: ToolContext = {
        client: {},
        userId: 'user1',
        isAdmin: false,
      };

      const result = await executor.execute('unknown-tool', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle tool execution errors', async () => {
      const tool: ToolDefinition = {
        name: 'failing-tool',
        description: 'A failing tool',
        category: 'READ_ONLY',
        riskLevel: 'low',
        parameters: {},
        requiresConfirmation: false,
        execute: async () => { throw new Error('Tool failed'); },
      };

      registry.register(tool);

      const ctx: ToolContext = {
        client: {},
        userId: 'user1',
        isAdmin: false,
      };

      const result = await executor.execute('failing-tool', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });
  });
});
