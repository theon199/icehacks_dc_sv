import { canReadHealth, resolveHealthConnection } from './connection';

describe('resolveHealthConnection', () => {
  it('is unsupported off iOS whatever else is true', () => {
    expect(
      resolveHealthConnection({ platform: 'unsupported', enabled: true, request: 'answered' }),
    ).toBe('unsupported');
  });

  it('is unavailable on devices without Health', () => {
    expect(
      resolveHealthConnection({ platform: 'unavailable', enabled: true, request: 'answered' }),
    ).toBe('unavailable');
  });

  it('is off until the person turns it on', () => {
    expect(
      resolveHealthConnection({ platform: 'available', enabled: false, request: 'answered' }),
    ).toBe('off');
  });

  it.each(['unknown', 'should_request'] as const)(
    'needs permission while the request status is %s',
    (request) => {
      expect(resolveHealthConnection({ platform: 'available', enabled: true, request })).toBe(
        'needs_permission',
      );
    },
  );

  it('is connected once the permission sheet has been answered', () => {
    expect(
      resolveHealthConnection({ platform: 'available', enabled: true, request: 'answered' }),
    ).toBe('connected');
  });
});

describe('canReadHealth', () => {
  it('only reads when connected', () => {
    expect(canReadHealth('connected')).toBe(true);
    for (const state of ['unsupported', 'unavailable', 'off', 'needs_permission'] as const) {
      expect(canReadHealth(state)).toBe(false);
    }
  });
});
