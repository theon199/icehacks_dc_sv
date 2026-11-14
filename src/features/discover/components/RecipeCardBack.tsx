import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { memo, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { DeckCard } from '@/domain';
import { useIngredients } from '@/lib/catalog';
import { selectPantryIngredientIds, usePantryStore } from '@/stores';
import {
  GlassControl,
  GlassIconButton,
  GlassSurface,
  HEADER_CONTROL_SIZE,
  hasLiquidGlass,
  Icon,
  Text,
  useTheme,
} from '@/ui';
import { fontFamily, radii, space } from '@/ui/tokens';

import { cardOverlay } from './cardOverlay';
import { backIngredients, cardStats, matchText } from '../cardText';

export interface RecipeCardBackProps {
  card: DeckCard;
  /** Turns the card back to its face. */
  onClose: () => void;
  onOpen: () => void;
}

/** Strength of the frost the back is laid on; the photo stays underneath it. */
const FROST_INTENSITY = 70;
/** Height of the lime "Open recipe" action. */
const OPEN_HEIGHT = 52;

/**
 * The back of a Discover card, shown after a tap: the same photo under a heavy dark frost, with the
 * recipe's summary, one pill carrying the match and figures, why it fits this person, its core
 * ingredients (marked where the pantry holds them) and the lime action that opens the recipe.
 * The name is not repeated; the face just showed it. A tap on the frost, or the close circle, turns
 * the card back.
 */
export const RecipeCardBack = memo(function RecipeCardBack({
  card,
  onClose,
  onOpen,
}: RecipeCardBackProps) {
  const theme = useTheme();
  const { recipe } = card;
  const stats = cardStats(card);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.primary }]}
      testID="discover-card-back"
    >
      {recipe.imageUrl ? (
        <Image
          source={{ uri: recipe.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={recipe.id}
          accessible={false}
        />
      ) : null}
      <BlurView intensity={FROST_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: cardOverlay.frost }]} />
      {/* The frost itself turns the card back; the close circle is the labelled target for it. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content} pointerEvents="box-none">
        {recipe.summary ? (
          <Text
            variant="subhead"
            numberOfLines={4}
            style={[styles.summary, { color: cardOverlay.textMuted }]}
          >
            {recipe.summary}
          </Text>
        ) : (
          <View style={styles.summarySpace} />
        )}

        <Panel radius={radii.lg} style={styles.statPill}>
          <Text
            variant="label"
            align="center"
            style={[styles.statText, { color: cardOverlay.text }]}
          >
            <Text variant="label" color="highlight" style={styles.bold}>
              {matchText(card)}
            </Text>
            {stats.map((stat) => (
              <Text key={stat} variant="label" style={[styles.bold, { color: cardOverlay.text }]}>
                <Text variant="label" style={{ color: cardOverlay.textMuted }}>
                  {' · '}
                </Text>
                {stat}
              </Text>
            ))}
          </Text>
        </Panel>

        {card.reasons.length > 0 ? (
          <Panel radius={radii.tile} style={styles.panel} testID="discover-card-reasons">
            <Text variant="headline" style={[styles.bold, { color: cardOverlay.text }]}>
              Why it fits
            </Text>
            <View style={styles.reasons}>
              {card.reasons.map((reason) => (
                <View key={reason.code} style={styles.reason}>
                  <Icon
                    name="checkmark.circle.fill"
                    android="check_circle"
                    size={16}
                    color="highlight"
                  />
                  <Text variant="subhead" style={[styles.flex, { color: cardOverlay.text }]}>
                    {reason.text}
                  </Text>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        <IngredientsPanel card={card} />

        <View style={styles.spacer} pointerEvents="none" />

        <GlassControl
          radius={OPEN_HEIGHT / 2}
          onPress={onOpen}
          accessibilityLabel={`Open recipe for ${recipe.title}`}
          tint={theme.colors.highlight}
          fallbackColor="highlight"
          style={styles.open}
          testID="discover-card-open"
        >
          <Icon name="fork.knife" android="restaurant" size={17} color="onHighlight" />
          <Text variant="headline" color="onHighlight" style={styles.bold} accessible={false}>
            Open recipe
          </Text>
        </GlassControl>
      </View>

      <GlassIconButton
        icon="xmark"
        accessibilityLabel={`Close ${recipe.title} details`}
        onPress={onClose}
        scheme="dark"
        tint={cardOverlay.panel}
        iconColor="onImage"
        style={styles.close}
        testID="discover-card-close"
      />
    </View>
  );
});

function IngredientsPanel({ card }: { card: DeckCard }) {
  const theme = useTheme();
  const ids = card.recipe.coreIngredientIds;
  const query = useIngredients(ids);
  const pantry = usePantryStore(selectPantryIngredientIds);
  const { items, coverage } = backIngredients(ids, query.data ?? [], pantry);
  if (items.length === 0) return null;
  return (
    <Panel radius={radii.tile} style={[styles.panel, styles.ingredients]}>
      <View style={styles.ingredientHeader}>
        <Text variant="headline" style={[styles.bold, { color: cardOverlay.text }]}>
          Ingredients
        </Text>
        {coverage ? (
          <Text variant="caption" style={{ color: cardOverlay.textMuted }}>
            {coverage}
          </Text>
        ) : null}
      </View>
      <ScrollView
        style={styles.ingredientScroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <View
            key={item.id}
            style={styles.ingredient}
            accessible
            accessibilityLabel={item.onHand ? `${item.name}, in your pantry` : item.name}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: item.onHand ? theme.colors.highlight : cardOverlay.dot },
              ]}
            />
            <Text
              variant="subhead"
              numberOfLines={2}
              style={[styles.shrink, { color: cardOverlay.text }]}
              accessible={false}
            >
              {item.name}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Panel>
  );
}

/** A clear dark glass panel on the frost; a translucent fill where glass is unavailable. */
function Panel({
  radius,
  style,
  testID,
  children,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  const edge = { borderRadius: radius, borderColor: cardOverlay.panelEdge };
  if (hasLiquidGlass()) {
    return (
      <GlassSurface
        radius={radius}
        tint={cardOverlay.panel}
        scheme="dark"
        glassStyle="clear"
        style={[styles.edge, edge, style]}
        {...(testID === undefined ? {} : { testID })}
      >
        {children}
      </GlassSurface>
    );
  }
  return (
    <View
      style={[styles.edge, edge, { backgroundColor: cardOverlay.panelFallback }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radii.card, overflow: 'hidden' },
  content: {
    flex: 1,
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
    paddingBottom: 14,
  },
  summary: { paddingRight: HEADER_CONTROL_SIZE },
  summarySpace: { height: HEADER_CONTROL_SIZE - space.xl + space.md },
  statPill: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 14 },
  statText: { lineHeight: 22 },
  bold: { fontFamily: fontFamily.textBold },
  panel: { marginTop: space.md, padding: 14 },
  reasons: { marginTop: space.sm, gap: 6 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  ingredients: { flexShrink: 1 },
  ingredientHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: 10,
  },
  ingredientScroll: { flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 7 },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 0,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  edge: { borderWidth: StyleSheet.hairlineWidth },
  spacer: { flex: 1, minHeight: space.md },
  open: {
    minHeight: OPEN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  close: { position: 'absolute', top: space.md, right: space.md },
});
