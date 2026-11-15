import { useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ChoiceChip,
  GlassSurface,
  Icon,
  PressableScale,
  Text,
  TextField,
  radii,
  space,
  useTheme,
} from '@/ui';
import { withAlpha } from '@/ui/color';

import { RatingInput } from './RatingInput';
import { MAX_NOTES_LENGTH } from '../logic/completion';

export type Again = 'yes' | 'no' | null;

export interface DoneReviewSheetProps {
  hasPhoto: boolean;
  rating: number | null;
  again: Again;
  notes: string;
  saving: boolean;
  /** False until the recipe has loaded; nothing may be saved before. */
  canSave: boolean;
  onRating: (rating: number | null) => void;
  onAgain: (again: Again) => void;
  onNotes: (notes: string) => void;
  onAddPhoto: () => void;
  onSave: () => void;
  onShare: () => void;
}

/** Resting height as a share of the screen: taller when no photo is showing above it. */
const HEIGHT_WITH_PHOTO = 0.66;
const HEIGHT_WITHOUT_PHOTO = 0.74;
const GRABBER_WIDTH = 44;
/** A denser frost than the kit default: the sheet carries a form over a busy photo. */
const SHEET_FROST = 0.72;

/**
 * How it went, on a frosted sheet over the dish photo: an optional photo, the star rating,
 * whether they would cook it again and what they changed, then Save or Save and share.
 *
 * The keyboard is handled the way the kit's glass sheet handles it: the sheet stands on the
 * keyboard and gives up height (never its top margin) when there is not enough room, and the
 * heading stays in the fixed head with the grabber while the form scrolls under it. Typing what
 * they changed scrolls the form to its end, so the whole field and Save sit above the keyboard.
 */
export function DoneReviewSheet({
  hasPhoto,
  rating,
  again,
  notes,
  saving,
  canSave,
  onRating,
  onAgain,
  onNotes,
  onAddPhoto,
  onSave,
  onShare,
}: DoneReviewSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = height * (hasPhoto ? HEIGHT_WITH_PHOTO : HEIGHT_WITHOUT_PHOTO);
  const scroll = useRef<ScrollView>(null);
  const notesFocused = useRef(false);

  // Once the keyboard is up the sheet has settled on it, so the end of the form is final.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (notesFocused.current) scroll.current?.scrollToEnd({ animated: true });
    });
    return () => shown.remove();
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.stage, { paddingTop: insets.top + space.sm }]}
      testID="cook-done-stage"
    >
      <View
        style={[
          styles.sheet,
          {
            height: sheetHeight + radii.sheet,
            ...theme.elevation.high,
            shadowColor: theme.colors.shadow,
          },
        ]}
        testID="cook-done-sheet"
      >
        {/* Pinned to the app's appearance: on auto the material would darken over the photo and
          bury the form's ink. */}
        <GlassSurface
          radius="sheet"
          scheme={theme.scheme}
          tint={withAlpha(theme.colors.surface, SHEET_FROST)}
          style={styles.surface}
        >
          <View style={styles.head}>
            <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
            <Text variant="title2" accessibilityRole="header">
              How was it?
            </Text>
          </View>
          <ScrollView
            ref={scroll}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + space.xl + radii.sheet },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            testID="cook-done-scroll"
          >
            {hasPhoto ? null : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Add a photo"
                onPress={onAddPhoto}
                style={[
                  styles.inset,
                  styles.photoRow,
                  { backgroundColor: theme.colors.surfaceSunken },
                ]}
                testID="cook-done-add-photo"
              >
                <View style={[styles.photoIcon, { backgroundColor: theme.colors.surface }]}>
                  <Icon name="camera" size={20} color="text" />
                </View>
                <View style={styles.flex}>
                  <Text variant="label">Add a photo</Text>
                  <Text variant="caption" tone="muted">
                    Optional. Camera or library.
                  </Text>
                </View>
                <Icon name="chevron.right" size={18} color="textMuted" />
              </PressableScale>
            )}

            <View style={styles.group}>
              <Text variant="overline" tone="muted">
                Taste
              </Text>
              <RatingInput value={rating} onChange={onRating} />
            </View>

            <View style={styles.group}>
              <Text variant="overline" tone="muted">
                Would you cook it again?
              </Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                <ChoiceChip
                  label="Yes"
                  mode="radio"
                  selected={again === 'yes'}
                  onToggle={(on) => onAgain(on ? 'yes' : null)}
                  testID="cook-again-yes"
                />
                <ChoiceChip
                  label="Probably not"
                  mode="radio"
                  selected={again === 'no'}
                  onToggle={(on) => onAgain(on ? 'no' : null)}
                  testID="cook-again-no"
                />
              </View>
            </View>

            <TextField
              label="What I changed"
              placeholder="Less salt, added spinach, baked instead of fried…"
              value={notes}
              onChangeText={onNotes}
              multiline
              maxLength={MAX_NOTES_LENGTH}
              onFocus={() => {
                notesFocused.current = true;
              }}
              onBlur={() => {
                notesFocused.current = false;
              }}
              testID="cook-done-notes"
            />

            <View style={styles.actions}>
              <Button
                label="Save"
                icon="checkmark"
                fullWidth
                loading={saving}
                disabled={!canSave}
                onPress={onSave}
                testID="cook-done-save"
              />
              <Button
                label="Save and share to community"
                icon="square.and.arrow.up"
                variant="ghost"
                fullWidth
                disabled={!canSave || saving}
                onPress={onShare}
                testID="cook-done-share"
              />
            </View>
          </ScrollView>
        </GlassSurface>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  stage: { justifyContent: 'flex-end' },
  // The foot hangs below the screen edge (or the keyboard) so only the top corners read as
  // rounded. It shrinks rather than push past the top margin when the keyboard leaves no room.
  sheet: { width: '100%', flexShrink: 1, marginBottom: -radii.sheet },
  surface: { flex: 1 },
  head: { gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xs },
  grabber: {
    width: GRABBER_WIDTH,
    height: 5,
    borderRadius: radii.pill,
    alignSelf: 'center',
    marginTop: space.sm,
  },
  scroll: { flex: 1 },
  content: { gap: 10, paddingTop: space.xs, paddingHorizontal: space.xl },
  inset: { borderRadius: radii.lg },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
  },
  photoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { gap: space.xxs },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  actions: { gap: space.xs, marginTop: space.sm },
  flex: { flex: 1 },
});
