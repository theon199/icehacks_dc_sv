// Make it healthier: AI recipe makeovers saved as personal variants.
export { MakeoverScreen, type MakeoverScreenProps } from './screens/MakeoverScreen';
export { useRemoveVariant, useVariantGroups } from './deps';
export {
  findVariant,
  type RecipeVariant,
  type VariantGroup,
  type VariantGroups,
  type VariantSwap,
} from './logic/variants';
export { findAllergenMentions, type AllergenHit } from './logic/allergenCheck';
