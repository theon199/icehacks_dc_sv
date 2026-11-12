import { brandColors } from '@/ui/brandColors';

import appConfig, { configColors } from '../../../app.config';

describe('app.config', () => {
  const config = appConfig({ config: {} } as never);

  it('mirrors the brand colors used by native config', () => {
    expect(configColors).toEqual({
      basil: brandColors.basil,
      oat: brandColors.oat,
      night: brandColors.night,
    });
  });

  it('identifies the app and its deep-link scheme', () => {
    expect(config).toMatchObject({
      name: 'Famara',
      slug: 'famara',
      scheme: 'famara',
      ios: { bundleIdentifier: 'com.famara.app', supportsTablet: false },
    });
    expect(config.experiments?.typedRoutes).toBe(true);
  });

  it('never requests background location', () => {
    const location = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location',
    );
    expect(location).toBeDefined();
    expect(Array.isArray(location) && location[1]).toMatchObject({
      locationAlwaysPermission: false,
      isIosBackgroundLocationEnabled: false,
    });
  });
});
