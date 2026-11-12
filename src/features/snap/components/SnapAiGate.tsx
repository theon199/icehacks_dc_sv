import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
import { EmptyState, Screen } from '@/ui';

export interface SnapAiGateProps {
  /** Name of the feature being gated, used in the copy ("Snap uses AI ..."). */
  feature: string;
  children: ReactNode;
}

/**
 * Shows `children` only to people who are 18+ and have agreed to the AI terms. Everyone else gets
 * an explanation instead, and adults get a way to opt in. Nothing behind the gate mounts (so no
 * camera opens) until the person may use it.
 */
export function SnapAiGate({ feature, children }: SnapAiGateProps) {
  const canUseAi = useSessionStore((state) => selectCanUseAi(state));
  const isAdult = useSessionStore((state) => selectIsAdult(state));

  if (canUseAi) return children;

  if (!isAdult) {
    return (
      <Screen safeTop testID="ai-gate-age">
        <EmptyState
          icon="lock"
          title={`${feature} is for adults`}
          message={`${feature} uses AI to read your photos, which is available to people 18 and over.`}
        />
      </Screen>
    );
  }

  return (
    <Screen safeTop testID="ai-gate-consent">
      <EmptyState
        icon="sparkles"
        title={`Turn on AI to use ${feature}`}
        message={`${feature} sends your photo to Famara's AI to recognise food. Review how AI is used and turn it on to continue.`}
        actionLabel="Review and turn on"
        onAction={() => router.push('/ai-consent')}
      />
    </Screen>
  );
}
