import {
  cleanDishName,
  decodeDishParam,
  dishKeyFor,
  looksLikeRecipeId,
  nearbyHref,
  toNearbyDish,
} from './dish';
import { distanceMeters, distanceUnitFor, formatDistance, locationBucket, regionFor } from './geo';
import {
  directionsUrl,
  openState,
  phoneUrl,
  priceLabel,
  ratingLabel,
  ratingValue,
  reviewCountLabel,
  tallyLabel,
  websiteUrl,
} from './placeFormat';
import { kindLabel, placeAccessibilityLabel, placeFactsLabel, toPlaceView } from './placeView';

describe('dish', () => {
  it('builds dish keys the server accepts', () => {
    expect(dishKeyFor('Pad Thaï (lighter)')).toBe('pad_thai_lighter');
    expect(dishKeyFor('  Chicken   Tikka Masala ')).toBe('chicken_tikka_masala');
    expect(dishKeyFor('!!!')).toBeNull();
    expect(dishKeyFor('a'.repeat(200))).toHaveLength(128);
  });

  it('tells recipe ids from dish names', () => {
    expect(looksLikeRecipeId('mealdb:52772')).toBe(true);
    expect(looksLikeRecipeId('pad thai')).toBe(false);
    expect(looksLikeRecipeId('pad_thai')).toBe(false);
  });

  it('cleans names and rejects ones too short to search', () => {
    expect(cleanDishName(' pad_thai ')).toBe('pad thai');
    expect(cleanDishName('x')).toBeNull();
    expect(toNearbyDish('Pho', { cuisine: 'vietnamese' })).toEqual({
      name: 'Pho',
      key: 'pho',
      cuisine: 'vietnamese',
      recipeId: null,
    });
    expect(toNearbyDish('  ')).toBeNull();
  });

  it('round-trips through the route', () => {
    const href = nearbyHref('mealdb:52772');
    expect(href).toBe('/nearby/mealdb%3A52772');
    expect(decodeDishParam('mealdb%3A52772')).toBe('mealdb:52772');
    expect(decodeDishParam('100%')).toBe('100%');
  });
});

describe('geo', () => {
  const nyc = { latitude: 40.7128, longitude: -74.006 };

  it('measures distances', () => {
    const brooklyn = { latitude: 40.6782, longitude: -73.9442 };
    expect(distanceMeters(nyc, brooklyn)).toBeGreaterThan(6000);
    expect(distanceMeters(nyc, brooklyn)).toBeLessThan(7000);
    expect(distanceMeters(nyc, nyc)).toBe(0);
  });

  it('puts nearby points in the same bucket and distant ones in different buckets', () => {
    const fewStepsAway = { latitude: 40.7129, longitude: -74.0061 };
    expect(locationBucket(fewStepsAway)).toBe(locationBucket(nyc));
    expect(locationBucket({ latitude: 40.75, longitude: -74.006 })).not.toBe(locationBucket(nyc));
  });

  it('formats distances by locale', () => {
    expect(distanceUnitFor('en-US')).toBe('imperial');
    expect(distanceUnitFor('fr-FR')).toBe('metric');
    expect(distanceUnitFor('en')).toBe('metric');
    expect(formatDistance(340, 'metric')).toBe('350 m');
    expect(formatDistance(1234, 'metric')).toBe('1.2 km');
    expect(formatDistance(1609.344 * 2.25, 'imperial')).toBe('2.3 mi');
    expect(formatDistance(30, 'imperial')).toBe('100 ft');
    expect(formatDistance(Number.NaN, 'metric')).toBe('');
  });

  it('frames the origin and every place', () => {
    const region = regionFor(nyc, [{ latitude: 40.8, longitude: -73.9 }]);
    expect(region.latitude).toBeCloseTo((40.7128 + 40.8) / 2);
    expect(region.latitudeDelta).toBeGreaterThan(0.08);
    expect(regionFor(nyc, []).latitudeDelta).toBe(0.02);
  });
});

describe('place formatting', () => {
  it('labels price, rating, reviews and opening', () => {
    expect(priceLabel(2)).toBe('$$');
    expect(priceLabel(0)).toBeNull();
    expect(priceLabel(null)).toBeNull();
    expect(ratingLabel(4.56)).toBe('4.6');
    expect(ratingLabel(0)).toBeNull();
    expect(ratingValue(4.56)).toBe(4.6);
    expect(ratingValue(7)).toBe(5);
    expect(ratingValue(Number.NaN)).toBeNull();
    expect(reviewCountLabel(950)).toBe('950');
    expect(reviewCountLabel(1200)).toBe('1.2k');
    expect(reviewCountLabel(15_400)).toBe('15k');
    expect(openState(true)).toBe('open');
    expect(openState(null)).toBe('unknown');
  });

  it('builds an Apple Maps directions link', () => {
    expect(directionsUrl({ name: 'Noodle & Co', latitude: 40.1, longitude: -74.2 })).toBe(
      'https://maps.apple.com/?daddr=40.100000%2C-74.200000&q=Noodle%20%26%20Co&dirflg=d',
    );
  });

  it('only accepts real phone numbers and web links', () => {
    expect(phoneUrl('+1 (212) 555-0100')).toBe('tel:+12125550100');
    expect(phoneUrl('n/a')).toBeNull();
    expect(websiteUrl('https://example.com/menu')).toBe('https://example.com/menu');
    expect(websiteUrl('javascript:alert(1)')).toBeNull();
    expect(websiteUrl('example.com')).toBeNull();
  });

  it('summarises member answers', () => {
    expect(tallyLabel(0, 0)).toBeNull();
    expect(tallyLabel(3, 1)).toBe('3 of 4 members found it here');
    expect(tallyLabel(0, 1)).toBe("1 member didn't find it here");
  });
});

describe('placeView', () => {
  const place = {
    id: 'p1',
    name: 'Basil House',
    address: '1 Main St',
    lat: 40.72,
    lng: -74.0,
    distanceM: 999,
    rating: 4.4,
    ratingCount: 120,
    priceLevel: 2,
    openNow: true,
    primaryType: 'thai_restaurant',
    yesCount: 1,
    noCount: 0,
    myAnswer: null,
  };

  it('recomputes the distance from the current origin', () => {
    const view = toPlaceView(place, { latitude: 40.72, longitude: -74.0 }, 'metric');
    expect(view.distanceM).toBe(0);
    expect(toPlaceView(place, null, 'metric').distanceM).toBe(999);
  });

  it('describes the card for VoiceOver', () => {
    const view = toPlaceView(place, null, 'metric');
    expect(kindLabel(place.primaryType)).toBe('Thai restaurant');
    expect(placeAccessibilityLabel(view)).toBe(
      'Basil House, 1 km away, rated 4.4, open now, Price level 2 of 4',
    );
  });

  it('reads the facts row as one phrase, with the price in words', () => {
    const view = toPlaceView(place, null, 'metric');
    expect(placeFactsLabel(view)).toBe(
      'Rated 4.4 from 120 reviews, 1 km away, open now, Price level 2 of 4',
    );
    const sparse = toPlaceView(
      { ...place, rating: null, ratingCount: null, priceLevel: null, openNow: null, distanceM: -1 },
      null,
      'metric',
    );
    expect(placeFactsLabel(sparse)).toBeNull();
  });
});
