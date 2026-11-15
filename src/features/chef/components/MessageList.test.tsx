import type * as FlashListModule from '@shopify/flash-list';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode, forwardRef, useImperativeHandle } from 'react';
import { Text, type ScrollView, type ScrollViewProps } from 'react-native';

import type { ChefMessage } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { MessageList } from './MessageList';

// The real list's scroll methods need native layout; a ScrollView stand-in keeps the props and
// records where the thread is asked to scroll.
const mockScrollToEnd = jest.fn();
type MockListProps = ScrollViewProps & { ListFooterComponent?: ReactNode };
jest.mock('@shopify/flash-list', () => {
  const actual = jest.requireActual<typeof FlashListModule>('@shopify/flash-list');
  const React = jest.requireActual<{
    forwardRef: typeof forwardRef;
    useImperativeHandle: typeof useImperativeHandle;
  }>('react');
  const RN = jest.requireActual<{ ScrollView: typeof ScrollView }>('react-native');
  const FlashList = React.forwardRef<unknown, MockListProps>(function FlashList(props, ref) {
    React.useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
    const { ListFooterComponent, ...rest } = props;
    return <RN.ScrollView {...rest}>{ListFooterComponent}</RN.ScrollView>;
  });
  return { ...actual, FlashList };
});

const messages: ChefMessage[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'What can I cook tonight?',
    at: '2026-11-11T10:00:00.000Z',
    recipeIds: [],
  },
];

/** The thread as the person left it: scrolled to `offset` in 2000pt of content, 600pt tall. */
async function standAt(offset: number) {
  await fireEvent(screen.getByTestId('chef-thread'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
  });
  await fireEvent(screen.getByTestId('chef-messages'), 'contentSizeChange', 390, 2000);
  await fireEvent.scroll(screen.getByTestId('chef-messages'), {
    nativeEvent: {
      contentOffset: { x: 0, y: offset },
      contentSize: { width: 390, height: 2000 },
      layoutMeasurement: { width: 390, height: 600 },
    },
  });
  mockScrollToEnd.mockClear();
}

async function keyboardShrinksThreadTo(height: number) {
  await fireEvent(screen.getByTestId('chef-thread'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

async function footerGrowsContentTo(height: number) {
  await fireEvent(screen.getByTestId('chef-messages'), 'contentSizeChange', 390, height);
}

async function renderThread() {
  await renderWithTheme(<MessageList messages={messages} footer={<Text>Thinking…</Text>} />);
}

describe('MessageList', () => {
  it('keeps the newest message in view when the keyboard shrinks the thread', async () => {
    await renderThread();
    await standAt(1400);
    await keyboardShrinksThreadTo(300);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('brings a new footer card into view while the person is at the end', async () => {
    await renderThread();
    await standAt(1400);
    await footerGrowsContentTo(2120);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('leaves someone reading older messages where they are', async () => {
    await renderThread();
    await standAt(200);
    await keyboardShrinksThreadTo(300);
    await footerGrowsContentTo(2120);
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });
});
