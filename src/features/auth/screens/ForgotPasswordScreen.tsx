import { useState } from 'react';
import { Keyboard } from 'react-native';

import { haptics } from '@/lib/haptics';
import { Button } from '@/ui';

import { requestPasswordReset } from '../authActions';
import { AccountPage, PageLink, PageNotice } from '../components/AccountPage';
import { EmailField } from '../components/EmailField';
import { useBackToLogIn } from '../useBackToLogIn';
import { useCooldown } from '../useCooldown';
import { useField } from '../useField';
import { useSubmission } from '../useSubmission';
import { normalizeEmail, validateEmail } from '../validation';

/** Asks for a password-reset link. The reply never says whether an account exists. */
export function ForgotPasswordScreen() {
  const backToLogIn = useBackToLogIn();
  const email = useField(validateEmail);
  const cooldown = useCooldown();
  const request = useSubmission();
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const waiting = cooldown.remaining > 0;
  const againLabel = waiting ? `Send again in ${cooldown.remaining}s` : 'Send the link again';

  const sendLink = () => {
    if (waiting) return;
    if (!email.validate()) {
      haptics.warning();
      return;
    }
    Keyboard.dismiss();
    void request.submit(async () => {
      const result = await requestPasswordReset(email.value);
      if (!result.ok) {
        haptics.error();
        if (result.failure.kind === 'rate_limited') cooldown.start();
        return result.failure.message;
      }
      haptics.success();
      setLinkSentTo(normalizeEmail(email.value));
      cooldown.start();
      return null;
    });
  };

  if (linkSentTo) {
    return (
      <AccountPage
        title="Check your email."
        subtitle="Open the newest message on this phone to choose a new password."
        footer={<PageLink label="Use a different email" onPress={() => setLinkSentTo(null)} />}
      >
        <PageNotice
          tone="info"
          message={`If there’s a Famara account for ${linkSentTo}, a link to choose a new password is on its way.`}
        />
        <PageNotice message={request.failure} />
        <Button label="Back to log in" size="lg" fullWidth onPress={backToLogIn} />
        <Button
          label={againLabel}
          variant="secondary"
          size="lg"
          icon="arrow.clockwise"
          fullWidth
          loading={request.busy}
          disabled={waiting}
          onPress={sendLink}
        />
      </AccountPage>
    );
  }

  return (
    <AccountPage
      title="Reset your password."
      subtitle="We’ll send a secure link that opens Famara so you can choose a new password."
      footer={<PageLink label="Back to log in" onPress={backToLogIn} />}
    >
      <EmailField
        field={email}
        look="page"
        testID="reset-email"
        returnKeyType="send"
        onReturn={sendLink}
      />
      <PageNotice message={request.failure} />
      <Button
        testID="reset-submit"
        label={waiting ? againLabel : 'Send reset link'}
        size="lg"
        fullWidth
        loading={request.busy}
        disabled={waiting}
        onPress={sendLink}
      />
    </AccountPage>
  );
}
