import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { usesFirebase } from '@/lib/firebase/config';
import { Text, fontFamily, space } from '@/ui';

import type { AccountIntent } from '../accountSheetState';
import { SheetDragArea } from './AccountSheetShell';
import { NightIconButton, NightSecondaryButton, NightTextLink } from './NightControls';
import { night } from './NightTheme';
import { ProviderButtons } from './ProviderButtons';
import { LegalNote } from './TermsConsent';

/** The first step's headline; the last word is the lime accent. */
const HEADLINE: Record<AccountIntent, { lead: string; accent: string; spoken: string }> = {
  'log-in': {
    lead: 'Good to see\nyou ',
    accent: 'again.',
    spoken: 'Good to see you again. Log in to your account.',
  },
  'get-started': {
    lead: 'Let’s get you\n',
    accent: 'cooking.',
    spoken: 'Let’s get you cooking. Create a free account.',
  },
};

/** The link at the foot of each step that flips between logging in and getting started. */
export const INTENT_SWITCH: Record<
  AccountIntent,
  { prefix: string; label: string; to: AccountIntent }
> = {
  'log-in': { prefix: 'New here?', label: 'Get started', to: 'get-started' },
  'get-started': { prefix: 'Have an account?', label: 'Log in', to: 'log-in' },
};

export interface ProviderStepProps {
  intent: AccountIntent;
  bottomPadding: number;
  onEmail: () => void;
  onClose: () => void;
  onIntentChange: (intent: AccountIntent) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}

/** Step one of the account sheet: Apple, Google or email. */
export function ProviderStep({
  intent,
  bottomPadding,
  onEmail,
  onClose,
  onIntentChange,
  onLayout,
}: ProviderStepProps) {
  const headline = HEADLINE[intent];
  const flip = INTENT_SWITCH[intent];
  const emailButton = (
    <NightSecondaryButton
      testID="continue-email"
      label="Continue with email"
      icon="envelope"
      onPress={onEmail}
    />
  );
  return (
    <View onLayout={onLayout} style={[styles.step, { paddingBottom: bottomPadding }]}>
      <SheetDragArea>
        <View style={styles.header}>
          <Text
            variant="display"
            style={styles.title}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={headline.spoken}
          >
            {headline.lead}
            <Text variant="display" color="highlight">
              {headline.accent}
            </Text>
          </Text>
          <NightIconButton
            icon="xmark"
            accessibilityLabel="Close"
            onPress={onClose}
            testID="account-sheet-close"
          />
        </View>
      </SheetDragArea>

      {usesFirebase ? (
        // Firebase builds sign in with email only; Apple and Google go through Supabase.
        <View style={styles.emailOnly}>{emailButton}</View>
      ) : (
        <ProviderButtons intent={intent}>{emailButton}</ProviderButtons>
      )}

      <LegalNote />
      <NightTextLink
        testID="account-sheet-switch"
        prefix={flip.prefix}
        label={flip.label}
        onPress={() => onIntentChange(flip.to)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: space.xl, paddingHorizontal: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: {
    flex: 1,
    color: night.ink,
    fontFamily: fontFamily.display,
    letterSpacing: -0.9,
  },
  emailOnly: { gap: space.sm },
});
