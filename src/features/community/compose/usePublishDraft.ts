/**
 * Publishing a draft: validate, upload photos with progress, call the publish function, refresh
 * the feeds. Uploaded photos are remembered while the screen is open, so retrying after a network
 * or server hiccup does not upload them again. When the server rejects the post itself (400/409,
 * e.g. a photo it can no longer use), the remembered uploads are dropped and the next attempt
 * uploads fresh copies.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { isApiError } from '@/lib/api/errors';

import type { PublishedPost } from '../api/schemas';
import { publishPost, type PublishMediaInput } from '../deps';
import { blurhashFor, preparePhoto, uploadPhoto } from './photoUpload';
import { communityKeys, useViewer } from '../hooks/queryKeys';
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

/**
 * Whether a failed publish means the uploaded photos should not be sent again. The publish
 * function reports SQL reasons only inside its error details, which the API client does not
 * surface, so this goes by status: any rejection of the request itself starts the photos over.
 */
export function shouldReuploadAfter(error: unknown): boolean {
  return isApiError(error) && (error.status === 400 || error.status === 409);
}

export function usePublishDraft(userId: string | null) {
  const client = useQueryClient();
  const viewer = useViewer();
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
        let post: PublishedPost;
        try {
          post = await publishPost(buildPublishInput(draft, media));
        } catch (error) {
          if (shouldReuploadAfter(error)) uploaded.current.clear();
          throw error;
        }
        uploaded.current.clear();
        await Promise.all([
          client.invalidateQueries({ queryKey: communityKeys.feeds(viewer) }),
          client.invalidateQueries({ queryKey: communityKeys.profile(viewer, userId) }),
          draft.parentPostId
            ? client.invalidateQueries({
                queryKey: communityKeys.remixes(viewer, draft.parentPostId),
              })
            : Promise.resolve(),
        ]);
        return { kind: 'published', post };
      } finally {
        setPhase('idle');
        setProgress(0);
      }
    },
    [client, uploadAll, userId, viewer],
  );

  return { publish, phase, progress, busy: phase !== 'idle' };
}
