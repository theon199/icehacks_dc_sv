import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/lib/api/errors';
import { Button, gutter, space, Text, TextField, toast, useTheme } from '@/ui';

import { CuisinePicker } from './CuisinePicker';
import type { ProfileRow } from '../api/schemas';
import { useCatalogCuisines } from '../hooks/useProfileData';
import { useUpdateProfile } from '../hooks/useProfileMutations';
import {
  BIO_MAX,
  charCount,
  DISPLAY_NAME_MAX,
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

/** Page sheet for editing name, handle, bio and cuisines. Mount it only while open. */
export function EditProfileSheet({ profile, onClose }: EditProfileSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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

  const save = () => {
    setFormError(null);
    const result = validateProfileDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const patch = profilePatch(saved, result.value);
    if (isEmptyPatch(patch)) {
      onClose();
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast.show({ tone: 'success', message: 'Profile updated' });
        onClose();
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

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="edit-profile-sheet"
    >
      <View style={[styles.flex, { backgroundColor: theme.colors.surface }]}>
        <View style={[styles.bar, { borderBottomColor: theme.colors.border }]}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} haptic={false} />
          <Text variant="headline">Edit profile</Text>
          <Button
            label="Save"
            size="sm"
            onPress={save}
            loading={update.isPending}
            testID="edit-profile-save"
          />
        </View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
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
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: gutter, gap: space.xl },
});
