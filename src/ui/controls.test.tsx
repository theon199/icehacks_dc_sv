import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { ChoiceChip, Chip } from './Chip';
import { IconButton } from './IconButton';
import { SegmentedControl } from './SegmentedControl';
import { TextField } from './TextField';
import { Toggle } from './Toggle';
import { minTouchTarget } from './tokens';

describe('IconButton', () => {
  it('exposes its label and fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<IconButton icon="heart" accessibilityLabel="Save" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports its selected state', async () => {
    await renderWithTheme(
      <IconButton icon="heart.fill" accessibilityLabel="Saved" onPress={jest.fn()} selected />,
    );
    expect(screen.getByRole('button', { name: 'Saved' })).toBeSelected();
  });
});

describe('Chip', () => {
  it('is a static, labelled element without onPress', async () => {
    await renderWithTheme(<Chip label="Indian" />);
    expect(screen.getByLabelText('Indian')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('is a button with onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Chip label="High protein" onPress={onPress} tone="primary" />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'High protein' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('ChoiceChip', () => {
  function Harness() {
    const [selected, setSelected] = useState(false);
    return <ChoiceChip label="Vegetarian" selected={selected} onToggle={setSelected} />;
  }

  it('toggles its checked state', async () => {
    await renderWithTheme(<Harness />);
    const chip = screen.getByRole('checkbox', { name: 'Vegetarian' });
    expect(chip).not.toBeChecked();
    await userEvent.setup().press(chip);
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked();
  });

  it('uses the radio role in single-choice groups', async () => {
    await renderWithTheme(<ChoiceChip label="Easy" selected mode="radio" onToggle={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
  });

  it('ignores presses when disabled', async () => {
    const onToggle = jest.fn();
    await renderWithTheme(
      <ChoiceChip label="Peanut" selected={false} onToggle={onToggle} disabled />,
    );
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Peanut' }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  const segments = [
    { value: 'recipes', label: 'Recipes' },
    { value: 'chef', label: 'Chef' },
  ] as const;

  it('marks the current segment selected and reports changes', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Search mode"
        segments={segments}
        value="recipes"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Recipes' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Chef' }));
    expect(onChange).toHaveBeenCalledWith('chef');
  });

  it('does not report a change when the selected segment is pressed again', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Search mode"
        segments={segments}
        value="recipes"
        onChange={onChange}
      />,
    );
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Recipes' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives every segment a touch target of at least 44 pt', async () => {
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Search mode"
        segments={segments}
        value="recipes"
        onChange={() => undefined}
      />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      const { minHeight } = StyleSheet.flatten(tab.props.style) as { minHeight: number };
      const slop = tab.props.hitSlop as { top: number; bottom: number };
      expect(minHeight + slop.top + slop.bottom).toBeGreaterThanOrEqual(minTouchTarget);
    }
  });
});

describe('TextField', () => {
  function Harness({ error }: { error?: string }) {
    const [value, setValue] = useState('');
    return (
      <TextField
        label="Email"
        value={value}
        onChangeText={setValue}
        clearable
        hint="We'll send a confirmation link"
        error={error ?? null}
      />
    );
  }

  it('accepts typing and can be cleared', async () => {
    await renderWithTheme(<Harness />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'cook@famara.app');
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('cook@famara.app');
    await user.press(screen.getByRole('button', { name: 'Clear Email' }));
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('');
  });

  it('shows the hint, or the error in its place', async () => {
    const { rerender } = await renderWithTheme(<Harness />);
    expect(screen.getByText("We'll send a confirmation link")).toBeOnTheScreen();
    await rerender(<Harness error="Enter a valid email" />);
    expect(screen.getByText('Enter a valid email')).toBeOnTheScreen();
    expect(screen.queryByText("We'll send a confirmation link")).not.toBeOnTheScreen();
  });
});

describe('Toggle', () => {
  it('reports the new value', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(
      <Toggle label="Small appetite mode" value={false} onValueChange={onValueChange} />,
    );
    await fireEvent(screen.getByLabelText('Small appetite mode'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
