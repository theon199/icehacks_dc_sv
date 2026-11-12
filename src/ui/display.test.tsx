import { screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';
import { renderWithTheme } from '@/test/render';

import { Avatar, initialsFor } from './Avatar';
import { Badge, badgeText } from './Badge';
import { EmptyState } from './EmptyState';
import { ErrorState, errorMessageFor } from './ErrorState';
import { ListRow } from './ListRow';
import { clampProgress, ProgressRing } from './ProgressRing';
import { Text } from './Text';

describe('Text', () => {
  it('gives headings the header role', async () => {
    await renderWithTheme(<Text variant="title1">Tonight</Text>);
    expect(screen.getByRole('header', { name: 'Tonight' })).toBeOnTheScreen();
  });
});

describe('ProgressRing', () => {
  it('exposes its value as a percentage', async () => {
    await renderWithTheme(<ProgressRing progress={0.82} accessibilityLabel="Fit score" />);
    expect(screen.getByRole('progressbar', { name: 'Fit score' })).toHaveAccessibilityValue({
      now: 82,
    });
  });

  it('clamps out-of-range and invalid values', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(2)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe('Avatar', () => {
  it('derives up to two initials', () => {
    expect(initialsFor('Ana María López')).toBe('AL');
    expect(initialsFor('  sam ')).toBe('S');
    expect(initialsFor('')).toBe('?');
  });

  it('is labelled with the person name', async () => {
    await renderWithTheme(<Avatar name="Jo Park" />);
    expect(screen.getByRole('image', { name: 'Jo Park' })).toBeOnTheScreen();
    expect(screen.getByText('JP')).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it('caps large counts', () => {
    expect(badgeText(5)).toBe('5');
    expect(badgeText(120)).toBe('99+');
  });

  it('renders nothing for a zero count', async () => {
    await renderWithTheme(<Badge count={0} accessibilityLabel="unread notifications" />);
    expect(screen.queryByLabelText(/unread/)).not.toBeOnTheScreen();
  });

  it('reads the count with its label', async () => {
    await renderWithTheme(<Badge count={3} accessibilityLabel="unread notifications" />);
    expect(screen.getByLabelText('3 unread notifications')).toBeOnTheScreen();
  });
});

describe('EmptyState', () => {
  it('shows its action when given one', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <EmptyState title="No saved recipes" actionLabel="Discover recipes" onAction={onAction} />,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Discover recipes' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('ErrorState', () => {
  it('uses the API error message and offers retry', async () => {
    const onRetry = jest.fn();
    const error = new ApiError({
      kind: 'rate_limited',
      functionName: 'chef',
      retryAfterSeconds: 30,
    });
    await renderWithTheme(<ErrorState error={error} onRetry={onRetry} />);
    expect(screen.getByText(/hit the limit/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('calls out being offline', async () => {
    await renderWithTheme(
      <ErrorState error={new ApiError({ kind: 'network', functionName: 'prices' })} />,
    );
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
  });

  it('never leaks raw error text', () => {
    expect(errorMessageFor(new Error('SQLITE_CORRUPT at 0x1'))).toBe(
      'Please try again in a moment.',
    );
    expect(errorMessageFor(new Error('x'), 'Custom')).toBe('Custom');
  });
});

describe('ListRow', () => {
  it('reads a static row as one element', async () => {
    await renderWithTheme(<ListRow title="Units" subtitle="For recipes" value="Metric" />);
    expect(screen.getByLabelText('Units, For recipes, Metric')).toBeOnTheScreen();
  });

  it('leaves a row with a custom accessory ungrouped so the control stays reachable', async () => {
    await renderWithTheme(
      <ListRow title="Reminders" accessory={<Text accessibilityRole="switch">On</Text>} />,
    );
    expect(screen.queryByLabelText('Reminders')).toBeNull();
    expect(screen.getByRole('switch')).toBeOnTheScreen();
  });

  it('is a single button with a hint when pressable', async () => {
    const opened: string[] = [];
    await renderWithTheme(
      <ListRow
        title="Account"
        accessibilityHint="Opens account settings"
        onPress={() => opened.push('account')}
      />,
    );
    const row = screen.getByRole('button', { name: 'Account' });
    expect(row.props.accessibilityHint).toBe('Opens account settings');
    await userEvent.setup().press(row);
    expect(opened).toEqual(['account']);
  });
});
