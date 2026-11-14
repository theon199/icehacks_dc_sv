import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { space } from './tokens';

export interface SheetContentProps {
  title?: string;
  description?: string;
  children: ReactNode;
  /** Pinned actions at the bottom of the sheet. */
  footer?: ReactNode;
  /** Scroll the body (default true). Disable for sheets that fit their smallest detent. */
  scroll?: boolean;
}

/**
 * Body of a sheet: a native form sheet route (`presentation: 'formSheet'`, see `sheetOptions`) or
 * a page-sheet `Modal`. The system draws the grabber and the 32 pt rounded container; this adds the
 * sheet's 20 pt side padding, title, 12 pt rhythm between blocks, and a footer pinned above the
 * home indicator.
 */
export function SheetContent({
  title,
  description,
  children,
  footer,
  scroll = true,
}: SheetContentProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const heading =
    title || description ? (
      <View style={styles.heading}>
        {title ? <Text variant="title2">{title}</Text> : null}
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.surface }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {heading}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.body]}>
          {heading}
          {children}
        </View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.xl, paddingTop: space.xxl, gap: space.md },
  heading: { gap: space.xs },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm },
});
