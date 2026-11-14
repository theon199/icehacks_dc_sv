import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { ModeSwitcher } from './ModeSwitcher';
import { MODE_OPTIONS } from '../modes';

describe('ModeSwitcher', () => {
  it('names the current mode on its pill and keeps the menu closed until tapped', async () => {
    await renderWithTheme(<ModeSwitcher modes={MODE_OPTIONS} value="quick" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Discover mode, Quick')).toBeTruthy();
    expect(screen.queryByTestId('discover-mode-forYou')).toBeNull();
  });

  it('reports the chosen mode from the menu and marks the current one', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<ModeSwitcher modes={MODE_OPTIONS} value="forYou" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('discover-mode-menu'));
    expect(screen.getByTestId('discover-mode-forYou').props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(screen.getByTestId('discover-mode-quick'));
    expect(onChange).toHaveBeenCalledWith('quick');
  });

  it('does not report the mode that is already current', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<ModeSwitcher modes={MODE_OPTIONS} value="forYou" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('discover-mode-menu'));
    await fireEvent.press(screen.getByTestId('discover-mode-forYou'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
