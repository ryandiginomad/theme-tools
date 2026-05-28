import type { LiquidTag } from './parser-compat';
import { builtinTags } from './builtin-tags';
import type { Context } from '.';

const KNOWN_LIQUID_TAGS = new Set(['#', ...Object.keys(builtinTags)]);

export function checkBaseTag(node: LiquidTag, context: Context): void {
  if ('reason' in node && typeof node.reason === 'string') {
    context.report({
      message: node.reason,
      startIndex: node.position.start,
      endIndex: node.position.end,
    });
    return;
  }

  if (isUnknownTagInsideLiquidBlock(node)) {
    context.report({
      message: `Unknown tag '${node.name}'`,
      startIndex: node.position.start,
      endIndex: node.position.end,
    });
  }
}

function isUnknownTagInsideLiquidBlock(node: LiquidTag): boolean {
  // Statements inside `{% liquid %}` do not have their own `{%` delimiter.
  return !node.source.startsWith('{%', node.position.start) && !KNOWN_LIQUID_TAGS.has(node.name);
}
