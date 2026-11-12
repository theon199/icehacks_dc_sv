import { useAiConsentSync } from './aiConsent';
import { useLegacySettingsMigration } from './legacySettings';

/**
 * The Settings work that must happen at launch rather than when Settings is opened: the AI consent
 * answer on the account is reconciled with this device as soon as someone is signed in (so a
 * withdrawal made elsewhere closes AI here), and answers an earlier build kept to itself are moved
 * into the shared stores. Meant to be mounted once near the root; mounting it again elsewhere is
 * harmless.
 */
export function useSettingsLaunchSync(): void {
  useAiConsentSync();
  useLegacySettingsMigration();
}
