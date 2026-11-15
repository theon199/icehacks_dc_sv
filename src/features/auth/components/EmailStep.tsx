import type { Ref } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';

import { Text, fontFamily, space } from '@/ui';

import type { AccountIntent } from '../accountSheetState';
import { SheetDragArea } from './AccountSheetShell';
import { CreateAccountForm } from './CreateAccountForm';
import { LogInForm } from './LogInForm';
import { NightIconButton, NightTextLink } from './NightControls';
import { night } from './NightTheme';
import { INTENT_SWITCH } from './ProviderStep';

const STEP_TITLE: Record<AccountIntent, string> = {
  'log-in': 'Log in',
  'get-started': 'Get started',
};

export interface EmailStepProps {
  intent: AccountIntent;
  bottomPadding: number;
  emailRef: Ref<TextInput>;
  onBack: () => void;
  onClose: () => void;
  onIntentChange: (intent: AccountIntent) => void;
}

/**
 * Step two: the email form in a sheet raised to just under the status bar. The keyboard slides
 * over the sheet's lower part and the scroll view insets itself by the keyboard, so the focused
 * field and the button under it stay reachable.
 */
export function EmailStep({
  intent,
  bottomPadding,
  emailRef,
  onBack,
  onClose,
  onIntentChange,
}: EmailStepProps) {
  const flip = INTENT_SWITCH[intent];
  return (
    <View style={styles.step}>
      <SheetDragArea>
        <View style={styles.header}>
          <NightIconButton
            icon="chevron.left"
            accessibilityLabel="Back to sign-in options"
            onPress={onBack}
            testID="account-sheet-back"
          />
          <Text variant="title1" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.title}>
            {STEP_TITLE[intent]}
          </Text>
          <NightIconButton
            icon="xmark"
            accessibilityLabel="Close"
            onPress={onClose}
            testID="account-sheet-email-close"
          />
        </View>
      </SheetDragArea>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {intent === 'log-in' ? (
          <LogInForm emailRef={emailRef} />
        ) : (
          <CreateAccountForm emailRef={emailRef} />
        )}
        <NightTextLink
          prefix={flip.prefix}
          label={flip.label}
          onPress={() => onIntentChange(flip.to)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  title: {
    flex: 1,
    color: night.ink,
    fontFamily: fontFamily.display,
    letterSpacing: -0.6,
  },
  scroll: { flex: 1 },
  content: { gap: space.xl, paddingHorizontal: space.xl, paddingTop: space.xs },
});
