import { FlashList } from '@shopify/flash-list';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, space, Text, useTheme } from '@/ui';

import { SnapPill } from './SnapPill';
import { SweepItemRow } from './SweepItemRow';
import { SweepTag } from './SweepTag';
import { SweepWordsBar } from './SweepWordsBar';
import type { SweepView } from '../capture/sweepRun';
import { useFreshKeys } from '../hooks/useSweepClock';
import type { DictationStatus } from '../hooks/useSweepDictation';
import { isFromVideo, type SweepItem } from '../logic/sweepItems';

export interface SweepSheetProps {
  view: SweepView;
  /** Where the sheet's top edge sits, under the camera. */
  top: number;
  micStatus: DictationStatus;
  /** What the mic is hearing, shown while listening. */
  transcript: string;
  onSendWords: (text: string) => boolean;
  onMic: () => void;
  onFilmMore: () => void;
  onDone: () => void;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The line under the title: how the pass is going when the list alone cannot say. */
function statusLine(view: SweepView): string | null {
  if (view.items.length > 0) return null;
  const filming = view.status === 'filming';
  if (view.answered > 0 && view.sawFood === 0) {
    return filming
      ? 'No food seen yet. Get a little closer, in good light.'
      : "We couldn't see any food. Film more, or say what you have.";
  }
  if (filming) return "Move slowly along each shelf. Items show up here as they're seen.";
  return view.reading > 0 ? 'Reading the last frames…' : null;
}

/**
 * The white sheet under the camera during a fridge sweep: what it has seen so far, newest first,
 * with the field and mic for what it missed. Once filming stops it offers to film more, or to go
 * on and check the list.
 */
export function SweepSheet({
  view,
  top,
  micStatus,
  transcript,
  onSendWords,
  onMic,
  onFilmMore,
  onDone,
}: SweepSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fresh = useFreshKeys(view.items);
  const filming = view.status === 'filming';
  const finishing = view.status === 'finishing';
  const listening = micStatus === 'listening' || micStatus === 'starting';
  const seen = view.items.filter(isFromVideo).length;
  const title = filming
    ? `Seeing ${view.items.length} ${plural(view.items.length, 'item', 'items')}`
    : `${seen} from video`;
  const line = statusLine(view);

  const renderItem = useCallback(
    ({ item }: { item: SweepItem }) => <SweepItemRow item={item} fresh={fresh.has(item.key)} />,
    [fresh],
  );

  return (
    <View
      style={[
        styles.sheet,
        {
          top,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.sheet,
          borderTopRightRadius: theme.radii.sheet,
        },
      ]}
      testID="sweep-sheet"
    >
      <View
        style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.head}>
        <Text variant="title3" accessibilityRole="header" testID="sweep-title">
          {title}
        </Text>
        {filming ? <SweepTag label="Filming" tone="highlight" icon="video.fill" /> : null}
        {listening ? <SweepTag label="Listening" tone="highlight" icon="mic.fill" /> : null}
      </View>
      {listening ? (
        <View
          style={[
            styles.transcript,
            { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
          ]}
          accessibilityLiveRegion="polite"
          testID="sweep-transcript"
        >
          <Icon name="waveform" size={18} color="textMuted" />
          <Text variant="callout" style={styles.flex}>
            {transcript ? `“${transcript}”` : 'Listening… say what the camera missed.'}
          </Text>
        </View>
      ) : null}
      {line ? (
        <Text variant="subhead" tone="muted" style={styles.pad} testID="sweep-status">
          {line}
        </Text>
      ) : null}
      {view.notice ? (
        <View style={[styles.notice, styles.pad]} accessibilityLiveRegion="polite">
          <Icon name="exclamationmark.circle" size={16} color="textMuted" />
          <Text variant="footnote" tone="muted" style={styles.flex} testID="sweep-notice">
            {view.notice}
          </Text>
        </View>
      ) : null}
      <View style={styles.flex}>
        <FlashList
          data={view.items}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          extraData={fresh}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + space.md, borderTopColor: theme.colors.border },
        ]}
      >
        <SweepWordsBar
          wordsLeft={view.wordsLeft}
          micStatus={micStatus}
          onSend={onSendWords}
          onMic={onMic}
          disabled={finishing}
        />
        {filming ? null : (
          <View style={styles.actions}>
            <SnapPill
              label="Film more"
              onPress={onFilmMore}
              disabled={finishing || view.framesLeft === 0}
              accessibilityHint="Goes back to filming the same pass"
              testID="sweep-film-more"
            />
            <SnapPill
              label={finishing ? 'Reading…' : 'Done'}
              tone="lime"
              onPress={onDone}
              disabled={finishing}
              accessibilityHint="Check the list before adding it to your pantry"
              testID="sweep-done"
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: space.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  pad: { marginHorizontal: space.lg, marginBottom: space.sm },
  transcript: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  notice: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  flex: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  foot: {
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', gap: space.sm + space.xxs },
});
