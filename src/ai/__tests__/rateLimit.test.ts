jest.useFakeTimers();

function freshModule() {
  jest.resetModules();
  return require('../rateLimit');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isRateLimited', () => {
  it('first request is not rate limited', () => {
    const { isRateLimited } = freshModule();
    expect(isRateLimited('user1')).toBe(false);
  });

  it('requests within limit are not rate limited', () => {
    const { isRateLimited } = freshModule();
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited('user1')).toBe(false);
    }
  });

  it('requests exceeding limit are rate limited', () => {
    const { isRateLimited } = freshModule();
    for (let i = 0; i < 10; i++) {
      isRateLimited('user1');
    }
    expect(isRateLimited('user1')).toBe(true);
  });

  it('rate limit resets after window expires', () => {
    const { isRateLimited } = freshModule();
    for (let i = 0; i < 10; i++) {
      isRateLimited('user1');
    }
    expect(isRateLimited('user1')).toBe(true);

    jest.advanceTimersByTime(30_001);

    expect(isRateLimited('user1')).toBe(false);
  });
});

describe('getRateLimitStatus', () => {
  it('returns correct info', () => {
    const { isRateLimited, getRateLimitStatus } = freshModule();
    isRateLimited('user1');
    isRateLimited('user1');

    const status = getRateLimitStatus('user1');
    expect(status.requests).toBe(2);
    expect(status.resetAt).toBeGreaterThan(Date.now());
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(status.remainingMs).toBeLessThanOrEqual(30_000);
  });

  it('returns zero state for unknown user', () => {
    const { getRateLimitStatus } = freshModule();
    const status = getRateLimitStatus('unknown');
    expect(status.requests).toBe(0);
    expect(status.remainingMs).toBe(0);
  });
});

describe('multiple users', () => {
  it('are tracked independently', () => {
    const { isRateLimited } = freshModule();
    for (let i = 0; i < 10; i++) {
      isRateLimited('user1');
    }
    expect(isRateLimited('user1')).toBe(true);
    expect(isRateLimited('user2')).toBe(false);
  });
});
