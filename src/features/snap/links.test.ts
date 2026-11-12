import { snapCameraHref, snapModeParam } from './links';

describe('snapCameraHref', () => {
  it('opens the camera on the asked-for mode', () => {
    expect(snapCameraHref({ mode: 'pantry' })).toEqual({
      pathname: '/snap',
      params: { mode: 'pantry' },
    });
    expect(snapCameraHref({ mode: 'dish' })).toEqual({
      pathname: '/snap',
      params: { mode: 'dish' },
    });
  });

  it('opens the camera as it was left when no mode is given', () => {
    expect(snapCameraHref()).toBe('/snap');
  });
});

describe('snapModeParam', () => {
  it('reads the two camera modes', () => {
    expect(snapModeParam('pantry')).toBe('pantry');
    expect(snapModeParam(['dish'])).toBe('dish');
    expect(snapModeParam(' dish ')).toBe('dish');
  });

  it('ignores anything else', () => {
    expect(snapModeParam(undefined)).toBeUndefined();
    expect(snapModeParam('')).toBeUndefined();
    expect(snapModeParam('Pantry')).toBeUndefined();
    expect(snapModeParam('menu')).toBeUndefined();
  });
});
