/** React Query keys for the profile feature, all under `['profile', …]`. */
export const profileKeys = {
  all: ['profile'] as const,
  me: (userId: string) => ['profile', 'me', userId] as const,
  stats: (userId: string, day: string) => ['profile', 'stats', userId, day] as const,
  statsAll: (userId: string) => ['profile', 'stats', userId] as const,
  badges: () => ['profile', 'badges'] as const,
  posts: (userId: string) => ['profile', 'posts', userId] as const,
  follows: (userId: string) => ['profile', 'follows', userId] as const,
  suggestions: (userId: string) => ['profile', 'suggestions', userId] as const,
  invites: (userId: string) => ['profile', 'invites', userId] as const,
  cuisines: () => ['profile', 'cuisines'] as const,
};
