import { Fragment, useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { haptics } from '@/lib/haptics';

import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useToastStore, type ToastTone } from './toastStore';
import { gutter, space } from './tokens';

const toneIcon: Record<ToastTone, IconName> = {
  neutral: 'info.circle.fill',
  success: 'checkmark.circle.fill',
  danger: 'exclamationmark.circle.fill',
};

/**
 * On iOS, form sheets and modals are presented as separate view controllers above the root view,
 * so anything rendered in the root view would sit behind them. A full-window overlay lives in its
 * own layer on top of every presented screen. It is not modal for VoiceOver, so the screen
 * underneath stays reachable while a toast is up.
 */
function ToastLayer({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') return <Fragment>{children}</Fragment>;
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
      {children}
    </FullWindowOverlay>
  );
}

/**
 * Renders the current toast at the top of the screen, above sheets and modals. Mount once, at
 * the root.
 */
export function ToastHost() {
  const current = useToastStore((s) => s.queue[0]);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return undefined;
    AccessibilityInfo.announceForAccessibility(current.message);
    if (current.tone === 'danger') haptics.error();
    else if (current.tone === 'success') haptics.success();
    const timer = setTimeout(() => dismiss(current.id), current.durationMs);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;
  const iconColor =
    current.tone === 'danger' ? 'danger' : current.tone === 'success' ? 'success' : 'primary';

  return (
    <ToastLayer>
      <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + space.sm }]}>
        <Animated.View key={current.id} entering={FadeInUp} exiting={FadeOutUp}>
          <GlassSurface radius="lg" style={styles.toast}>
            <PressableScale
              accessibilityRole="alert"
              accessibilityLabel={current.message}
              accessibilityHint="Double tap to dismiss"
              pressedScale={1}
              onPress={() => dismiss(current.id)}
              style={styles.row}
            >
              <Icon name={toneIcon[current.tone]} size={20} color={iconColor} />
              <Text variant="subhead" style={styles.message} numberOfLines={3}>
                {current.message}
              </Text>
            </PressableScale>
            {current.action ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                onPress={() => {
                  current.action?.onPress();
                  dismiss(current.id);
                }}
                hitSlop={10}
                style={styles.action}
              >
                <Text variant="label" tone="primary">
                  {current.action.label}
                </Text>
              </PressableScale>
            ) : null}
          </GlassSurface>
        </Animated.View>
      </View>
    </ToastLayer>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: gutter, right: gutter, zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', paddingRight: space.md },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    minHeight: 52,
  },
  message: { flex: 1 },
  action: { paddingHorizontal: space.sm, minHeight: 44, justifyContent: 'center' },
});
