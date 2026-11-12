/** React Query keys for grocery data; ids are passed already normalised (sorted, unique). */
export const groceryKeys = {
  all: ['grocery'] as const,
  prices: (ids: readonly string[]) => ['grocery', 'prices', [...ids]] as const,
  walmartStatus: ['grocery', 'walmart', 'status'] as const,
};
