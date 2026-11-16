import type { CheckInResponse } from '@/lib/api/foodMap';

import { checkInRejectionMessage, checkInSuccessMessage } from './checkInMessages';

const base: CheckInResponse = {
  visitsHere: 1,
  totalCheckIns: 5,
  healthy: true,
  region: { id: 'r', name: 'Pico', done: 2, total: 5, claimed: false },
  claimedNow: false,
  claimedRegions: [],
};

const onMap = { claimed: 1, total: 7 };

describe('checkInSuccessMessage', () => {
  it('counts a first visit towards the region', () => {
    expect(checkInSuccessMessage('Saigon Herb', base, onMap)).toEqual({
      message: 'Checked in at Saigon Herb. Pico: 2 of 5 healthy spots',
      claimed: false,
    });
  });

  it('counts repeat visits at the place', () => {
    expect(checkInSuccessMessage('Saigon Herb', { ...base, visitsHere: 3 }, onMap).message).toBe(
      'Checked in at Saigon Herb. 3 check-ins here',
    );
  });

  it('marks a claim', () => {
    const result = {
      ...base,
      region: { id: 'r', name: 'Pico', done: 5, total: 5, claimed: true },
      claimedNow: true,
      claimedRegions: [{ id: 'r', name: 'Pico' }],
    };
    expect(checkInSuccessMessage('Saigon Herb', result, { claimed: 2, total: 7 })).toEqual({
      message: 'Pico claimed. Every healthy spot checked · 2 of 7',
      claimed: true,
    });
  });

  it('says only where for a place outside any region', () => {
    expect(checkInSuccessMessage('Corner Cafe', { ...base, region: null }, onMap).message).toBe(
      'Checked in at Corner Cafe',
    );
  });
});

describe('checkInRejectionMessage', () => {
  const distance = (m: number) => `${Math.round(m)} m`;
  const time = () => '7:40 PM';

  it('explains each refusal', () => {
    expect(
      checkInRejectionMessage({ reason: 'too_far', distanceM: 340, allowedM: 230 }, distance, time),
    ).toBe("You're 340 m away. Check in when you're at the place.");
    expect(
      checkInRejectionMessage(
        { reason: 'rate_limited', limit: 'cooldown', retryAt: '2026-11-15T19:40:00Z' },
        distance,
        time,
      ),
    ).toBe('You checked in here recently. You can check in again at 7:40 PM.');
    expect(
      checkInRejectionMessage(
        { reason: 'rate_limited', limit: 'daily', retryAt: '2026-11-15T19:40:00Z' },
        distance,
        time,
      ),
    ).toBe("That's all of today's check-ins. You can check in again at 7:40 PM.");
    expect(checkInRejectionMessage({ reason: 'not_found' }, distance, time)).toMatch(
      /couldn't be found/,
    );
  });
});
