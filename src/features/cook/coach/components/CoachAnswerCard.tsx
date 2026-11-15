import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, radii, space, useTheme, type Palette } from '@/ui';

import type { CoachStatus } from '../logic/coachStatus';

type Answer = Extract<CoachStatus, { kind: 'answer' }>;

const VERDICT_TITLES: Readonly<Record<Answer['verdict'], string>> = {
  not_yet: 'Not yet',
  yes: 'Looks good',
  unsure: 'Hard to say',
  not_visible: 'I can’t see that',
};

const NO_PHOTO_NOTES = {
  camera_off: 'Answered from your words only: the camera is off.',
  capture_failed: 'No photo this time, so this is from your words only.',
} as const;

interface Look {
  background: keyof Palette;
  ink: keyof Palette;
  muted: keyof Palette;
}

/** Ink for "not yet" (keep going), lime for "looks good" (the one emphasis), neutral otherwise. */
const LOOKS: Readonly<Record<Answer['verdict'], Look>> = {
  not_yet: { background: 'primary', ink: 'onPrimary', muted: 'onPrimary' },
  yes: { background: 'highlight', ink: 'onHighlight', muted: 'onHighlight' },
  unsure: { background: 'surface', ink: 'text', muted: 'textMuted' },
  not_visible: { background: 'surface', ink: 'text', muted: 'textMuted' },
};

export function SaidAloud({ color }: { color: keyof Palette }) {
  return (
    <View style={styles.said} accessible={false} importantForAccessibility="no-hide-descendants">
      <Icon name="waveform" size={15} color={color} />
      <Text variant="caption" color={color} style={styles.faint}>
        Said out loud
      </Text>
    </View>
  );
}

export function InkCard({ children, testID }: { children: ReactNode; testID: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.primary }]}
      accessible
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {children}
    </View>
  );
}

export interface CoachAnswerCardProps {
  status: Answer;
  spoken: boolean;
}

/** The coach's answer: a big verdict, the words it said, and why there was no photo if none. */
export function CoachAnswerCard({ status, spoken }: CoachAnswerCardProps) {
  const theme = useTheme();
  const look = LOOKS[status.verdict];
  const title = VERDICT_TITLES[status.verdict];
  const big = status.verdict === 'not_yet' || status.verdict === 'yes';
  const note = status.withoutPhoto ? NO_PHOTO_NOTES[status.withoutPhoto] : null;
  return (
    <View
      style={[
        styles.card,
        look.background === 'surface'
          ? [theme.elevation.medium, { shadowColor: theme.colors.shadow }]
          : null,
        { backgroundColor: theme.colors[look.background] },
      ]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={[title, status.answer, note].filter(Boolean).join('. ')}
      testID={`coach-answer-${status.verdict}`}
    >
      <Text
        variant={big ? 'displayLarge' : 'title1'}
        color={look.ink}
        maxFontSizeMultiplier={1.3}
        style={big ? styles.verdict : null}
      >
        {title}
      </Text>
      <Text variant="title3" color={look.ink} maxFontSizeMultiplier={1.4}>
        {status.answer}
      </Text>
      {note ? (
        <View style={styles.said}>
          <Icon name="eye.slash" size={15} color={look.muted} />
          <Text variant="footnote" color={look.muted} style={styles.faint}>
            {note}
          </Text>
        </View>
      ) : null}
      {spoken ? <SaidAloud color={look.muted} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.xl, gap: space.sm },
  verdict: {
    fontFamily: fontFamily.displayBold,
    fontSize: 46,
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  said: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  faint: { opacity: 0.75, flexShrink: 1 },
});
