import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button, EmptyState, Screen, toast } from '@/ui';

import { resendConfirmation } from '../authActions';
import { FormMessage } from '../components/FormMessage';
import { usePendingEmail } from '../pendingEmail';
import { RESEND_COOLDOWN_SECONDS, useCooldown } from '../useCooldown';
import { useSubmission } from '../useSubmission';

/** Seconds still to wait before another email may go to the same address. */
function cooldownLeft(sentAt: number | null): number {
  if (sentAt == null) return 0;
  const elapsed = Math.floor((Date.now() - sentAt) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

function openMailApp() {
  // The Mail app's scheme; ignored quietly where there is no mail app.
  Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:').catch(() => undefined);
}

/** Waiting for the confirmation link, with a rate-limited "send again". */
export function CheckEmailScreen() {
  const router = useRouter();
  const pending = usePendingEmail((s) => s.email);
  const sentAt = usePendingEmail((s) => s.sentAt);
  const cooldown = useCooldown(cooldownLeft(sentAt));
  const resend = useSubmission();
  const waiting = cooldown.remaining > 0;

  const sendAgain = () => {
    if (!pending || waiting) return;
    void resend.submit(async () => {
      const result = await resendConfirmation(pending);
      if (!result.ok) {
        haptics.error();
        if (result.failure.kind === 'rate_limited') cooldown.start();
        return result.failure.message;
      }
      haptics.success();
      usePendingEmail.getState().setPending(pending);
      cooldown.start();
      toast.success('Sent. Check your inbox.');
      return null;
    });
  };

  const explanation = pending
    ? `We sent a confirmation link to ${pending}. Open it on this phone to finish creating your account.`
    : 'Open the confirmation link we sent you on this phone to finish creating your account.';

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          {Platform.OS === 'ios' ? (
            <Button
              label="Open Mail"
              icon="envelope.open"
              size="lg"
              fullWidth
              onPress={openMailApp}
            />
          ) : null}
          <Button
            label="Back to sign in"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/sign-in')}
          />
        </View>
      }
    >
      <EmptyState icon="envelope.badge" title="Check your email" message={explanation} />
      {resend.failure ? <FormMessage message={resend.failure} testID="resend-error" /> : null}
      {pending ? (
        <Button
          testID="resend-confirmation"
          label={waiting ? `Send again in ${cooldown.remaining}s` : 'Send the link again'}
          variant="secondary"
          icon="arrow.clockwise"
          loading={resend.busy}
          disabled={waiting}
          onPress={sendAgain}
          style={styles.resend}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 4 },
  resend: { alignSelf: 'center' },
});
