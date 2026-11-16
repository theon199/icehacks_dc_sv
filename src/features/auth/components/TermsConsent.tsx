import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, fontFamily, minTouchTarget, useTheme } from '@/ui';

import { night } from './NightTheme';

/** Opens the legal pages, pushed over whatever is showing (the account sheet stays put). */
function useLegalLinks() {
  const router = useRouter();
  return {
    openTerms: () => router.push('/about/terms'),
    openPrivacy: () => router.push('/about/privacy'),
  };
}

/**
 * The two legal pages as separate links, each with a full-size touch target. Inline links inside
 * a sentence would be too small to tap reliably.
 */
function LegalLinks() {
  const { openTerms, openPrivacy } = useLegalLinks();
  return (
    <View style={styles.links}>
      <LegalLink testID="legal-terms" label="Terms of Use" onPress={openTerms} />
      <Text variant="footnote" style={styles.muted} importantForAccessibility="no">
        ·
      </Text>
      <LegalLink testID="legal-privacy" label="Privacy Policy" onPress={openPrivacy} />
    </View>
  );
}

function LegalLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`Read the ${label}`}
      pressedOpacity={0.6}
      onPress={onPress}
      style={styles.link}
    >
      <Text variant="footnote" style={styles.linkText}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Footnote under provider buttons: continuing with Apple or Google creates an account on terms.
 * One sentence with the two documents as inline links, as on the Aptiva sheet.
 */
export function LegalNote() {
  const { openTerms, openPrivacy } = useLegalLinks();
  return (
    <Text variant="footnote" align="center" style={styles.muted}>
      By continuing you agree to the Famara{' '}
      <Text
        testID="legal-terms"
        variant="footnote"
        accessibilityRole="link"
        accessibilityLabel="Read the Terms of Use"
        onPress={openTerms}
        style={[styles.linkText, styles.inlineLink]}
      >
        Terms of Use
      </Text>{' '}
      and{' '}
      <Text
        testID="legal-privacy"
        variant="footnote"
        accessibilityRole="link"
        accessibilityLabel="Read the Privacy Policy"
        onPress={openPrivacy}
        style={[styles.linkText, styles.inlineLink]}
      >
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

export interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}

/**
 * Explicit agreement to the Terms and Privacy Policy, required to create an email account. The
 * whole row toggles the box, so the target is far larger than the box itself.
 */
export function TermsCheckbox({ checked, onChange, error }: TermsCheckboxProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      <PressableScale
        testID="terms-checkbox"
        accessibilityRole="checkbox"
        accessibilityLabel="I agree to the Terms and Privacy Policy"
        accessibilityState={{ checked }}
        pressedScale={1}
        pressedOpacity={0.7}
        onPress={() => {
          haptics.selection();
          onChange(!checked);
        }}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: error
                ? theme.colors.danger
                : checked
                  ? theme.colors.highlight
                  : night.inkFaint,
              backgroundColor: checked ? theme.colors.highlight : night.field,
            },
          ]}
        >
          {checked ? <Icon name="checkmark" size={16} color="onHighlight" weight="bold" /> : null}
        </View>
        <Text variant="subhead" style={[styles.label, styles.onNight]}>
          I agree to the Terms and Privacy Policy.
        </Text>
      </PressableScale>
      <View style={styles.checkboxLinks}>
        <LegalLinks />
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: minTouchTarget,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  // Lines the links up under the label text: box width plus row gap, less the link padding.
  checkboxLinks: { alignItems: 'flex-start', marginLeft: 28 },
  linkText: { color: night.ink, textDecorationLine: 'underline' },
  inlineLink: { fontFamily: fontFamily.textSemiBold },
  muted: { color: night.inkMuted },
  onNight: { color: night.ink },
  link: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
