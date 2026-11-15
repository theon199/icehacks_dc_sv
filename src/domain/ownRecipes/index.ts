// Safety and pantry fit for recipes a person brings in themselves.
export {
  checkOwnRecipe,
  confirmationCovers,
  confirmIngredient,
  ingredientIssues,
  ingredientKey,
  isClearedForSuggestions,
  pruneConfirmations,
  unconfirmIngredient,
  type CatalogFacts,
  type IngredientCheck,
  type IngredientConfirmation,
  type IngredientIssue,
  type IngredientIssueCode,
  type IngredientVerdict,
  type OwnIngredient,
  type OwnRecipeCheckInput,
  type OwnRecipeSafety,
  type OwnRecipeStatus,
} from './check';
export {
  pantryCoverage,
  sectionOf,
  type LineStock,
  type OwnRecipeSection,
  type PantryCoverage,
  type PantryEntry,
} from './coverage';
export { ADVISORY_WORDS, ALLERGEN_HINTS, DIET_HINTS } from './hints';
export { isNonFoodWord } from './nonFoodWords';
export {
  isPlausibleMatch,
  lookupPhrases,
  matchIngredient,
  matchIngredients,
  type MatchableIngredient,
} from './match';
export { foodWords, hasSymbols, nameKey, singular, tokenize } from './words';
