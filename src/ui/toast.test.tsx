import { act, screen, userEvent, within } from '@testing-library/react-native';
import type * as React from 'react';
import { Platform } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { ToastHost } from './ToastHost';
import { toast, useToastStore } from './toastStore';

// The native overlay has no Jest implementation; a tagged View shows where the toast is mounted.
jest.mock('react-native-screens', () => {
  const { View } = jest.requireActual<{
    View: React.ComponentType<{ testID: string; children?: React.ReactNode }>;
  }>('react-native');
  const { createElement } = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual<object>('react-native-screens'),
    FullWindowOverlay: ({ children }: { children: React.ReactNode }) =>
      createElement(View, { testID: 'full-window-overlay' }, children),
  };
});

describe('toast store', () => {
  beforeEach(() => useToastStore.getState().clear());

  it('queues toasts with defaults', () => {
    toast.show({ message: 'Saved' });
    const [first] = useToastStore.getState().queue;
    expect(first).toMatchObject({ message: 'Saved', tone: 'neutral', durationMs: 3200 });
  });

  it('collapses duplicate messages and keeps at most three', () => {
    toast.error('Offline');
    toast.error('Offline');
    toast.show({ message: 'a' });
    toast.show({ message: 'b' });
    toast.show({ message: 'c' });
    const messages = useToastStore.getState().queue.map((t) => t.message);
    expect(messages).toEqual(['a', 'b', 'c']);
  });

  it('dismisses by id', () => {
    const id = toast.success('Added to plan');
    toast.dismiss(id);
    expect(useToastStore.getState().queue).toHaveLength(0);
  });
});

describe('ToastHost', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().clear();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the front toast and hides it after its duration', async () => {
    await renderWithTheme(<ToastHost />);
    await act(async () => {
      toast.show({ message: 'Recipe saved', durationMs: 1000 });
    });
    expect(screen.getByRole('alert', { name: 'Recipe saved' })).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('runs the action and dismisses', async () => {
    const onUndo = jest.fn();
    await renderWithTheme(<ToastHost />);
    await act(async () => {
      toast.show({ message: 'Removed from plan', action: { label: 'Undo', onPress: onUndo } });
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it('mounts above native sheets on iOS', async () => {
    await renderWithTheme(<ToastHost />);
    await act(async () => {
      toast.error('Could not post');
    });
    const overlay = screen.getByTestId('full-window-overlay');
    expect(within(overlay).getByRole('alert', { name: 'Could not post' })).toBeOnTheScreen();
  });

  it('uses a plain layer on other platforms', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderWithTheme(<ToastHost />);
    await act(async () => {
      toast.show({ message: 'Saved' });
    });
    expect(screen.getByRole('alert', { name: 'Saved' })).toBeOnTheScreen();
    expect(screen.queryByTestId('full-window-overlay')).toBeNull();
  });

  it('renders nothing when the queue is empty', async () => {
    await renderWithTheme(<ToastHost />);
    expect(screen.queryByTestId('full-window-overlay')).toBeNull();
  });
});
