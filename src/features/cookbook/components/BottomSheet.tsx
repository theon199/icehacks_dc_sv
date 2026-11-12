import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gutter, space, Text, useTheme } from '@/ui';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

/**
 * Modal panel anchored to the bottom of the screen for short, in-place choices (actions, moving a
 * meal). The scrim closes it; VoiceOver's escape gesture maps to `onRequestClose`.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  testID,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              paddingBottom: Math.max(insets.bottom, space.lg),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            <View style={styles.heading}>
              <Text variant="title3">{title}</Text>
              {description ? (
                <Text variant="footnote" tone="muted">
                  {description}
                </Text>
              ) : null}
            </View>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: { maxHeight: '88%' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: space.sm,
    opacity: 0.4,
  },
  body: { padding: gutter, paddingTop: space.lg, gap: space.lg },
  heading: { gap: space.xs },
  footer: { paddingHorizontal: gutter, gap: space.sm },
});
