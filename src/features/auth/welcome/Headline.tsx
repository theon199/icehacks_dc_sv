import { StyleSheet } from 'react-native';

import { Text, fontFamily } from '@/ui';

import type { HeadlineRun } from './welcomeContent';
import { DESIGN, useWelcomeScale } from './welcomeScale';
import { night } from '../components/NightTheme';

/** One page's headline, two lines at most; accented runs are lime. */
export function Headline({ runs }: { runs: readonly HeadlineRun[] }) {
  const { font, px } = useWelcomeScale();
  const size = font(DESIGN.headlineSize);
  const type = { fontSize: size, lineHeight: size * DESIGN.headlineLineHeight };
  return (
    <Text
      accessibilityRole="header"
      adjustsFontSizeToFit
      maxFontSizeMultiplier={1.15}
      numberOfLines={DESIGN.headlineLines}
      style={[styles.headline, type, { letterSpacing: -px(1) }]}
    >
      {runs.map((run, index) =>
        run.accent ? (
          <Text key={index} color="highlight" style={[styles.face, type]}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  headline: { color: night.ink, fontFamily: fontFamily.display },
  face: { fontFamily: fontFamily.display },
});
