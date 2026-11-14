import { PhotoBackdrop } from './PhotoBackdrop';
import { SnapPill } from './SnapPill';
import { StatusCard } from './StatusCard';

export interface SnapIssueProps {
  photoUri: string;
  title: string;
  message: string;
  /** Try the same photo again. */
  onRetry?: (() => void) | undefined;
  /** Back to the camera for another photo. */
  onRetake?: (() => void) | undefined;
  /** Leave without retrying (e.g. the daily limit is reached). */
  onDismiss: () => void;
}

/** Why a snap did not work, in a card over the dimmed photo, with what can be done next. */
export function SnapIssue({
  photoUri,
  title,
  message,
  onRetry,
  onRetake,
  onDismiss,
}: SnapIssueProps) {
  return (
    <PhotoBackdrop photoUri={photoUri} onClose={onDismiss} testID="snap-issue">
      <StatusCard
        title={title}
        message={message}
        actions={
          <>
            {onRetake ? (
              <SnapPill
                label="Retake"
                tone={onRetry ? 'white' : 'lime'}
                onPress={onRetake}
                testID="snap-retake"
              />
            ) : null}
            {onRetry ? (
              <SnapPill label="Try again" tone="lime" onPress={onRetry} testID="snap-retry" />
            ) : null}
            {!onRetake && !onRetry ? (
              <SnapPill label="OK" tone="lime" onPress={onDismiss} testID="snap-dismiss" />
            ) : null}
          </>
        }
      />
    </PhotoBackdrop>
  );
}
