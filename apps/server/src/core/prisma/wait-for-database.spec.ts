import { describe, expect, it, vi } from 'vitest';
import { waitForDatabase } from './wait-for-database.js';

const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

describe('waitForDatabase', () => {
  it('returns immediately when the database answers', async () => {
    const sleep = vi.fn();
    await waitForDatabase({ probe: () => Promise.resolve(), sleep, log: vi.fn() });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with the configured delays then succeeds, logging each retry', async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(refused())
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await waitForDatabase({ probe, sleep, log });

    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]?.[0]).toContain('Retry 1/3 in 1s');
    expect(log.mock.calls[1]?.[0]).toContain('Retry 2/3 in 2s');
  });

  it('fails with the last error after 3 retries (1s, 5s, 10s)', async () => {
    const probe = vi.fn().mockRejectedValue(refused());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(waitForDatabase({ probe, sleep, log: vi.fn() })).rejects.toThrow(/ECONNREFUSED/);

    expect(probe).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[1000], [2000], [5000]]);
  });

  it('does not retry non-network failures', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('schema behind'));
    const sleep = vi.fn();

    await expect(waitForDatabase({ probe, sleep, log: vi.fn() })).rejects.toThrow(/schema behind/);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
