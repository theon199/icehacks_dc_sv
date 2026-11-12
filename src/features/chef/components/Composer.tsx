import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';

import { deviceLocale } from '@/lib/format';
import { logger } from '@/lib/logger';
import { IconButton, Text, maxFontSizeMultiplier, space, toast, useTheme } from '@/ui';

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
  /**
   * When today's allowance is spent, the time (epoch ms) it resets. Typing is still fine, but
   * nothing can be sent until then, since the server would only refuse it.
   */
  limitedUntil?: number | null;
  onSend: (input: { text: string; photo: string | null }) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function clockTime(at: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(at);
  } catch {
    const time = new Date(at);
    return `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
  }
}

/** "Chef is back at 6:30 PM", or "tomorrow at 12:00 AM" when the reset is after midnight. */
export function limitResetNote(until: number, now = Date.now(), locale = deviceLocale()): string {
  const time = clockTime(until, locale);
  const days = Math.round((startOfDay(until) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return `You've used today's Chef questions. Chef is back at ${time}.`;
  if (days === 1) return `You've used today's Chef questions. Chef is back tomorrow at ${time}.`;
  return "You've used today's Chef questions. Chef is back once your allowance resets.";
}

function joinDictation(base: string, spoken: string): string {
  const head = base.trimEnd();
  return head ? `${head} ${spoken}` : spoken;
}

/** Question box with dictation and an optional photo. */
export function Composer({ busy, limitedUntil = null, onSend }: ComposerProps) {
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

  const limited = limitedUntil != null;
  const canSend = !busy && !limited && !preparing && (draft.trim().length > 0 || photo != null);
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
      {limited ? (
        <Text testID="chef-limit-note" variant="footnote" tone="muted" align="center">
          {limitResetNote(limitedUntil)}
        </Text>
      ) : null}
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
