import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { ListRow, useTheme } from '@/ui';

import { SettingsSection } from './SettingsSection';
import { useDataExport } from '../account/useDataExport';

export const EXPORT_FOOTNOTE =
  'Your export is a JSON file with everything Famara stores about you, on our servers and on this device.';

/** Export, deletion and the privacy policy. */
export function DataPrivacySection() {
  const router = useRouter();
  const theme = useTheme();
  const { exporting, run } = useDataExport();

  return (
    <SettingsSection title="Data and privacy" footnote={EXPORT_FOOTNOTE}>
      <ListRow
        testID="settings-export"
        title="Export my data"
        icon="square.and.arrow.up"
        divider
        onPress={() => void run()}
        {...(exporting
          ? { accessory: <ActivityIndicator color={theme.colors.primary} />, value: 'Preparing' }
          : {})}
      />
      <ListRow
        title="Privacy policy"
        icon="hand.raised"
        divider
        onPress={() => router.push('/about/privacy')}
      />
      <ListRow
        testID="settings-delete"
        title="Delete account"
        icon="trash"
        destructive
        onPress={() => router.push('/account')}
        accessibilityHint="Opens your account page, where you can confirm deletion."
      />
    </SettingsSection>
  );
}
