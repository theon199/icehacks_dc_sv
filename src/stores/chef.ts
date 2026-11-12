/**
 * Chef conversations. One synced document per thread. Threads are bounded so a document stays
 * well under the server's size limit: at most 200 messages and about 150 KB of JSON each (oldest
 * messages go first), and at most 100 threads (least recently active go first).
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { newId } from '@/lib/id';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_THREADS = 100;
export const MAX_MESSAGES_PER_THREAD = 200;
export const MAX_THREAD_JSON_CHARS = 150_000;
export const MAX_MESSAGE_CHARS = 8000;
const TITLE_CHARS = 80;

export const chefMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
  at: z.string(),
  /** Catalog recipes the message refers to (re-checked for safety before display). */
  recipeIds: z.array(z.string().min(1).max(128)).max(20),
});
export type ChefMessage = z.infer<typeof chefMessageSchema>;

export const chefThreadSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(TITLE_CHARS),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(chefMessageSchema).max(MAX_MESSAGES_PER_THREAD),
});
export type ChefThread = z.infer<typeof chefThreadSchema>;

type Threads = Readonly<Record<string, ChefThread>>;

function titleFrom(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ');
  return line.length > TITLE_CHARS ? `${line.slice(0, TITLE_CHARS - 1)}…` : line;
}

/** Drops the oldest messages until the thread fits its message and size budgets. */
export function boundThread(thread: ChefThread): ChefThread {
  let messages =
    thread.messages.length > MAX_MESSAGES_PER_THREAD
      ? thread.messages.slice(-MAX_MESSAGES_PER_THREAD)
      : thread.messages;
  while (
    messages.length > 1 &&
    JSON.stringify({ ...thread, messages }).length > MAX_THREAD_JSON_CHARS
  ) {
    messages = messages.slice(Math.max(1, Math.ceil(messages.length / 10)));
  }
  return messages === thread.messages ? thread : { ...thread, messages };
}

/** Keeps the most recently active threads. */
export function trimThreads(threads: Threads, max: number = MAX_THREADS): Threads {
  const all = Object.values(threads);
  if (all.length <= max) return threads;
  const keep = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, max);
  return Object.fromEntries(keep.map((thread) => [thread.id, thread]));
}

export function createThread(
  threads: Threads,
  meta: { id: string; at: string; title?: string },
): Threads {
  if (threads[meta.id]) return threads;
  const thread: ChefThread = {
    id: meta.id,
    title: titleFrom(meta.title ?? ''),
    createdAt: meta.at,
    updatedAt: meta.at,
    messages: [],
  };
  return trimThreads({ ...threads, [meta.id]: thread });
}

export function appendMessage(
  threads: Threads,
  threadId: string,
  message: {
    id: string;
    role: ChefMessage['role'];
    text: string;
    at: string;
    recipeIds?: readonly string[];
  },
): Threads {
  const thread = threads[threadId];
  if (!thread || thread.messages.some((m) => m.id === message.id)) return threads;
  const parsed = chefMessageSchema.safeParse({
    ...message,
    text: message.text.slice(0, MAX_MESSAGE_CHARS),
    recipeIds: [...new Set(message.recipeIds ?? [])].slice(0, 20),
  });
  if (!parsed.success) return threads;
  const title = thread.title || (message.role === 'user' ? titleFrom(message.text) : '');
  const updatedAt = message.at > thread.updatedAt ? message.at : thread.updatedAt;
  const next = boundThread({
    ...thread,
    title,
    updatedAt,
    messages: [...thread.messages, parsed.data],
  });
  return { ...threads, [threadId]: next };
}

export function renameThread(threads: Threads, threadId: string, title: string): Threads {
  const thread = threads[threadId];
  const next = titleFrom(title);
  if (!thread || thread.title === next) return threads;
  return { ...threads, [threadId]: { ...thread, title: next } };
}

export function deleteThread(threads: Threads, threadId: string): Threads {
  if (!threads[threadId]) return threads;
  const next = { ...threads };
  delete next[threadId];
  return next;
}

export interface ChefState {
  threads: Threads;
  /** Starts a thread and returns its id. */
  startThread: (title?: string, at?: string) => string;
  append: (
    threadId: string,
    message: { role: ChefMessage['role']; text: string; recipeIds?: readonly string[] },
    at?: string,
  ) => void;
  rename: (threadId: string, title: string) => void;
  remove: (threadId: string) => void;
  reset: () => void;
}

export const useChefStore = create<ChefState>()(
  persist(
    (set, get) => {
      const commit = (next: Threads) => {
        if (next !== get().threads) set({ threads: next });
      };
      return {
        threads: {},
        startThread: (title, at = new Date().toISOString()) => {
          const id = newId();
          commit(createThread(get().threads, title == null ? { id, at } : { id, at, title }));
          return id;
        },
        append: (threadId, message, at = new Date().toISOString()) =>
          commit(appendMessage(get().threads, threadId, { ...message, id: newId(), at })),
        rename: (threadId, title) => commit(renameThread(get().threads, threadId, title)),
        remove: (threadId) => commit(deleteThread(get().threads, threadId)),
        reset: () => set({ threads: {} }),
      };
    },
    versionedPersist({
      name: 'user.chef',
      version: 1,
      schema: z.object({ threads: z.record(z.string(), chefThreadSchema) }),
      partialize: (state) => ({ threads: state.threads }),
    }),
  ),
);

/** Threads, most recently active first. */
export const selectThreadList = createSelector(
  (state: ChefState) => state.threads,
  (threads) =>
    Object.values(threads).sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    ),
);

export const selectThread = (threadId: string) => (state: ChefState) =>
  state.threads[threadId] ?? null;

export const chefSync = createCollectionAdapter({
  collection: 'chef_threads',
  store: useChefStore,
  select: (state) => state.threads,
  schema: chefThreadSchema,
  apply: (state, changes) => ({ threads: trimThreads(applyToRecord(state.threads, changes)) }),
});
