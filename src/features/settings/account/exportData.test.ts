import * as Sharing from 'expo-sharing';

import { useSessionStore } from '@/features/auth';

import { resetSettingsDepsForTests, updatePreferences } from '../deps';
import { AccountError } from './accountApi';
import { buildExportBundle, exportFileName, exportMyData } from './exportData';

interface MockFile {
  name: string;
  content: string | null;
  created: boolean;
  deleted: boolean;
}
const mockFiles: MockFile[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    record: MockFile;
    constructor(_dir: unknown, name: string) {
      this.record = { name, content: null, created: false, deleted: false };
      mockFiles.push(this.record);
    }
    get uri() {
      return `file:///cache/${this.record.name}`;
    }
    create() {
      this.record.created = true;
    }
    write(content: string) {
      this.record.content = content;
    }
    get exists() {
      return this.record.created && !this.record.deleted;
    }
    delete() {
      this.record.deleted = true;
    }
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));

const now = new Date('2026-11-11T10:00:00Z');

beforeEach(() => {
  mockFiles.length = 0;
  resetSettingsDepsForTests();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
});

describe('exportMyData', () => {
  it('writes the server and device copies to one JSON file and shares it', async () => {
    mockRpc.mockResolvedValue({
      data: { format_version: 1, profile: { handle: 'cook_ab12' } },
      error: null,
    });
    updatePreferences({ allergens: ['sesame'], units: 'metric' });

    await exportMyData(now);

    expect(mockRpc).toHaveBeenCalledWith('export_my_data');
    const file = mockFiles[0];
    expect(file).toMatchObject({ name: 'famara-data-2026-11-11.json', created: true });
    const bundle = JSON.parse(file?.content ?? '{}') as Record<string, unknown>;
    expect(bundle).toMatchObject({
      app: 'famara',
      exported_at: '2026-11-11T10:00:00.000Z',
      server: { profile: { handle: 'cook_ab12' } },
      device: {
        preferences: expect.objectContaining({ allergens: ['sesame'], units: 'metric' }),
        personalDetails: expect.objectContaining({ heightCm: null }),
      },
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/famara-data-2026-11-11.json',
      expect.objectContaining({ mimeType: 'application/json', UTI: 'public.json' }),
    );
  });

  it('deletes the file once the share sheet closes, even if sharing fails', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await exportMyData(now);
    expect(mockFiles[0]?.deleted).toBe(true);

    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('dismissed'));
    await expect(exportMyData(now)).rejects.toThrow('dismissed');
    expect(mockFiles[1]?.deleted).toBe(true);
  });

  it('fails with a readable message when the server export fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT401', message: 'nope' } });
    await expect(exportMyData(now)).rejects.toThrow(AccountError);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(mockFiles).toHaveLength(0);
  });

  it('stops early when the device cannot share files', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(exportMyData(now)).rejects.toMatchObject({ code: 'sharing_unavailable' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('export helpers', () => {
  it('names the file after the export date', () => {
    expect(exportFileName(now)).toBe('famara-data-2026-11-11.json');
  });

  it('labels the bundle with its format version', () => {
    expect(buildExportBundle({}, {}, now)).toMatchObject({ app: 'famara', format_version: 1 });
  });
});
