/**
 * Font files registered at launch. Keys are the family names used in `tokens.ts`.
 * Fraunces (display) and Figtree (text) are both licensed under the SIL Open Font License.
 */
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';

import { fontFamily } from './tokens';

export const fontAssets: Record<(typeof fontFamily)[keyof typeof fontFamily], number> = {
  [fontFamily.display]: Fraunces_600SemiBold,
  [fontFamily.displayBold]: Fraunces_700Bold,
  [fontFamily.text]: Figtree_400Regular,
  [fontFamily.textMedium]: Figtree_500Medium,
  [fontFamily.textSemiBold]: Figtree_600SemiBold,
  [fontFamily.textBold]: Figtree_700Bold,
};
