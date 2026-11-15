import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Text, radii, space, useTheme } from '@/ui';

import {
  accountSheetKey,
  parseAccountSheetParams,
  type AccountIntent,
  type AccountSheetRequest,
} from '../accountSheetState';
import { AccountSheet } from '../components/AccountSheet';
import { night } from '../components/NightTheme';
import { WelcomeCarousel } from '../welcome/WelcomeCarousel';

/**
 * First screen for signed-out people: the welcome carousel on black, with Get started and Log in.
 * Both open the account sheet over the carousel, which pauses while the sheet is up. Links can
 * open the sheet directly with `?auth=log-in` or `?auth=get-started` (and `&step=email`).
 */
export function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ auth?: string; step?: string }>();
  const linked = parseAccountSheetParams(params.auth, params.step);
  const [request, setRequest] = useState<AccountSheetRequest | null>(linked);

  // A new link while this screen is up opens the sheet; adopted during render so there is no
  // closed frame first. The same link twice is the same request.
  const [seenLink, setSeenLink] = useState(accountSheetKey(linked));
  if (accountSheetKey(linked) !== seenLink) {
    setSeenLink(accountSheetKey(linked));
    if (linked) setRequest(linked);
  }

  const open = (intent: AccountIntent) => setRequest({ intent, step: 'providers' });
  const close = useCallback(() => {
    setRequest(null);
    // Forget the link, so following the same one again opens the sheet again.
    router.setParams({ auth: undefined, step: undefined });
  }, [router]);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: night.black },
      ]}
    >
      <WelcomeCarousel paused={request !== null} />

      <View style={styles.actions}>
        <PressableScale
          testID="welcome-get-started"
          accessibilityRole="button"
          accessibilityLabel="Get started"
          pressedOpacity={0.72}
          onPress={() => open('get-started')}
          style={[styles.primary, { backgroundColor: theme.colors.onImage }]}
        >
          <Text variant="headline" color="textInverse" accessible={false}>
            Get started
          </Text>
        </PressableScale>
        <PressableScale
          testID="welcome-sign-in"
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityHint="For people who already have an account"
          pressedOpacity={0.72}
          pressedScale={1}
          onPress={() => open('log-in')}
          style={styles.text}
        >
          <Text variant="headline" style={styles.onNight} accessible={false}>
            Log in
          </Text>
        </PressableScale>
      </View>

      <AccountSheet request={request} onClose={close} onChange={setRequest} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xs },
  primary: {
    minHeight: 54,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { minHeight: 48, marginTop: space.xs, alignItems: 'center', justifyContent: 'center' },
  onNight: { color: night.ink },
});
