/**
 * Font files registered at launch. Keys are the family names used in `tokens.ts`.
 * Plus Jakarta Sans is licensed under the SIL Open Font License.
 */
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import { fontFamily } from './tokens';

export const fontAssets: Record<(typeof fontFamily)[keyof typeof fontFamily], number> = {
  [fontFamily.text]: PlusJakartaSans_400Regular,
  [fontFamily.textMedium]: PlusJakartaSans_500Medium,
  [fontFamily.textSemiBold]: PlusJakartaSans_600SemiBold,
  [fontFamily.textBold]: PlusJakartaSans_700Bold,
};
