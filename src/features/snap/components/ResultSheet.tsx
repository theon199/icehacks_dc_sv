import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '@/ui';

import { PhotoBackdrop } from './PhotoBackdrop';

export interface ResultSheetProps {
  photoUri: string;
  /** Back to the camera. */
  onClose: () => void;
  /** Share of the window the photo keeps above the sheet. */
  peek?: number;
  /** Fills the sheet; scrolls on its own. */
  children: ReactNode;
  /** Pinned under a hairline at the foot of the sheet: one or two `SnapPill`s. */
  footer?: ReactNode;
  testID?: string;
}

/**
 * A Snap result: the photo stays on screen, dimmed, and a white sheet with rounded top corners
 * rises over most of it, holding what Famara made of the photo and the actions at its foot.
 */
export function ResultSheet({
  photoUri,
  onClose,
  peek = 0.2,
  children,
  footer,
  testID,
}: ResultSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <PhotoBackdrop photoUri={photoUri} onClose={onClose} heavy>
      <View
        style={[
          styles.sheet,
          {
            top: Math.max(height * peek, insets.top + 60),
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
          },
        ]}
        {...(testID ? { testID } : {})}
      >
        <View
          style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.body}>{children}</View>
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + space.md,
                borderTopColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </PhotoBackdrop>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: space.sm },
  body: { flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: space.sm + space.xxs,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
