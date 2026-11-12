import * as Haptics from 'expo-haptics';

import { areHapticsEnabled, haptics, setHapticsEnabled } from './haptics';

describe('haptics', () => {
  afterEach(() => setHapticsEnabled(true));

  it('plays feedback when enabled', () => {
    haptics.selection();
    haptics.success();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('stays silent when turned off', () => {
    setHapticsEnabled(false);
    expect(areHapticsEnabled()).toBe(false);
    haptics.impact('heavy');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('swallows platform failures', async () => {
    jest.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('no engine'));
    expect(() => haptics.selection()).not.toThrow();
    await Promise.resolve();
  });
});
