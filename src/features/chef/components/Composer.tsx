import { GlassContainer } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceLocale } from '@/lib/format';
import { logger } from '@/lib/logger';
import {
  GlassIconButton,
  GlassSurface,
  Icon,
  IconButton,
  Text,
  hasLiquidGlass,
  maxFontSizeMultiplier,
  space,
  toast,
  useTheme,
  type Palette,
} from '@/ui';
import { withAlpha } from '@/ui/color';

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
  /** Lets the screen open the photo choice, e.g. from the first screen's "Take a photo". */
  ref?: Ref<ComposerHandle>;
}

export interface ComposerHandle {
  /** Asks whether to take a photo or choose one, then attaches it to the question. */
  choosePhoto: () => void;
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

function nextDayStart(at: number): number {
  const day = new Date(startOfDay(at));
  day.setDate(day.getDate() + 1);
  return day.getTime();
}

/**
 * Start of the current local day, refreshed at midnight while `active`, so a note that says
 * "tomorrow" switches to today's wording once the date changes instead of waiting for a re-render.
 */
function useDayStart(active: boolean): number {
  const [dayStart, setDayStart] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    if (!active) return;
    // A day that has already ended (the screen sat idle while not limited) refreshes at once.
    const wait = Math.max(0, nextDayStart(dayStart) - Date.now());
    const timer = setTimeout(() => setDayStart(startOfDay(Date.now())), wait);
    return () => clearTimeout(timer);
  }, [active, dayStart]);
  return dayStart;
}

/**
 * Reads the limit note out once whenever a limit is shown: when the composer mounts already limited
 * (opening or switching to a thread after the allowance ran out), when the limit starts while it is
 * open, and when the reset time moves. The note is plain text above the field, which VoiceOver
 * would otherwise never mention, so a person reopening Chef learns why the field is unavailable.
 */
function useAnnounceLimit(limitedUntil: number | null): void {
  useEffect(() => {
    if (limitedUntil == null) return;
    AccessibilityInfo.announceForAccessibility(limitResetNote(limitedUntil));
  }, [limitedUntil]);
}

function joinDictation(base: string, spoken: string): string {
  const head = base.trimEnd();
  return head ? `${head} ${spoken}` : spoken;
}

/** Question box with dictation and an optional photo. */
export function Composer({ busy, limitedUntil = null, onSend, ref }: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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

  useImperativeHandle(ref, () => ({ choosePhoto }));

  const toggleDictation = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    baseRef.current = draft;
    void dictation.start();
  };

  const limited = limitedUntil != null;
  const dayStart = useDayStart(limited);
  useAnnounceLimit(limitedUntil);
  const canSend = !busy && !limited && !preparing && (draft.trim().length > 0 || photo != null);
  const send = () => {
    if (!canSend) return;
    if (dictation.listening) dictation.stop();
    onSend({ text: draft, photo: photo?.base64 ?? null });
    setDraft('');
    setPhoto(null);
  };

  const listeningTint: keyof Palette = 'onHighlight';
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}
    >
      {/* Messages dissolve into the canvas above the bar instead of running under it. */}
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(theme.colors.background, 0), theme.colors.background]}
        style={styles.fade}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}
      />
      {limited ? (
        <Text testID="chef-limit-note" variant="footnote" tone="muted" align="center">
          {limitResetNote(limitedUntil, dayStart)}
        </Text>
      ) : null}
      {photo || preparing ? (
        <View style={styles.preview}>
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              style={[styles.thumb, { borderRadius: theme.radii.md }]}
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
      <ControlStack>
        <View style={styles.row}>
          <GlassIconButton
            testID="chef-attach"
            icon="plus"
            accessibilityLabel="Add a photo"
            size={BAR_HEIGHT}
            iconColor={preparing ? 'textMuted' : 'text'}
            disabled={preparing}
            onPress={choosePhoto}
          />
          <GlassSurface
            radius={BAR_HEIGHT / 2}
            tint="transparent"
            style={[
              styles.field,
              hasLiquidGlass()
                ? null
                : {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.colors.controlBorder,
                  },
            ]}
          >
            <TextInput
              testID="chef-input"
              value={draft}
              onChangeText={setDraft}
              placeholder={dictation.listening ? 'Listening…' : 'Ask Chef anything'}
              placeholderTextColor={theme.colors.textMuted}
              selectionColor={theme.colors.primary}
              accessibilityLabel="Message to Chef"
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={[styles.input, theme.typography.body, { color: theme.colors.text }]}
            />
            <Pressable
              testID="chef-dictate"
              accessibilityRole="button"
              accessibilityLabel={dictation.listening ? 'Stop dictation' : 'Dictate'}
              accessibilityState={{ selected: dictation.listening }}
              hitSlop={6}
              onPress={toggleDictation}
              style={[
                styles.inner,
                dictation.listening && { backgroundColor: theme.colors.highlight },
              ]}
            >
              <Icon
                name={dictation.listening ? 'mic.fill' : 'mic'}
                size={20}
                color={dictation.listening ? listeningTint : 'text'}
              />
            </Pressable>
            <Pressable
              testID="chef-send"
              accessibilityRole="button"
              // The limit note is plain text, so the disabled button carries the reason for VoiceOver.
              accessibilityLabel={limited ? "Send. You've used today's Chef questions" : 'Send'}
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={send}
              style={[
                styles.inner,
                { backgroundColor: canSend ? theme.colors.primary : theme.colors.primarySoft },
              ]}
            >
              <Icon name="arrow.up" size={18} color={canSend ? 'onPrimary' : 'textMuted'} />
            </Pressable>
          </GlassSurface>
        </View>
      </ControlStack>
    </View>
  );
}

/**
 * The photo circle and the field as one glass group, so on Liquid Glass they merge and morph
 * together. The fallback surfaces have nothing to merge and sit plainly.
 */
function ControlStack({ children }: { children: ReactNode }) {
  return hasLiquidGlass() ? (
    <GlassContainer spacing={space.sm} style={styles.stack}>
      {children}
    </GlassContainer>
  ) : (
    <View style={styles.stack}>{children}</View>
  );
}

/** Height of the field and of the round attach control beside it. */
const BAR_HEIGHT = 48;
const INNER_BUTTON = 36;
const FADE_HEIGHT = 44;

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.md, paddingTop: space.xs, gap: space.sm + 2 },
  stack: { gap: space.sm + 2 },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE_HEIGHT, height: FADE_HEIGHT },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  thumb: { width: 54, height: 54 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm + 2 },
  field: {
    flex: 1,
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: space.md + 2,
    paddingRight: space.sm,
    paddingVertical: (BAR_HEIGHT - INNER_BUTTON) / 2,
    gap: space.xs,
  },
  input: { flex: 1, minHeight: INNER_BUTTON, maxHeight: 132, paddingTop: 7, paddingBottom: 7 },
  inner: {
    width: INNER_BUTTON,
    height: INNER_BUTTON,
    borderRadius: INNER_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
