import { useState } from 'react';
import { Alert } from 'react-native';

import { isApiError } from '@/lib/api/errors';
import { Button, GlassSheet, Text, TextField, toast } from '@/ui';

import { CuisinePicker } from './CuisinePicker';
import type { ProfileRow } from '../api/schemas';
import { useCatalogCuisines } from '../hooks/useProfileData';
import { useUpdateProfile } from '../hooks/useProfileMutations';
import {
  BIO_MAX,
  charCount,
  DISPLAY_NAME_MAX,
  hasUnsavedChanges,
  isEmptyPatch,
  profilePatch,
  saveErrorView,
  validateProfileDraft,
  type ProfileDraft,
  type ProfileFieldErrors,
} from '../model/profileForm';

export interface EditProfileSheetProps {
  profile: ProfileRow;
  onClose: () => void;
}

function draftFrom(profile: ProfileRow): ProfileDraft {
  return {
    displayName: profile.display_name,
    handle: profile.handle,
    bio: profile.bio,
    cuisines: profile.cuisines,
  };
}

/**
 * Glass sheet for editing name, handle, bio and cuisines. Mount it only while open: closing slides
 * the sheet away first, then `onClose` runs.
 */
export function EditProfileSheet({ profile, onClose }: EditProfileSheetProps) {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  const saved = draftFrom(profile);
  const [draft, setDraft] = useState<ProfileDraft>(saved);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const cuisines = useCatalogCuisines();
  const update = useUpdateProfile();

  const edit = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const dirty = hasUnsavedChanges(saved, draft);

  // Leaving with edits asks first; with nothing changed the sheet just closes. While a save is in
  // flight the sheet stays put so its result has somewhere to land.
  const dismiss = () => {
    if (update.isPending) return;
    if (!dirty) {
      close();
      return;
    }
    Alert.alert('Discard your changes?', 'Your edits to your profile have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: close },
    ]);
  };

  const save = () => {
    setFormError(null);
    const result = validateProfileDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const patch = profilePatch(saved, result.value);
    if (isEmptyPatch(patch)) {
      close();
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast.show({ tone: 'success', message: 'Profile updated' });
        close();
      },
      onError: (error) => {
        if (!isApiError(error)) {
          setFormError('Your changes could not be saved. Please try again.');
          return;
        }
        const view = saveErrorView(error);
        setErrors(view.fields);
        setFormError(view.form);
      },
    });
  };

  // The X stands in for Cancel. While a save is in flight the sheet stays put so its result has
  // somewhere to land.
  return (
    <GlassSheet
      visible={open}
      onClose={dismiss}
      onClosed={onClose}
      title="Edit profile"
      closeLabel="Cancel"
      dismissible={!update.isPending}
      testID="edit-profile-sheet"
      footer={
        <Button
          label="Save"
          onPress={save}
          loading={update.isPending}
          fullWidth
          testID="edit-profile-save"
        />
      }
    >
      {formError ? (
        <Text variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <TextField
        label="Name"
        value={draft.displayName}
        onChangeText={(text) => edit('displayName', text)}
        error={errors.displayName ?? null}
        hint={`${charCount(draft.displayName.trim())}/${DISPLAY_NAME_MAX}`}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        testID="edit-display-name"
      />
      <TextField
        label="Handle"
        value={draft.handle}
        onChangeText={(text) => edit('handle', text)}
        error={errors.handle ?? null}
        hint="Letters, numbers and underscores. People can find you by it."
        icon="at"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        maxLength={25}
        testID="edit-handle"
      />
      <TextField
        label="Bio"
        value={draft.bio}
        onChangeText={(text) => edit('bio', text)}
        error={errors.bio ?? null}
        hint={`${charCount(draft.bio.trim())}/${BIO_MAX}`}
        multiline
        placeholder="What do you love to cook?"
        testID="edit-bio"
      />
      <CuisinePicker
        options={cuisines.data}
        selected={draft.cuisines}
        onChange={(next) => edit('cuisines', next)}
        error={errors.cuisines}
      />
    </GlassSheet>
  );
}
