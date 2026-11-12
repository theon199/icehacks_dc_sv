import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';

import { logger } from '@/lib/logger';
import { IconButton, maxFontSizeMultiplier, space, toast, useTheme } from '@/ui';

import { useDictation } from '../hooks/useDictation';
import { MAX_MESSAGE_LENGTH } from '../logic/conversation';
import {
  PhotoError,
  pickPhoto,
  preparePhoto,
  type PhotoSource,
  type PreparedPhoto,
} from '../logic/photo';

export interface ComposerProps {
  /** Chef is busy; typing is fine but sending waits. */
  busy: boolean;
  onSend: (input: { text: string; photo: string | null }) => void;
}

function joinDictation(base: string, spoken: string): string {
  const head = base.trimEnd();
  return head ? `${head} ${spoken}` : spoken;
}

/** Question box with dictation and an optional photo. */
export function Composer({ busy, onSend }: ComposerProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const baseRef = useRef('');
  const dictation = useDictation(
    useCallback((spoken: string) => setDraft(joinDictation(baseRef.current, spoken)), []),
  );

  const attach = async (source: PhotoSource) => {
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      setPreparing(true);
      setPhoto(await preparePhoto(picked.uri, picked.width));
    } catch (error) {
      if (error instanceof PhotoError) toast.error(error.message);
      else {
        logger.warn('Chef: photo could not be attached', { error: String(error) });
        toast.error("That photo couldn't be attached. Try another one.");
      }
    } finally {
      setPreparing(false);
    }
  };

  const choosePhoto = () => {
    Alert.alert('Add a photo', 'Show Chef your fridge, a dish or an ingredient.', [
      { text: 'Take photo', onPress: () => void attach('camera') },
      { text: 'Choose from library', onPress: () => void attach('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleDictation = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    baseRef.current = draft;
    void dictation.start();
  };

  const canSend = !busy && !preparing && (draft.trim().length > 0 || photo != null);
  const send = () => {
    if (!canSend) return;
    if (dictation.listening) dictation.stop();
    onSend({ text: draft, photo: photo?.base64 ?? null });
    setDraft('');
    setPhoto(null);
  };

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
      ]}
    >
      {photo || preparing ? (
        <View style={styles.preview}>
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              style={[styles.thumb, { borderRadius: theme.radii.sm }]}
              contentFit="cover"
              accessibilityLabel="Attached photo"
            />
          ) : (
            <View style={[styles.thumb, styles.center]}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          )}
          {photo ? (
            <IconButton
              icon="xmark.circle.fill"
              accessibilityLabel="Remove photo"
              size={32}
              color="textSubtle"
              onPress={() => setPhoto(null)}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <IconButton
          testID="chef-attach"
          icon="camera"
          accessibilityLabel="Add a photo"
          variant="tinted"
          disabled={preparing}
          onPress={choosePhoto}
        />
        <View
          style={[
            styles.field,
            {
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.lg,
              borderColor: dictation.listening ? theme.colors.primary : 'transparent',
            },
          ]}
        >
          <TextInput
            testID="chef-input"
            value={draft}
            onChangeText={setDraft}
            placeholder={dictation.listening ? 'Listening…' : 'Ask Chef anything about food'}
            placeholderTextColor={theme.colors.textSubtle}
            selectionColor={theme.colors.primary}
            accessibilityLabel="Message to Chef"
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            style={[styles.input, theme.typography.body, { color: theme.colors.text }]}
          />
          <IconButton
            testID="chef-dictate"
            icon={dictation.listening ? 'stop.circle.fill' : 'mic'}
            accessibilityLabel={dictation.listening ? 'Stop dictation' : 'Dictate'}
            size={36}
            color={dictation.listening ? 'primary' : 'textMuted'}
            selected={dictation.listening}
            onPress={toggleDictation}
          />
        </View>
        <IconButton
          testID="chef-send"
          icon="arrow.up"
          accessibilityLabel="Send"
          variant="filled"
          disabled={!canSend}
          onPress={send}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  thumb: { width: 64, height: 64 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: space.md,
    paddingRight: space.xxs,
    minHeight: 40,
    borderWidth: 1.5,
  },
  input: { flex: 1, maxHeight: 132, paddingTop: 8, paddingBottom: 8 },
});
