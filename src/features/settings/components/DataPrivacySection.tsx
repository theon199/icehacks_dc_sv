import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useTheme } from '@/ui';

import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { useDataExport } from '../account/useDataExport';

export const EXPORT_FOOTNOTE =
  'Your export is a JSON file with everything Famara stores about you, on our servers and on this device.';

/** Export and the privacy policy. */
export function DataPrivacySection() {
  const router = useRouter();
  const theme = useTheme();
  const { exporting, run } = useDataExport();

  return (
    <SettingsSection title="Data and privacy" footnote={EXPORT_FOOTNOTE}>
      <SettingsRow
        testID="settings-export"
        label={exporting ? 'Preparing your export' : 'Export my data'}
        icon="square.and.arrow.up"
        accessory="none"
        // While an export runs the row is disabled, so it cannot start a second one.
        disabled={exporting}
        onPress={() => void run()}
        {...(exporting ? { trailing: <ActivityIndicator color={theme.colors.primary} /> } : {})}
      />
      <SettingsRow
        label="Privacy policy"
        icon="lock"
        onPress={() => router.push('/about/privacy')}
      />
    </SettingsSection>
  );
}
