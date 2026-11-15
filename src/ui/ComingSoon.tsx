import { EmptyState } from './EmptyState';
import type { IconName } from './Icon';
import { Screen } from './Screen';

export interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: IconName;
  /** Set for screens without a native header so content clears the status bar. */
  safeTop?: boolean;
  /**
   * A way out, for placeholders shown without a native header or back gesture (full-screen
   * routes): without it the person would be stuck on the screen.
   */
  onClose?: () => void;
}

/** Placeholder for a screen whose feature is still being built. */
export function ComingSoon({
  title,
  description = 'This part of Famara is being prepared.',
  icon = 'fork.knife',
  safeTop = false,
  onClose,
}: ComingSoonProps) {
  return (
    <Screen safeTop={safeTop} testID="coming-soon">
      <EmptyState
        icon={icon}
        title={title}
        message={description}
        {...(onClose ? { actionLabel: 'Go back', onAction: onClose } : {})}
      />
    </Screen>
  );
}
