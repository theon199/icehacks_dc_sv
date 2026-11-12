import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, minTouchTarget, useTheme } from '@/ui';

/**
 * Opens the legal pages. From inside a sheet, the sheet closes first: the pages live in the root
 * stack and would otherwise open underneath it.
 */
function useLegalLinks(fromSheet = false) {
  const router = useRouter();
  const open = (href: '/about/terms' | '/about/privacy') => {
    if (fromSheet && router.canGoBack()) router.back();
    router.push(href);
  };
  return {
    openTerms: () => open('/about/terms'),
    openPrivacy: () => open('/about/privacy'),
  };
}

/**
 * The two legal pages as separate links, each with a full-size touch target. Inline links inside
 * a sentence would be too small to tap reliably.
 */
function LegalLinks({ fromSheet = false }: { fromSheet?: boolean }) {
  const { openTerms, openPrivacy } = useLegalLinks(fromSheet);
  return (
    <View style={styles.links}>
      <LegalLink testID="legal-terms" label="Terms" onPress={openTerms} />
      <Text variant="footnote" tone="muted" importantForAccessibility="no">
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
      <Text variant="footnote" tone="primary">
        {label}
      </Text>
    </PressableScale>
  );
}

/** Footnote under provider buttons: continuing with Apple or Google creates an account on terms. */
export function LegalNote({ fromSheet = false }: { fromSheet?: boolean }) {
  return (
    <View>
      <Text variant="footnote" tone="muted" align="center">
        By continuing, you agree to Famara’s Terms and Privacy Policy.
      </Text>
      <LegalLinks fromSheet={fromSheet} />
    </View>
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
              borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
              backgroundColor: checked ? theme.colors.primary : theme.colors.surface,
              borderRadius: theme.radii.xs,
            },
          ]}
        >
          {checked ? <Icon name="checkmark" size={16} color="onPrimary" weight="bold" /> : null}
        </View>
        <Text variant="subhead" style={styles.label}>
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
    width: 26,
    height: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  // Lines the links up under the label text: box width plus row gap, less the link padding.
  checkboxLinks: { alignItems: 'flex-start', marginLeft: 30 },
  link: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
