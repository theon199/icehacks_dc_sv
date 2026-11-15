import { act, fireEvent, screen, within } from '@testing-library/react-native';
import {
  Keyboard,
  ScrollView,
  type KeyboardAvoidingViewProps,
  type KeyboardEventListener,
  type View,
} from 'react-native';

import { renderWithTheme } from '@/test/render';

import { DoneReviewSheet } from './DoneReviewSheet';

// The keyboard-avoiding stage as a plain view that keeps its props, so its behaviour can be read.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const RN = jest.requireActual<{ View: typeof View }>('react-native');
  return {
    __esModule: true,
    default: (props: KeyboardAvoidingViewProps) => <RN.View {...props} />,
  };
});

const addListener = jest.spyOn(Keyboard, 'addListener');
const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');

async function renderSheet() {
  await renderWithTheme(
    <DoneReviewSheet
      hasPhoto={false}
      rating={null}
      again={null}
      notes=""
      saving={false}
      canSave
      onRating={jest.fn()}
      onAgain={jest.fn()}
      onNotes={jest.fn()}
      onAddPhoto={jest.fn()}
      onSave={jest.fn()}
      onShare={jest.fn()}
    />,
  );
}

/** Plays the keyboard finishing its slide up, as iOS reports it. */
async function keyboardShows() {
  const listeners = addListener.mock.calls
    .filter(([event]) => event === 'keyboardDidShow')
    .map(([, listener]) => listener as KeyboardEventListener);
  await act(async () => {
    for (const listener of listeners) {
      listener({
        duration: 250,
        easing: 'keyboard',
        endCoordinates: { screenX: 0, screenY: 508, width: 390, height: 336 },
      });
    }
  });
}

describe('DoneReviewSheet', () => {
  it('rises with the keyboard the way the glass sheet does', async () => {
    await renderSheet();
    expect(screen.getByTestId('cook-done-stage').props.behavior).toBe('padding');
  });

  it('keeps "How was it?" in the fixed head, out of the scrolling form', async () => {
    await renderSheet();
    expect(screen.getByRole('header', { name: 'How was it?' })).toBeTruthy();
    expect(within(screen.getByTestId('cook-done-scroll')).queryByText('How was it?')).toBeNull();
  });

  it('scrolls the field and Save above the keyboard while typing what changed', async () => {
    await renderSheet();
    await fireEvent(screen.getByTestId('cook-done-notes'), 'focus');
    await keyboardShows();
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('leaves the form where it is when the keyboard opens for something else', async () => {
    await renderSheet();
    await keyboardShows();
    expect(scrollToEnd).not.toHaveBeenCalled();
  });
});
