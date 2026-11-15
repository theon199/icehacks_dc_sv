import { act, screen } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import { AppState, type AppStateStatus, type View as ViewType } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { ViewCheck } from './ViewCheck';

/** The part of expo's permission response the view check reads. */
interface Permission {
  granted: boolean;
  canAskAgain: boolean;
}

const BLOCKED: Permission = { granted: false, canAskAgain: false };
const GRANTED: Permission = { granted: true, canAskAgain: true };

/** What the system would answer right now; the person changes it in the Settings app. */
const mockSystem: { permission: Permission } = { permission: BLOCKED };
/** The latest focus effect, so a test can bring the screen back into focus. */
const mockFocus: { effect: (() => void) | null } = { effect: null };

jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<{ View: typeof ViewType }>('react-native');
  return {
    CameraView: () => React.createElement(View, { testID: 'mock-camera' }),
    // Like expo's hook: reads once on mount, and the third entry reads again on demand.
    useCameraPermissions: () => {
      const [permission, setPermission] = React.useState<Permission | null>(null);
      const read = React.useCallback(async () => {
        setPermission(mockSystem.permission);
        return mockSystem.permission;
      }, []);
      React.useEffect(() => {
        void read();
      }, [read]);
      return [permission, jest.fn(), read];
    },
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  return {
    useFocusEffect: (effect: () => void) => {
      React.useEffect(() => {
        mockFocus.effect = effect;
        effect();
      }, [effect]);
    },
  };
});

function renderViewCheck() {
  return renderWithTheme(
    <ViewCheck onBack={jest.fn()} onStart={jest.fn()} coachUnavailable={false} />,
  );
}

describe('ViewCheck', () => {
  let onAppState: ((state: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    mockSystem.permission = BLOCKED;
    mockFocus.effect = null;
    onAppState = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onAppState = listener;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the preview once camera access is turned on in Settings and the app comes back', async () => {
    await renderViewCheck();
    expect(screen.getByText('Camera access is off')).toBeOnTheScreen();
    expect(screen.queryByTestId('mock-camera')).toBeNull();

    mockSystem.permission = GRANTED;
    await act(async () => onAppState?.('background'));
    expect(screen.queryByTestId('mock-camera')).toBeNull();
    await act(async () => onAppState?.('active'));

    expect(screen.getByTestId('mock-camera')).toBeOnTheScreen();
    expect(screen.queryByTestId('setup-allow-camera')).toBeNull();
  });

  it('reads camera access again when the screen comes back into focus', async () => {
    await renderViewCheck();
    expect(screen.queryByTestId('mock-camera')).toBeNull();

    mockSystem.permission = GRANTED;
    await act(async () => mockFocus.effect?.());

    expect(screen.getByTestId('mock-camera')).toBeOnTheScreen();
  });
});
