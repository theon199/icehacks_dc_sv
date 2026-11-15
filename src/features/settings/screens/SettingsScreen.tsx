import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Text, space, toast, type IconName } from '@/ui';

import { ABOUT_PAGE_LIST } from '../about/pages';
import type { AboutSlug } from '../about/types';
import { AccountError, signOutEverywhere, signOutLocally } from '../account/accountApi';
import { readAppVersion } from '../appVersion';
import { AiConsentSection } from '../components/AiConsentSection';
import { CommunitySafetySection } from '../components/CommunitySafetySection';
import { DataPrivacySection } from '../components/DataPrivacySection';
import { GeneralSettings } from '../components/GeneralSettings';
import { HealthSection } from '../components/HealthSection';
import { NotificationSettings } from '../components/NotificationSettings';
import { SettingsPage } from '../components/SettingsPage';
import { SettingsRow, SettingsValueRow } from '../components/SettingsRow';
import { SettingsSection } from '../components/SettingsSection';

const SETUP_LINKS: readonly { label: string; icon: IconName; href: Href }[] = [
  { label: 'Personal details', icon: 'person', href: '/personal-details' },
  { label: 'Food preferences', icon: 'slider.horizontal.3', href: '/preferences' },
  { label: 'Pantry', icon: 'cabinet', href: '/pantry' },
  { label: 'Account', icon: 'person.crop.circle', href: '/account' },
];

const ABOUT_ICONS: Readonly<Record<AboutSlug, IconName>> = {
  'how-it-works': 'safari',
  sources: 'book',
  'ai-use': 'sparkles',
  limitations: 'exclamationmark.circle',
  privacy: 'lock',
  terms: 'doc.text',
};

function versionValue(): string {
  const { version, build } = readAppVersion();
  return build ? `${version} (${build})` : version;
}

/**
 * The settings hub: your setup, cooking and display, notifications, health, community safety, AI,
 * privacy, transparency pages and account actions.
 */
export function SettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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
    <SettingsPage title="Settings" fallbackHref="/profile" testID="settings-screen">
      <SettingsSection title="Your setup">
        {SETUP_LINKS.map((link) => (
          <SettingsRow
            key={link.label}
            label={link.label}
            icon={link.icon}
            onPress={() => router.push(link.href)}
          />
        ))}
      </SettingsSection>

      <GeneralSettings />
      <NotificationSettings />

      <HealthSection />
      <CommunitySafetySection />

      <AiConsentSection />
      <DataPrivacySection />

      <SettingsSection title="Transparency">
        {ABOUT_PAGE_LIST.map((page) => (
          <SettingsRow
            key={page.slug}
            label={page.title}
            icon={ABOUT_ICONS[page.slug]}
            onPress={() => router.push(`/about/${page.slug}` as Href)}
          />
        ))}
      </SettingsSection>

      <SettingsSection
        title="Account"
        footnote="Deleting your account removes everything Famara stores about you and cannot be undone."
      >
        <SettingsRow
          testID="settings-sign-out"
          label={signingOut ? 'Signing out…' : 'Sign out'}
          icon="rectangle.portrait.and.arrow.right"
          accessory="none"
          disabled={signingOut}
          onPress={() => void signOutHere()}
        />
        <SettingsRow
          testID="settings-sign-out-everywhere"
          label="Sign out of all devices"
          icon="person.crop.circle.badge.xmark"
          accessory="none"
          disabled={signingOut}
          onPress={confirmSignOutAll}
        />
        <SettingsRow
          testID="settings-delete"
          label="Delete account"
          icon="trash"
          tone="destructive"
          accessory="none"
          disabled={signingOut}
          onPress={() => router.push('/account')}
          accessibilityHint="Opens your account page, where you can confirm deletion."
        />
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsValueRow
          testID="settings-version"
          label="Version"
          value={versionValue()}
          icon="info.circle"
        />
      </SettingsSection>

      <View style={styles.footer}>
        <Text variant="caption" tone="muted" align="center">
          Famara
        </Text>
        <Text variant="caption" tone="muted" align="center">
          Better-for-you versions of the dishes you grew up with.
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: 2, paddingTop: space.sm },
});
