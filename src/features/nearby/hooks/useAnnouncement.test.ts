import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useAnnouncement } from './useAnnouncement';

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

beforeEach(() => announce.mockClear());

describe('useAnnouncement', () => {
  it('stays quiet about what was already showing when it mounted', async () => {
    await renderHook(() => useAnnouncement('Thanks', 'place-a'));
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a new message once', async () => {
    const { rerender } = await renderHook(
      ({ message }: { message: string | null }) => useAnnouncement(message, 'place-a'),
      { initialProps: { message: null } },
    );
    await rerender({ message: 'Thanks' });
    await rerender({ message: 'Thanks' });
    await rerender({ message: null });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Thanks');
  });

  it('does not announce what another place already shows when the scope changes', async () => {
    const { rerender } = await renderHook(
      ({ message, scope }: { message: string | null; scope: string }) =>
        useAnnouncement(message, scope),
      { initialProps: { message: null as string | null, scope: 'place-a' } },
    );
    await rerender({ message: 'Thanks', scope: 'place-b' });
    expect(announce).not.toHaveBeenCalled();
  });
});
