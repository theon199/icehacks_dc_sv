import { useState } from 'react';

import { Button, Text, TextField, toast } from '@/ui';

import { AccountError, MIN_PASSWORD_LENGTH, changePassword } from '../account/accountApi';

export interface ChangePasswordFormProps {
  email: string | null;
  /** Accounts created with Apple or Google have no password yet; they set one without the old. */
  hasPassword: boolean;
}

/** Validates the new-password fields; returns a message or null when they are fine. */
export function passwordProblem(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (next !== confirm) return 'The two passwords do not match.';
  return null;
}

export function ChangePasswordForm({ email, hasPassword }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problem = passwordProblem(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword({
        email,
        currentPassword: hasPassword ? current : null,
        newPassword: next,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.show({ message: 'Your password has been changed.', tone: 'success' });
    } catch (cause) {
      setError(cause instanceof AccountError ? cause.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  const ready = (!hasPassword || current.length > 0) && next.length > 0 && confirm.length > 0;

  return (
    <>
      <Text variant="headline">{hasPassword ? 'Change password' : 'Set a password'}</Text>
      {hasPassword ? (
        <TextField
          testID="account-password-current"
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          disabled={saving}
        />
      ) : null}
      <TextField
        testID="account-password-new"
        label="New password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        disabled={saving}
      />
      <TextField
        testID="account-password-confirm"
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={error}
        disabled={saving}
      />
      <Button
        testID="account-password-submit"
        label={hasPassword ? 'Change password' : 'Set password'}
        variant="secondary"
        loading={saving}
        disabled={!ready}
        onPress={() => void submit()}
      />
    </>
  );
}
