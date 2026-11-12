import { screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { ConversationFooter, type ConversationFooterProps } from './ConversationFooter';

const base: ConversationFooterProps = {
  sending: false,
  problem: null,
  unanswered: false,
  blocked: false,
  limited: false,
  followUps: ['Can I make it spicier?'],
  quotaNote: null,
  onRetry: jest.fn(),
  onDismissProblem: jest.fn(),
  onFollowUp: jest.fn(),
};

describe('ConversationFooter', () => {
  it('offers follow-up questions while Chef is free', async () => {
    await renderWithTheme(<ConversationFooter {...base} />);
    expect(screen.getByText('Can I make it spicier?')).toBeOnTheScreen();
  });

  it.each([
    ['another thread is waiting for its answer', { blocked: true }],
    ['the daily limit is spent', { limited: true }],
  ])('hides follow-ups and "Ask again" while %s', async (_, state) => {
    await renderWithTheme(<ConversationFooter {...base} unanswered {...state} />);
    expect(screen.queryByText('Can I make it spicier?')).toBeNull();
    expect(screen.queryByTestId('chef-ask-again')).toBeNull();
  });
});
