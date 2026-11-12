import { useState } from 'react';

import { Button, Text, TextField, toast } from '@/ui';

import { changeEmail, isValidEmail } from '../account/accountApi';
import { useSubmission } from '../account/useSubmission';

export interface ChangeEmailFormProps {
  currentEmail: string | null;
  onChanged: () => void;
}

/** Why `candidate` cannot be used as the new address, or null when it can. */
export function emailProblem(candidate: string, currentEmail: string | null): string | null {
  const address = candidate.trim();
  if (!isValidEmail(address)) return 'Enter a valid email address.';
  if (currentEmail != null && address.toLowerCase() === currentEmail.toLowerCase()) {
    return 'That is already your email address.';
  }
  return null;
}

/** Starts an email change; the new address must be confirmed from the link Supabase sends. */
export function ChangeEmailForm({ currentEmail, onChanged }: ChangeEmailFormProps) {
  const [draft, setDraft] = useState('');
  const { status, busy, submit, reject, dismiss } = useSubmission('Could not change your email.');

  const send = async () => {
    const problem = emailProblem(draft, currentEmail);
    if (problem) {
      reject(problem);
      return;
    }
    const address = draft.trim();
    const sent = await submit(() => changeEmail(address));
    if (!sent) return;
    setDraft('');
    toast.show({
      message: `Check ${address} for a confirmation link to finish the change.`,
      tone: 'success',
      durationMs: 6000,
    });
    onChanged();
  };

  const edit = (text: string) => {
    setDraft(text);
    if (status.phase === 'failed') dismiss();
  };

  return (
    <>
      <Text variant="headline">Change email</Text>
      <TextField
        testID="account-email-input"
        label="New email"
        value={draft}
        onChangeText={edit}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        error={status.problem}
        disabled={busy}
      />
      <Button
        testID="account-email-submit"
        label="Send confirmation"
        variant="secondary"
        loading={busy}
        disabled={draft.trim() === ''}
        onPress={() => void send()}
      />
    </>
  );
}
