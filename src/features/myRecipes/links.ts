/** Routes of My recipes, mounted under `src/app/(app)/my-recipes`. */
export const MY_RECIPES_HREF = '/my-recipes';
export const ADD_RECIPE_HREF = '/my-recipes/add';
export const REVIEW_RECIPE_HREF = '/my-recipes/review';

export function myRecipeHref(id: string) {
  return { pathname: '/my-recipes/[id]', params: { id } } as const;
}
