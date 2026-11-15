/**
 * Font files registered at launch. Keys are the family names used in `tokens.ts`, plus the
 * Ionicons glyph font `Icon` draws with, loaded up front so no icon pops in after the splash.
 * Plus Jakarta Sans is licensed under the SIL Open Font License.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import { fontFamily } from './tokens';

const textFaces: Record<(typeof fontFamily)[keyof typeof fontFamily], number> = {
  [fontFamily.text]: PlusJakartaSans_400Regular,
  [fontFamily.textMedium]: PlusJakartaSans_500Medium,
  [fontFamily.textSemiBold]: PlusJakartaSans_600SemiBold,
  [fontFamily.textBold]: PlusJakartaSans_700Bold,
};

export const fontAssets: Readonly<Record<string, number | string>> = {
  ...textFaces,
  ...Ionicons.font,
};
