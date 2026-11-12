import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { ModeSwitcher } from './ModeSwitcher';
import { MODE_OPTIONS } from '../modes';

describe('ModeSwitcher', () => {
  it('keeps its own height instead of taking room from the deck', async () => {
    await renderWithTheme(
      <ModeSwitcher modes={MODE_OPTIONS} value="forYou" onChange={jest.fn()} />,
    );
    const bar = screen.getByLabelText('Discover mode');
    expect(StyleSheet.flatten(bar.props.style)).toMatchObject({ flexGrow: 0 });
  });

  it('reports the chosen mode', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<ModeSwitcher modes={MODE_OPTIONS} value="forYou" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('discover-mode-quick'));
    expect(onChange).toHaveBeenCalledWith('quick');
  });
});
