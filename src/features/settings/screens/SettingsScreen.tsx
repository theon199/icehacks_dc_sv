import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Button, ListRow, Screen, Text, space, toast } from '@/ui';

import { ABOUT_PAGE_LIST } from '../about/pages';
import { AccountError, signOutEverywhere, signOutLocally } from '../account/accountApi';
import { formatAppVersion, readAppVersion } from '../appVersion';
import { AiConsentSection } from '../components/AiConsentSection';
import { DataPrivacySection } from '../components/DataPrivacySection';
import { GeneralSettings } from '../components/GeneralSettings';
import { NotificationSettings } from '../components/NotificationSettings';
import { SettingsSection } from '../components/SettingsSection';
import { HealthConnections } from '../deps';

/** The settings hub: account, preferences, display, notifications, AI, privacy and about. */
export function SettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const version = formatAppVersion(readAppVersion());

  const run = async (work: () => Promise<void>) => {
    setSigningOut(true);
    try {
      await work();
    } catch (error) {
      setSigningOut(false);
      toast.show({
        message: error instanceof AccountError ? error.message : 'Could not sign out. Try again.',
        tone: 'danger',
      });
    }
  };

  const signOutHere = () => run(signOutLocally);

  const signOutAll = () =>
    run(async () => {
      const { everywhere } = await signOutEverywhere();
      if (!everywhere) {
        toast.show({
          message:
            'Signed out on this device. Other devices could not be reached, so they may still be signed in.',
          tone: 'danger',
        });
      }
    });

  const confirmSignOutAll = () =>
    Alert.alert(
      'Sign out of all devices?',
      'This signs you out on every phone and tablet using your account, including this one. Unsynced changes on other devices may be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out everywhere', style: 'destructive', onPress: () => void signOutAll() },
      ],
    );

  return (
    <Screen testID="settings-screen">
      <SettingsSection title="You">
        <ListRow
          title="Account"
          subtitle="Email, password and deletion"
          icon="person.crop.circle"
          divider
          onPress={() => router.push('/account')}
        />
        <ListRow
          title="Food preferences"
          subtitle="Cuisines, diet, allergens and goals"
          icon="fork.knife"
          divider
          onPress={() => router.push('/preferences')}
        />
        <ListRow
          title="Personal details"
          subtitle="Optional, for nutrient targets"
          icon="figure"
          onPress={() => router.push('/personal-details')}
        />
      </SettingsSection>

      <GeneralSettings />
      <NotificationSettings />

      {HealthConnections ? (
        <SettingsSection title="Health" testID="settings-health">
          <HealthConnections />
        </SettingsSection>
      ) : null}

      <AiConsentSection />
      <DataPrivacySection />

      <SettingsSection title="About Famara">
        {ABOUT_PAGE_LIST.map((page, index) => (
          <ListRow
            key={page.slug}
            title={page.title}
            divider={index < ABOUT_PAGE_LIST.length - 1}
            onPress={() => router.push(`/about/${page.slug}` as Href)}
          />
        ))}
      </SettingsSection>

      <Button
        testID="settings-sign-out"
        label="Sign out"
        variant="secondary"
        fullWidth
        loading={signingOut}
        onPress={() => void signOutHere()}
      />
      <Button
        testID="settings-sign-out-everywhere"
        label="Sign out of all devices"
        variant="ghost"
        fullWidth
        disabled={signingOut}
        onPress={confirmSignOutAll}
      />
      <Text variant="footnote" tone="subtle" align="center" style={styles.version} selectable>
        {version}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  version: { marginTop: space.sm },
});
