import {
  initialLocationState,
  locationReducer,
  originOf,
  permissionOutcome,
  type LocationEvent,
  type LocationState,
} from './permission';

const granted = { status: 'granted', canAskAgain: true } as const;
const undetermined = { status: 'undetermined', canAskAgain: true } as const;
const deniedAskable = { status: 'denied', canAskAgain: true } as const;
const deniedForGood = { status: 'denied', canAskAgain: false } as const;
const point = { latitude: 40.7, longitude: -74 };

const run = (events: LocationEvent[], from: LocationState = initialLocationState) =>
  events.reduce(locationReducer, from);

describe('permissionOutcome', () => {
  it.each([
    [granted, 'granted'],
    [undetermined, 'ask'],
    [deniedAskable, 'ask'],
    [deniedForGood, 'blocked'],
  ] as const)('%o → %s', (permission, outcome) => {
    expect(permissionOutcome(permission)).toBe(outcome);
  });
});

describe('locationReducer', () => {
  it('starts by checking', () => {
    expect(initialLocationState).toEqual({ step: 'checking' });
  });

  it('goes straight to locating when access was already given', () => {
    expect(run([{ type: 'checked', permission: granted }])).toEqual({ step: 'locating' });
  });

  it('explains before asking for the first time', () => {
    expect(run([{ type: 'checked', permission: undetermined }])).toEqual({ step: 'explain' });
  });

  it('asks, then locates after the person allows it', () => {
    const state = run([
      { type: 'checked', permission: undetermined },
      { type: 'request' },
      { type: 'answered', permission: granted },
      { type: 'located', point },
    ]);
    expect(state).toEqual({
      step: 'located',
      origin: { point, source: 'device', label: null },
    });
    expect(originOf(state)?.point).toEqual(point);
  });

  it('shows the blocked state after a refusal the system will not ask about again', () => {
    expect(
      run([
        { type: 'checked', permission: undetermined },
        { type: 'request' },
        { type: 'answered', permission: deniedForGood },
      ]),
    ).toEqual({ step: 'blocked' });
  });

  it('returns to the explanation when the prompt can be shown again', () => {
    expect(
      run([
        { type: 'checked', permission: undetermined },
        { type: 'request' },
        { type: 'answered', permission: deniedAskable },
      ]),
    ).toEqual({ step: 'explain' });
  });

  it('marks the location unavailable when no position can be found', () => {
    expect(run([{ type: 'checked', permission: granted }, { type: 'locateFailed' }])).toEqual({
      step: 'unavailable',
    });
  });

  it('falls back to a city search from any dead end, remembering why', () => {
    const blocked = run([{ type: 'checked', permission: deniedForGood }, { type: 'chooseCity' }]);
    expect(blocked).toEqual({ step: 'manual', origin: null, reason: 'blocked' });
    const chosen = run([{ type: 'checked', permission: undetermined }, { type: 'chooseCity' }]);
    expect(chosen).toEqual({ step: 'manual', origin: null, reason: 'chosen' });
  });

  it('searches from the selected city', () => {
    const state = run([
      { type: 'checked', permission: deniedForGood },
      { type: 'chooseCity' },
      { type: 'citySelected', point, label: 'Brooklyn' },
    ]);
    expect(originOf(state)).toEqual({ point, source: 'city', label: 'Brooklyn' });
  });

  it('keeps a chosen city when a late permission check arrives', () => {
    const manual = run([{ type: 'chooseCity' }, { type: 'citySelected', point, label: 'Austin' }]);
    expect(locationReducer(manual, { type: 'checked', permission: granted })).toBe(manual);
  });

  it('re-checks access when switching back to the device location', () => {
    const manual = run([{ type: 'chooseCity' }]);
    expect(locationReducer(manual, { type: 'useDevice' })).toEqual({ step: 'checking' });
  });

  it('ignores events that do not fit the current step', () => {
    const explain = run([{ type: 'checked', permission: undetermined }]);
    expect(locationReducer(explain, { type: 'located', point })).toBe(explain);
    expect(locationReducer(explain, { type: 'answered', permission: granted })).toBe(explain);
    expect(locationReducer({ step: 'locating' }, { type: 'request' })).toEqual({
      step: 'locating',
    });
  });

  it('has no origin until located or a city is chosen', () => {
    expect(originOf({ step: 'explain' })).toBeNull();
    expect(originOf({ step: 'manual', origin: null, reason: 'chosen' })).toBeNull();
  });

  it('goes back to the previous device results when a change of area is cancelled', () => {
    const located = run([
      { type: 'checked', permission: granted },
      { type: 'located', point },
    ]);
    const changing = locationReducer(located, { type: 'chooseCity' });
    expect(originOf(changing)).toBeNull();
    expect(locationReducer(changing, { type: 'cancelCity' })).toEqual(located);
  });

  it('goes back to the previous city when a change of area is cancelled', () => {
    const austin = run([{ type: 'chooseCity' }, { type: 'citySelected', point, label: 'Austin' }]);
    const changing = locationReducer(austin, { type: 'chooseCity' });
    expect(changing).toMatchObject({ step: 'manual', origin: null, previous: { label: 'Austin' } });
    expect(originOf(locationReducer(changing, { type: 'cancelCity' }))).toEqual({
      point,
      source: 'city',
      label: 'Austin',
    });
  });

  it('has nothing to cancel back to without an earlier area', () => {
    const manual = run([{ type: 'chooseCity' }]);
    expect(locationReducer(manual, { type: 'cancelCity' })).toBe(manual);
  });
});
