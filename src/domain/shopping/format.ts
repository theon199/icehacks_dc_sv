/**
 * Display text for shopping items and the plain-text export used for sharing a list.
 */
import { formatAmount, formatQuantity, type FormatOptions } from '../units';
import { isChecked, type CheckState } from './checkoff';
import type { AisleGroup, Amount, ShoppingItem } from './types';

function amountText(a: Amount, options: FormatOptions): string {
  if (a.unit === null) return `${formatQuantity(a.quantity, options)} ${a.label ?? ''}`.trim();
  return formatAmount(a.quantity, a.unit, options);
}

/**
 * One line of text for an item: "2 onions", "1 ½ cups milk", "500 g chicken thighs + 2",
 * "salt (as needed)". Whole-item counts use the plural name above one.
 */
export function itemText(item: ShoppingItem, options: FormatOptions): string {
  const parts = item.amounts.map((a) => amountText(a, options));
  const onlyCount = item.amounts.length === 1 && item.amounts[0]?.unit === 'each';
  const many = onlyCount && (item.amounts[0]?.quantity ?? 0) > 1;
  const name = many && item.plural ? item.plural : item.name;
  let text = parts.length > 0 ? `${parts.join(' + ')} ${name}` : name;
  const notes: string[] = [];
  if (item.asNeeded) notes.push(parts.length > 0 ? 'plus extra as needed' : 'as needed');
  if (item.optional) notes.push('optional');
  if (item.pantry === 'partial') notes.push('some in pantry');
  if (notes.length > 0) text += ` (${notes.join(', ')})`;
  return text;
}

export interface ExportOptions extends FormatOptions {
  readonly title?: string | undefined;
  readonly checks?: CheckState | undefined;
  /** Include items already checked off, marked "[x]". Default false. */
  readonly includeChecked?: boolean | undefined;
}

/** Plain-text list grouped by aisle, suitable for messages and notes apps. */
export function shoppingListText(groups: readonly AisleGroup[], options: ExportOptions): string {
  const fmt: FormatOptions = {
    system: options.system,
    fractionStyle: options.fractionStyle ?? 'ascii',
  };
  const blocks: string[] = [];
  if (options.title) blocks.push(options.title);
  for (const group of groups) {
    const lines: string[] = [];
    for (const item of group.items) {
      const done = options.checks !== undefined && isChecked(options.checks, item.key);
      if (done && options.includeChecked !== true) continue;
      lines.push(`${done ? '- [x] ' : '- '}${itemText(item, fmt)}`);
    }
    if (lines.length > 0) blocks.push([group.title, ...lines].join('\n'));
  }
  return blocks.join('\n\n');
}
