import { parseCookShare } from './composeParams';

describe('parseCookShare', () => {
  it('is null unless the sheet was opened from cook mode', () => {
    expect(parseCookShare({ recipe: 'mealdb:1', rating: '5' })).toBeNull();
  });

  it('reads the rating, note and local photo', () => {
    expect(
      parseCookShare({
        from: 'cook',
        rating: '3',
        note: '  Added spinach.  ',
        photo: 'file:///tmp/a.jpg',
        photoWidth: '1600',
        photoHeight: '1200',
      }),
    ).toEqual({
      rating: 3,
      note: 'Added spinach.',
      photo: { uri: 'file:///tmp/a.jpg', width: 1600, height: 1200 },
    });
  });

  it('ignores values a link could not have come from cook mode with', () => {
    expect(
      parseCookShare({
        from: 'cook',
        rating: '9',
        photo: 'https://example.test/a.jpg',
        photoWidth: '100',
        photoHeight: '100',
      }),
    ).toEqual({ rating: null, note: '', photo: null });
  });

  it('drops a photo without a usable size', () => {
    expect(
      parseCookShare({ from: 'cook', photo: 'file:///tmp/a.jpg', photoWidth: '0' })?.photo,
    ).toBeNull();
  });

  it('keeps the note within the post limit', () => {
    expect(parseCookShare({ from: 'cook', note: 'x'.repeat(5000) })?.note).toHaveLength(2000);
  });
});
