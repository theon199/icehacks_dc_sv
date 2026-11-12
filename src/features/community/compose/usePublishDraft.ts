/**
 * Publishing a draft: validate, upload photos with progress, call the publish function, refresh
 * the feeds. Uploaded photos are remembered for the session, so retrying after a failed publish
 * does not upload them again (unless the server says one is no longer usable).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { isApiError } from '@/lib/api/errors';

import type { PublishedPost } from '../api/schemas';
import { publishPost, type PublishMediaInput } from '../deps';
import { blurhashFor, preparePhoto, uploadPhoto } from './photoUpload';
import { communityKeys } from '../hooks/queryKeys';
import {
  buildPublishInput,
  hasErrors,
  overallProgress,
  validateDraft,
  type ComposeDraft,
  type DraftErrors,
} from '../logic/compose';

export type PublishPhase = 'idle' | 'uploading' | 'publishing';

export type PublishOutcome =
  { kind: 'invalid'; errors: DraftErrors } | { kind: 'published'; post: PublishedPost };

/** Codes after which previously uploaded photos must be uploaded again. */
const STALE_MEDIA_CODES = new Set(['media_unavailable', 'media_not_uploaded', 'media_in_use']);

export function usePublishDraft(userId: string | null) {
  const client = useQueryClient();
  const [phase, setPhase] = useState<PublishPhase>('idle');
  const [progress, setProgress] = useState(0);
  const uploaded = useRef(new Map<string, PublishMediaInput>());

  const uploadAll = useCallback(
    async (draft: ComposeDraft, owner: string): Promise<PublishMediaInput[]> => {
      const fractions: number[] = draft.photos.map((photo) =>
        uploaded.current.has(photo.uri) ? 1 : 0,
      );
      setProgress(overallProgress(fractions));
      const media: PublishMediaInput[] = [];
      // One at a time keeps memory low on older phones and makes progress easy to follow.
      for (const [index, photo] of draft.photos.entries()) {
        const done = uploaded.current.get(photo.uri);
        if (done) {
          media.push(done);
          continue;
        }
        const prepared = await preparePhoto(photo);
        const blurhash = await blurhashFor(prepared.uri);
        const path = await uploadPhoto({
          userId: owner,
          photo: prepared,
          onProgress: (fraction) => {
            fractions[index] = fraction;
            setProgress(overallProgress(fractions));
          },
        });
        const item = { path, width: prepared.width, height: prepared.height, blurhash };
        uploaded.current.set(photo.uri, item);
        media.push(item);
      }
      return media;
    },
    [],
  );

  const publish = useCallback(
    async (draft: ComposeDraft): Promise<PublishOutcome> => {
      const errors = validateDraft(draft);
      if (hasErrors(errors)) return { kind: 'invalid', errors };
      if (!userId) throw new Error('Sign in to post.');
      try {
        setPhase('uploading');
        const media = await uploadAll(draft, userId);
        setPhase('publishing');
        const post = await publishPost(buildPublishInput(draft, media));
        uploaded.current.clear();
        await Promise.all([
          client.invalidateQueries({ queryKey: communityKeys.feeds() }),
          client.invalidateQueries({ queryKey: communityKeys.profile(userId) }),
          draft.parentPostId
            ? client.invalidateQueries({ queryKey: communityKeys.remixes(draft.parentPostId) })
            : Promise.resolve(),
        ]);
        return { kind: 'published', post };
      } catch (error) {
        if (isApiError(error) && error.code && STALE_MEDIA_CODES.has(error.code)) {
          uploaded.current.clear();
        }
        throw error;
      } finally {
        setPhase('idle');
        setProgress(0);
      }
    },
    [client, uploadAll, userId],
  );

  return { publish, phase, progress, busy: phase !== 'idle' };
}
