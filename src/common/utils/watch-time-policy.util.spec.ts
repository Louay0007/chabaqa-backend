import { applyWatchTimePolicy, computeAllowedWatchAdvanceSeconds } from './watch-time-policy.util';

describe('watch-time-policy.util', () => {
  it('accepts small forward progress within the allowed window', () => {
    const now = new Date('2026-03-07T12:00:30.000Z');
    const result = applyWatchTimePolicy({
      currentWatchTimeSeconds: 120,
      requestedWatchTimeSeconds: 150,
      lastAcceptedAt: new Date('2026-03-07T12:00:00.000Z'),
      now,
    });

    expect(result.ignored).toBe(false);
    expect(result.acceptedWatchTimeSeconds).toBe(150);
    expect(result.acceptedAdvanceSeconds).toBe(30);
    expect(result.maxAllowedAdvanceSeconds).toBe(computeAllowedWatchAdvanceSeconds(30));
  });

  it('ignores stale or lower totals', () => {
    const result = applyWatchTimePolicy({
      currentWatchTimeSeconds: 180,
      requestedWatchTimeSeconds: 175,
      lastAcceptedAt: new Date('2026-03-07T12:00:00.000Z'),
      now: new Date('2026-03-07T12:00:10.000Z'),
    });

    expect(result.ignored).toBe(true);
    expect(result.acceptedAdvanceSeconds).toBe(0);
    expect(result.acceptedWatchTimeSeconds).toBe(180);
  });

  it('caps accepted watch time to the authoritative duration', () => {
    const result = applyWatchTimePolicy({
      currentWatchTimeSeconds: 80,
      requestedWatchTimeSeconds: 140,
      maxDurationSeconds: 100,
      lastAcceptedAt: new Date('2026-03-07T12:00:00.000Z'),
      now: new Date('2026-03-07T12:00:30.000Z'),
    });

    expect(result.ignored).toBe(false);
    expect(result.acceptedWatchTimeSeconds).toBe(100);
    expect(result.acceptedAdvanceSeconds).toBe(20);
  });
});
