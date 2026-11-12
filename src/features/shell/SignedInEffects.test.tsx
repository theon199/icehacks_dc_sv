import { act, render, screen } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth';

import { SignedInEffects } from './SignedInEffects';

const mockFlush = jest.fn();
const mockResume = jest.fn();
const mockBridgeMounted = jest.fn();

jest.mock('@/features/notifications', () => ({
  NotificationBridge: () => {
    const { useEffect } = jest.requireActual<typeof ReactModule>('react');
    const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
    useEffect(() => mockBridgeMounted(), []);
    return <MockText>notification bridge</MockText>;
  },
}));
jest.mock('@/features/cook', () => ({ useFlushPendingCooks: () => mockFlush() }));
jest.mock('./usePendingInviteResume', () => ({ usePendingInviteResume: () => mockResume() }));

const initial = useSessionStore.getState();
const adultBirthYear = new Date().getFullYear() - 30;

function signIn(userId: string, onboardingComplete = true) {
  useSessionStore.getState().signedIn({ userId, birthYear: adultBirthYear, onboardingComplete });
}

beforeEach(() => useSessionStore.setState(initial, true));

describe('SignedInEffects', () => {
  it.each([
    ['while the session loads', () => undefined],
    ['when signed out', () => useSessionStore.getState().signedOut()],
    ['during setup', () => signIn('person-1', false)],
  ])('runs nothing %s', async (_when, arrange) => {
    arrange();
    await render(
      <>
        <Text>screen</Text>
        <SignedInEffects />
      </>,
    );
    expect(screen.getByText('screen')).toBeOnTheScreen();
    expect(screen.queryByText('notification bridge')).toBeNull();
    expect(mockFlush).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('mounts the notification bridge, cook retry and invite resume when signed in', async () => {
    signIn('person-1');
    await render(<SignedInEffects />);
    expect(screen.getByText('notification bridge')).toBeOnTheScreen();
    expect(mockFlush).toHaveBeenCalled();
    expect(mockResume).toHaveBeenCalled();
  });

  it('stops when the person signs out', async () => {
    signIn('person-1');
    await render(<SignedInEffects />);
    expect(screen.getByText('notification bridge')).toBeOnTheScreen();

    await act(async () => useSessionStore.getState().signedOut());
    expect(screen.queryByText('notification bridge')).toBeNull();
  });

  it('starts over for a different account', async () => {
    signIn('person-1');
    await render(<SignedInEffects />);
    expect(mockBridgeMounted).toHaveBeenCalledTimes(1);

    await act(async () => signIn('person-2'));
    expect(screen.getByText('notification bridge')).toBeOnTheScreen();
    expect(mockBridgeMounted).toHaveBeenCalledTimes(2);
  });
});
