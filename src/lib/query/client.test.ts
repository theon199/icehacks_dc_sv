import { createQueryClient, isOnline, retryDelay, shouldRetry } from './client';
import { ApiError } from '../api/errors';

describe('shouldRetry', () => {
  it('retries transient failures up to twice', () => {
    const network = new ApiError({ kind: 'network', functionName: 'f' });
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, network)).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
    expect(shouldRetry(0, new Error('unknown'))).toBe(true);
  });

  it('never retries auth, validation or rate-limit errors', () => {
    for (const kind of ['unauthorized', 'forbidden', 'validation', 'rate_limited'] as const) {
      expect(shouldRetry(0, new ApiError({ kind, functionName: 'f' }))).toBe(false);
    }
  });
});

describe('retryDelay', () => {
  it('backs off exponentially with a cap', () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(2)).toBe(4000);
    expect(retryDelay(10)).toBe(15_000);
  });
});

describe('isOnline', () => {
  it('treats unknown reachability as online', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: null } as never)).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: false } as never)).toBe(false);
    expect(isOnline({ isConnected: false, isInternetReachable: null } as never)).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('applies Famara defaults', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(60_000);
    expect(defaults.queries?.retry).toBe(shouldRetry);
    expect(defaults.mutations?.retry).toBe(false);
  });
});
