import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { NearbyHeader } from './NearbyHeader';

describe('NearbyHeader', () => {
  it('names the dish and the area, and changes the area from its glass button', async () => {
    const onChangeArea = jest.fn();
    await renderWithTheme(
      <NearbyHeader
        title="Pad thai nearby"
        subtitle="Near Lisbon"
        onBack={jest.fn()}
        onChangeArea={onChangeArea}
      />,
    );
    expect(screen.getByText('Pad thai nearby')).toBeTruthy();
    expect(screen.getByTestId('nearby-subtitle')).toHaveTextContent('Near Lisbon');
    await fireEvent.press(screen.getByLabelText('Near Lisbon. Change area'));
    expect(onChangeArea).toHaveBeenCalled();
  });

  it('has no area control before there is an area to change', async () => {
    await renderWithTheme(
      <NearbyHeader title="Find nearby" subtitle={null} onBack={jest.fn()} onChangeArea={null} />,
    );
    expect(screen.queryByTestId('nearby-area')).toBeNull();
  });
});
