import type { SnapFlash } from './CaptureControls';
import { SweepOverlay } from './SweepOverlay';
import { SweepSheet } from './SweepSheet';
import type { SweepView } from '../capture/sweepRun';
import type { useSweepSession } from '../hooks/useSweepSession';

export interface SweepStageProps {
  view: SweepView;
  session: ReturnType<typeof useSweepSession>;
  cameraHeight: number;
  /** Where the sheet's rounded top starts, overlapping the foot of the camera. */
  sheetTop: number;
  /** Null hides the flash control (front camera, or no live preview). */
  flash: SnapFlash | null;
  onFlash: (flash: SnapFlash) => void;
}

/** A sweep in progress: the camera's controls on top and the live list below it. */
export function SweepStage({
  view,
  session,
  cameraHeight,
  sheetTop,
  flash,
  onFlash,
}: SweepStageProps) {
  return (
    <>
      <SweepOverlay
        filming={view.status === 'filming'}
        cameraHeight={cameraHeight}
        filmedMs={view.filmedMs}
        filmingSince={view.filmingSince}
        flash={flash}
        onFlash={onFlash}
        onClose={session.discard}
        onStop={session.stop}
      />
      <SweepSheet
        view={view}
        top={sheetTop}
        micStatus={session.micStatus}
        transcript={session.transcript}
        onSendWords={session.sendWords}
        onMic={session.onMic}
        onFilmMore={session.filmMore}
        onDone={session.finish}
      />
    </>
  );
}
