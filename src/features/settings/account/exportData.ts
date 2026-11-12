/**
 * "Export my data": gathers the server copy and this device's copy of the account's data into one
 * JSON file and opens the share sheet so the person can save or send it.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { describeError, logger } from '@/lib/logger';

import { collectLocalData } from '../deps';
import { AccountError, fetchServerExport } from './accountApi';

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportBundle {
  app: 'famara';
  format_version: number;
  exported_at: string;
  server: Record<string, unknown>;
  device: Record<string, unknown>;
}

export function buildExportBundle(
  server: Record<string, unknown>,
  device: Record<string, unknown>,
  now: Date,
): ExportBundle {
  return {
    app: 'famara',
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: now.toISOString(),
    server,
    device,
  };
}

/** `famara-data-2026-11-11.json` */
export function exportFileName(now: Date): string {
  return `famara-data-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Builds the export, writes it to the cache directory and opens the share sheet. Resolves once the
 * sheet closes, after the file has been deleted again.
 */
export async function exportMyData(now: Date = new Date()): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new AccountError('sharing_unavailable', 'Sharing is not available on this device.');
  }
  const [server, device] = await Promise.all([fetchServerExport(), collectLocalData()]);
  const bundle = buildExportBundle(server, device, now);
  const file = new File(Paths.cache, exportFileName(now));
  file.create({ overwrite: true });
  file.write(JSON.stringify(bundle, null, 2));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export your Famara data',
    });
  } finally {
    discard(file);
  }
}

/** The export holds the Keychain-protected personal details, so it must not outlive the share. */
function discard(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    logger.warn('Could not remove the export file', describeError(error));
  }
}
