import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { MIN_AI_AGE, selectIsAdult, useSessionStore } from '@/features/auth';
import { Text, space, toast } from '@/ui';

import { setAiConsent } from '../aiConsent';
import { SettingsRow, SettingsToggleRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

export const AI_SUMMARY =
  'Chef, Snap and "Make it healthier" send your message or photo, plus your food preferences and ' +
  'allergens, to an AI model so it can answer. Famara double-checks every recipe it suggests ' +
  'against your allergens and diet before showing it.';

/** The AI features switch with a plain explanation of what turning it on means. */
export function AiConsentSection() {
  const router = useRouter();
  const consent = useSessionStore((s) => s.aiConsent);
  const adult = useSessionStore((s) => selectIsAdult(s));
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await setAiConsent(next);
      toast.show({
        message: next ? 'AI features are on.' : 'AI features are off.',
        tone: 'success',
      });
    } catch {
      toast.show({ message: 'Could not save your choice. Check your connection.', tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="AI features">
      {adult ? (
        <SettingsToggleRow
          testID="settings-ai-consent"
          icon="sparkles"
          label="Use AI features"
          description={AI_SUMMARY}
          value={consent}
          disabled={saving}
          onValueChange={(next) => void change(next)}
        />
      ) : (
        <Text variant="caption" tone="muted" testID="settings-ai-age" style={styles.note}>
          {`AI features are available from age ${MIN_AI_AGE}. Everything else in Famara works without them.`}
        </Text>
      )}
      <SettingsRow
        label="How Famara uses AI"
        icon="info.circle"
        onPress={() => router.push('/about/ai-use')}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: space.md, paddingVertical: space.md },
});
