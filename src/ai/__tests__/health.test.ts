jest.useFakeTimers();

function freshModule() {
  jest.resetModules();
  return require('../health');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recordSuccess', () => {
  it('updates health correctly', () => {
    const { recordSuccess, getHealth } = freshModule();
    recordSuccess('openai', 200, 100);

    const h = getHealth('openai');
    expect(h.status).toBe('healthy');
    expect(h.totalSuccesses).toBe(1);
    expect(h.totalFailures).toBe(0);
    expect(h.consecutiveFailures).toBe(0);
    expect(h.tokensUsed).toBe(100);
    expect(h.lastSuccessAt).toBe(Date.now());
    expect(h.avgLatencyMs).toBe(200);
  });
});

describe('recordFailure', () => {
  it('updates health and creates cooldown', () => {
    const { recordFailure, getHealth, isOnCooldown } = freshModule();
    recordFailure('openai', new Error('network error'));

    const h = getHealth('openai');
    expect(h.totalFailures).toBe(1);
    expect(h.consecutiveFailures).toBe(1);
    expect(h.lastError).toContain('network error');
    expect(h.cooldownUntil).toBeGreaterThan(Date.now());
    expect(isOnCooldown('openai')).toBe(true);
  });
});

describe('isOnCooldown', () => {
  it('returns true when provider is on cooldown', () => {
    const { recordFailure, isOnCooldown } = freshModule();
    recordFailure('openai', new Error('fail'));
    expect(isOnCooldown('openai')).toBe(true);
  });

  it('returns false after cooldown expires', () => {
    const { recordFailure, isOnCooldown } = freshModule();
    recordFailure('openai', new Error('fail'));

    jest.advanceTimersByTime(120_000);

    expect(isOnCooldown('openai')).toBe(false);
  });

  it('returns false for unknown provider', () => {
    const { isOnCooldown } = freshModule();
    expect(isOnCooldown('nonexistent')).toBe(false);
  });
});

describe('getHealth', () => {
  it('returns correct status', () => {
    const { getHealth } = freshModule();
    const h = getHealth('openai');
    expect(h.status).toBe('unknown');
    expect(h.consecutiveFailures).toBe(0);
    expect(h.successRate).toBe(1);
  });
});

describe('getAllHealth', () => {
  it('returns all providers', () => {
    const { recordSuccess, recordFailure, getAllHealth } = freshModule();
    recordSuccess('openai', 100);
    recordFailure('anthropic', new Error('fail'));

    const all = getAllHealth();
    expect(all['openai']).toBeDefined();
    expect(all['anthropic']).toBeDefined();
    expect(all['openai'].status).toBe('healthy');
  });
});

describe('clearCooldown', () => {
  it('removes cooldown', () => {
    const { recordFailure, clearCooldown, isOnCooldown, getHealth } = freshModule();
    recordFailure('openai', new Error('fail'));
    expect(isOnCooldown('openai')).toBe(true);

    clearCooldown('openai');

    expect(isOnCooldown('openai')).toBe(false);
    const h = getHealth('openai');
    expect(h.cooldownUntil).toBeNull();
    expect(h.cooldownRemainingMs).toBe(0);
  });
});

describe('clearAllCooldowns', () => {
  it('removes all cooldowns', () => {
    const { recordFailure, clearAllCooldowns, isOnCooldown } = freshModule();
    recordFailure('openai', new Error('fail'));
    recordFailure('anthropic', new Error('fail'));
    expect(isOnCooldown('openai')).toBe(true);
    expect(isOnCooldown('anthropic')).toBe(true);

    clearAllCooldowns();

    expect(isOnCooldown('openai')).toBe(false);
    expect(isOnCooldown('anthropic')).toBe(false);
  });
});

describe('consecutive failures', () => {
  it('increase status degradation', () => {
    const { recordFailure, getHealth } = freshModule();
    const provider = 'degrade-test';

    recordFailure(provider, new Error('1'));
    jest.advanceTimersByTime(120_000);
    expect(getHealth(provider).consecutiveFailures).toBe(1);

    recordFailure(provider, new Error('2'));
    jest.advanceTimersByTime(120_000);
    expect(getHealth(provider).consecutiveFailures).toBe(2);
    expect(getHealth(provider).status).toBe('degraded');

    recordFailure(provider, new Error('3'));
    recordFailure(provider, new Error('4'));
    recordFailure(provider, new Error('5'));
    jest.advanceTimersByTime(120_000);
    expect(getHealth(provider).consecutiveFailures).toBe(5);
    expect(getHealth(provider).status).toBe('unhealthy');
  });

  it('reset on success', () => {
    const { recordFailure, recordSuccess, getHealth, clearCooldown } = freshModule();
    const provider = 'reset-test';

    recordFailure(provider, new Error('1'));
    recordFailure(provider, new Error('2'));
    expect(getHealth(provider).consecutiveFailures).toBe(2);

    recordSuccess(provider, 100);
    clearCooldown(provider);
    expect(getHealth(provider).consecutiveFailures).toBe(0);
    expect(getHealth(provider).status).toBe('healthy');
  });
});

describe('error detection', () => {
  it('detects rate limit errors', () => {
    const { recordFailure, getHealth } = freshModule();
    const provider = 'ratelimit-test';

    recordFailure(provider, { status: 429 });

    const h = getHealth(provider);
    expect(h.rateLimitHits).toBe(1);
  });

  it('detects rate limit errors via string matching', () => {
    const { recordFailure, getHealth } = freshModule();
    const provider = 'ratelimit-str-test';

    recordFailure(provider, new Error('rate limit exceeded'));

    const h = getHealth(provider);
    expect(h.rateLimitHits).toBe(1);
  });

  it('detects timeout errors', () => {
    const { recordFailure, getHealth } = freshModule();
    const provider = 'timeout-test';

    recordFailure(provider, new Error('ETIMEDOUT'));

    const h = getHealth(provider);
    expect(h.lastError).toContain('ETIMEDOUT');
  });
});
