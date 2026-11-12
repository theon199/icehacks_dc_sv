import { useState } from 'react';

import { Button, Text, TextField, toast } from '@/ui';

import { AccountError, changeEmail, isValidEmail } from '../account/accountApi';

export interface ChangeEmailFormProps {
  currentEmail: string | null;
  onChanged: () => void;
}

/** Starts an email change; the new address must be confirmed from the link Supabase sends. */
export function ChangeEmailForm({ currentEmail, onChanged }: ChangeEmailFormProps) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = email.trim();
  const same = currentEmail != null && trimmed.toLowerCase() === currentEmail.toLowerCase();

  const submit = async () => {
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (same) {
      setError('That is already your email address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeEmail(trimmed);
      setEmail('');
      toast.show({
        message: `Check ${trimmed} for a confirmation link to finish the change.`,
        tone: 'success',
        durationMs: 6000,
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof AccountError ? cause.message : 'Could not change your email.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Text variant="headline">Change email</Text>
      <TextField
        testID="account-email-input"
        label="New email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (error) setError(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        error={error}
        disabled={saving}
      />
      <Button
        testID="account-email-submit"
        label="Send confirmation"
        variant="secondary"
        loading={saving}
        disabled={trimmed.length === 0}
        onPress={() => void submit()}
      />
    </>
  );
}
