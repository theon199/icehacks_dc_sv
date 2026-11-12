import { act, screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { ToastHost } from './ToastHost';
import { toast, useToastStore } from './toastStore';

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
  afterEach(() => jest.useRealTimers());

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
});
