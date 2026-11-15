import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  PressableScale,
  Text,
  ThemeProvider,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  useTheme,
} from '@/ui';
import { Wordmark } from '@/ui/brand';

export interface AccountPageProps {
  title: string;
  subtitle?: string;
  /** Show the glass back control (default). */
  back?: boolean;
  /** Under the form card, e.g. "Back to log in". */
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}

/**
 * The light pages around the account sheet: forgot password, check your email, choose a new
 * password and the link landing. They follow the app's appearance (the sheet itself stays night),
 * with the glass back control and wordmark on top, a large title, and the form on a white card.
 */
export function AccountPage(props: AccountPageProps) {
  // Pages pushed from the night welcome flow step out of its forced dark theme.
  return (
    <ThemeProvider>
      <PageBody {...props} />
    </ThemeProvider>
  );
}

function PageBody({ title, subtitle, back = true, footer, children, testID }: AccountPageProps) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      {...(testID ? { testID } : {})}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.section },
        ]}
      >
        <View style={styles.shell}>
          <View style={styles.topRow}>
            {back && router.canGoBack() ? (
              <GlassIconButton
                icon="chevron.left"
                accessibilityLabel="Back"
                onPress={() => router.back()}
                testID="account-page-back"
              />
            ) : null}
            <Wordmark height={20} />
          </View>
          <View style={styles.intro}>
            <Text variant="display" style={styles.title}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="body" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                shadowColor: theme.colors.shadow,
                ...theme.elevation.medium,
              },
            ]}
          >
            {children}
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A failure or a short status inside the card. Announced to VoiceOver as it appears. */
export function PageNotice({
  message,
  tone = 'danger',
  testID,
}: {
  message: string | null;
  tone?: 'danger' | 'info';
  testID?: string;
}) {
  const theme = useTheme();
  if (!message) return null;
  const danger = tone === 'danger';
  return (
    <View
      {...(testID ? { testID } : {})}
      accessible
      accessibilityRole={danger ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[
        styles.notice,
        { backgroundColor: danger ? theme.colors.dangerSoft : theme.colors.primarySoft },
      ]}
    >
      <Text
        variant={danger ? 'label' : 'subhead'}
        color={danger ? 'onDangerSoft' : 'onPrimarySoft'}
        accessible={false}
      >
        {message}
      </Text>
    </View>
  );
}

/** The quiet underlined action under the card. */
export function PageLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      pressedOpacity={0.72}
      pressedScale={1}
      hitSlop={8}
      onPress={onPress}
      style={styles.link}
    >
      <Text variant="caption" tone="muted" style={styles.linkText} accessible={false}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.xl },
  shell: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: space.section },
  topRow: { minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: space.md },
  intro: { gap: 9, paddingHorizontal: space.xs },
  title: { fontFamily: fontFamily.display, letterSpacing: -1.2 },
  card: {
    gap: space.xl,
    padding: space.section,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notice: { paddingHorizontal: 14, paddingVertical: space.md, borderRadius: radii.lg },
  footer: { alignItems: 'center', gap: space.xs },
  link: { minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.textSemiBold, textDecorationLine: 'underline' },
});
