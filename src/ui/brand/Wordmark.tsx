import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '../ThemeProvider';

/**
 * The "famara" lettering from the master logo, rendered by `tools/brand/generate.mjs` as white
 * glyphs on transparent so it can take the text colour of either appearance. Metro turns the
 * require into an asset id.
 */
const lettering: number = require('../../../assets/images/wordmark.png');

/** Width over height of `assets/images/wordmark.png`. */
export const WORDMARK_ASPECT = 462 / 120;

export interface WordmarkProps {
  /** Rendered height of the lettering; the width follows. */
  height?: number;
}

/**
 * The Famara name as it appears in app headers. The illustrated mark lives only on the app icon
 * and launch screen, so in-app headers carry the lettering alone.
 */
export function Wordmark({ height = 22 }: WordmarkProps) {
  const theme = useTheme();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Famara">
      <Image
        source={lettering}
        tintColor={theme.colors.text}
        contentFit="contain"
        style={{ height, width: Math.round(height * WORDMARK_ASPECT) }}
        accessible={false}
      />
    </View>
  );
}
