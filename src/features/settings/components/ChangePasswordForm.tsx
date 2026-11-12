import { useState } from 'react';

import { Button, Text, TextField, toast } from '@/ui';

import { MIN_PASSWORD_LENGTH, changePassword } from '../account/accountApi';
import { useSubmission } from '../account/useSubmission';

export interface ChangePasswordFormProps {
  email: string | null;
  /** Accounts created with Apple or Google have no password yet; they set one without the old. */
  hasPassword: boolean;
  /** Called after a successful change so the account details can be read again. */
  onChanged: () => void;
}

/** Validates the new-password fields; returns a message or null when they are fine. */
export function passwordProblem(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (next !== confirm) return 'The two passwords do not match.';
  return null;
}

interface PasswordFields {
  current: string;
  next: string;
  confirm: string;
}

const BLANK: PasswordFields = { current: '', next: '', confirm: '' };

export function ChangePasswordForm({ email, hasPassword, onChanged }: ChangePasswordFormProps) {
  const [fields, setFields] = useState<PasswordFields>(BLANK);
  const { status, busy, submit, reject } = useSubmission('Could not change your password.');

  const field = (name: keyof PasswordFields) => (text: string) =>
    setFields((previous) => ({ ...previous, [name]: text }));

  const save = async () => {
    const problem = passwordProblem(fields.next, fields.confirm);
    if (problem) {
      reject(problem);
      return;
    }
    const saved = await submit(() =>
      changePassword({
        email,
        currentPassword: hasPassword ? fields.current : null,
        newPassword: fields.next,
      }),
    );
    if (!saved) return;
    setFields(BLANK);
    toast.show({
      message: hasPassword ? 'Your password has been changed.' : 'Your password is set.',
      tone: 'success',
    });
    onChanged();
  };

  const complete =
    fields.next !== '' && fields.confirm !== '' && (!hasPassword || fields.current !== '');
  const verb = hasPassword ? 'Change' : 'Set';

  return (
    <>
      <Text variant="headline">{hasPassword ? 'Change password' : 'Set a password'}</Text>
      {hasPassword ? (
        <TextField
          testID="account-password-current"
          label="Current password"
          value={fields.current}
          onChangeText={field('current')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          disabled={busy}
        />
      ) : null}
      <TextField
        testID="account-password-new"
        label="New password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        value={fields.next}
        onChangeText={field('next')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        disabled={busy}
      />
      <TextField
        testID="account-password-confirm"
        label="Confirm new password"
        value={fields.confirm}
        onChangeText={field('confirm')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={status.problem}
        disabled={busy}
      />
      <Button
        testID="account-password-submit"
        label={`${verb} password`}
        variant="secondary"
        loading={busy}
        disabled={!complete}
        onPress={() => void save()}
      />
    </>
  );
}
