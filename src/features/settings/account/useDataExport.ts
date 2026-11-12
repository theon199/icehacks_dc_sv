import { useCallback, useState } from 'react';

import { toast } from '@/ui';

import { AccountError } from './accountApi';
import { exportMyData } from './exportData';

/** Runs the data export once at a time and reports failures as a toast. */
export function useDataExport() {
  const [exporting, setExporting] = useState(false);

  const run = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportMyData();
    } catch (error) {
      toast.show({
        message:
          error instanceof AccountError ? error.message : 'Could not export your data. Try again.',
        tone: 'danger',
      });
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return { exporting, run };
}
