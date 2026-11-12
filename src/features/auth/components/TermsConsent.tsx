import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, useTheme } from '@/ui';

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

/** Footnote under provider buttons: continuing with Apple or Google creates an account on terms. */
export function LegalNote({ fromSheet = false }: { fromSheet?: boolean }) {
  const { openTerms, openPrivacy } = useLegalLinks(fromSheet);
  return (
    <Text variant="footnote" tone="muted" align="center">
      By continuing, you agree to Famara’s{' '}
      <Text variant="footnote" tone="primary" accessibilityRole="link" onPress={openTerms}>
        Terms
      </Text>{' '}
      and{' '}
      <Text variant="footnote" tone="primary" accessibilityRole="link" onPress={openPrivacy}>
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

/** Explicit agreement to the Terms and Privacy Policy, required to create an email account. */
export function TermsCheckbox({ checked, onChange, error }: TermsCheckboxProps) {
  const theme = useTheme();
  const { openTerms, openPrivacy } = useLegalLinks();
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <PressableScale
          testID="terms-checkbox"
          accessibilityRole="checkbox"
          accessibilityLabel="I agree to the Terms and Privacy Policy"
          accessibilityState={{ checked }}
          hitSlop={8}
          onPress={() => {
            haptics.selection();
            onChange(!checked);
          }}
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
        </PressableScale>
        <Text variant="subhead" style={styles.label}>
          I agree to the{' '}
          <Text variant="subhead" tone="primary" accessibilityRole="link" onPress={openTerms}>
            Terms
          </Text>{' '}
          and{' '}
          <Text variant="subhead" tone="primary" accessibilityRole="link" onPress={openPrivacy}>
            Privacy Policy
          </Text>
          .
        </Text>
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
  wrapper: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 26,
    height: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 9,
  },
  label: { flex: 1 },
});
