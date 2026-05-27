import {
  type LiquidArgument,
  type LiquidExpression,
  type LiquidFilter,
  type LiquidVariable,
  NodeTypes,
} from '@shopify/liquid-html-parser';
import { toJSONAST } from '../to-source-code';
import {
  type JSONNode,
  type LiquidHtmlNode,
  type LiteralNode,
  type PropertyNode,
  SourceCodeType,
  type Theme,
} from '../types';
import { visit } from '../visitor';

const TRANSLATION_FILTERS = new Set(['t', 'translate']);
const STATIC_STRING_FILTERS = new Set(['append', 'prepend']);

export type TranslationReferences = {
  /**
   * Storefront locale keys that are statically known to be used by Liquid.
   */
  keys: Set<string>;

  /**
   * Schema locale keys that are statically known to be used by schema t: values.
   */
  schemaKeys: Set<string>;

  /**
   * Translation key prefixes that could be used by a partially dynamic key.
   * For example, `'products.' | append: product_type | t` protects `products.*`.
   */
  prefixes: Set<string>;

  /**
   * Whether the theme contains translation filter usage that cannot be resolved
   * to either a key or a static prefix.
   */
  hasDynamicReferences: boolean;
};

type ResolvedTranslationKey =
  | { type: 'key'; value: string }
  | { type: 'prefix'; value: string }
  | { type: 'dynamic' };

export function findTranslationReferences(theme: Theme): TranslationReferences {
  const references: TranslationReferences = {
    keys: new Set(),
    schemaKeys: new Set(),
    prefixes: new Set(),
    hasDynamicReferences: false,
  };

  for (const file of theme) {
    if (file.type !== SourceCodeType.LiquidHtml || file.ast instanceof Error) continue;

    collectLiquidTranslationReferences(file.ast, references);
    collectSchemaTranslationReferences(file.ast, references);
  }

  return references;
}

function collectLiquidTranslationReferences(
  ast: LiquidHtmlNode,
  references: TranslationReferences,
) {
  visit<SourceCodeType.LiquidHtml, void>(ast, {
    LiquidVariable(node) {
      const translationFilterIndex = node.filters.findIndex(({ name }) =>
        TRANSLATION_FILTERS.has(name),
      );
      if (translationFilterIndex === -1) return;

      addResolvedReference(
        references,
        resolveTranslationKey(node, node.filters.slice(0, translationFilterIndex)),
      );
    },
  });
}

function collectSchemaTranslationReferences(
  ast: LiquidHtmlNode,
  references: TranslationReferences,
) {
  visit<SourceCodeType.LiquidHtml, void>(ast, {
    LiquidRawTag(node) {
      if (node.name !== 'schema' || node.body.kind !== 'json') return;

      const jsonAst = toJSONAST(node.body.value);
      if (jsonAst instanceof Error) return;

      const schemaKeys = visit<SourceCodeType.JSON, string>(jsonAst, {
        Literal(node) {
          if (typeof node.value === 'string' && node.value.startsWith('t:')) {
            return node.value.replace(/^t:/, '');
          }
        },
      });

      schemaKeys.forEach((key) => references.schemaKeys.add(key));
    },
  });
}

function addResolvedReference(references: TranslationReferences, result: ResolvedTranslationKey) {
  switch (result.type) {
    case 'key':
      references.keys.add(result.value);
      return;

    case 'prefix':
      references.prefixes.add(result.value);
      return;

    case 'dynamic':
      references.hasDynamicReferences = true;
      return;
  }
}

function resolveTranslationKey(
  node: LiquidVariable,
  filtersBeforeTranslation: LiquidFilter[],
): ResolvedTranslationKey {
  let current = expressionToStaticString(node.expression);
  let safePrefix = current.dynamic ? '' : current.value;

  for (const filter of filtersBeforeTranslation) {
    if (!STATIC_STRING_FILTERS.has(filter.name)) {
      return safePrefix ? { type: 'prefix', value: safePrefix } : { type: 'dynamic' };
    }

    const arg = filter.args[0];
    const argValue = arg ? argumentToStaticString(arg) : { value: '', dynamic: true };

    if (filter.name === 'append') {
      if (!current.dynamic && !argValue.dynamic) {
        safePrefix = current.value + argValue.value;
      }

      current = {
        value: current.value + argValue.value,
        dynamic: current.dynamic || argValue.dynamic,
      };
    } else {
      if (!current.dynamic && !argValue.dynamic) {
        safePrefix = argValue.value + current.value;
      } else if (argValue.dynamic) {
        safePrefix = '';
      }

      current = {
        value: argValue.value + current.value,
        dynamic: current.dynamic || argValue.dynamic,
      };
    }
  }

  if (current.dynamic) {
    return safePrefix ? { type: 'prefix', value: safePrefix } : { type: 'dynamic' };
  }

  return { type: 'key', value: current.value };
}

function argumentToStaticString(arg: LiquidArgument) {
  if (arg.type === NodeTypes.NamedArgument) {
    return { value: '', dynamic: true };
  }

  return expressionToStaticString(arg);
}

function expressionToStaticString(expression: LiquidVariable['expression'] | LiquidExpression): {
  value: string;
  dynamic: boolean;
} {
  switch (expression.type) {
    case NodeTypes.String:
      return { value: expression.value, dynamic: false };

    case NodeTypes.Number:
      return { value: expression.value, dynamic: false };

    case NodeTypes.LiquidLiteral:
      return { value: String(expression.value ?? ''), dynamic: false };

    default:
      return { value: '', dynamic: true };
  }
}

export function isTranslationKeyUsed(
  path: string,
  references: TranslationReferences,
  isSchemaTranslationFile = false,
): boolean {
  if (isSchemaTranslationFile) {
    return references.schemaKeys.has(path);
  }

  return (
    references.keys.has(path) ||
    isPluralizationPathUsed(path, references) ||
    [...references.prefixes].some((prefix) => path.startsWith(prefix))
  );
}

const PLURALIZATION_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function isPluralizationPathUsed(path: string, references: TranslationReferences) {
  const parts = path.split('.');
  const pluralKey = parts[parts.length - 1];

  if (!pluralKey || !PLURALIZATION_KEYS.has(pluralKey)) return false;

  return references.keys.has(parts.slice(0, -1).join('.'));
}

export function jsonPath(ancestors: JSONNode[], node: JSONNode): string {
  return ancestors
    .concat(node)
    .filter((node): node is PropertyNode => node.type === 'Property')
    .map((node) => node.key.value)
    .join('.');
}

export function isTerminalTranslationNode(node: JSONNode): node is LiteralNode {
  return node.type === 'Literal';
}
