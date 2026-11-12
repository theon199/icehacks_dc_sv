import { useCallback, useRef, useState } from 'react';

import { toast } from '@/ui';

import { AccountError } from './accountApi';
import { exportMyData } from './exportData';

/**
 * Runs the data export one at a time and reports failures as a toast. The guard is a ref rather
 * than state because two quick taps can both land before React re-renders with `exporting`.
 */
export function useDataExport() {
  const [exporting, setExporting] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
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
      running.current = false;
      setExporting(false);
    }
  }, []);

  return { exporting, run };
}
