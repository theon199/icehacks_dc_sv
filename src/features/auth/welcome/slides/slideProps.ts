import type { WelcomeRecipeBook } from '../welcomeRecipes';

export interface SlideProps {
  /** On screen and motion allowed: run the slide's choreography. */
  animate: boolean;
  recipes: WelcomeRecipeBook;
}
