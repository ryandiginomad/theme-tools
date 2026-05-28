import type {
  LiquidBranch,
  LiquidConditionalExpression,
  LiquidExpression,
  LiquidTag,
} from './parser-compat';
import { NodeTypes } from './parser-compat';
import type { LiquidHtmlNode } from '../../../../types';
import type { Context } from '.';
import {
  conditionalHasBareArrayAccess,
  expressionsHaveBareContainsValueExpression,
  hasBareArrayAccess,
  hasInvalidBooleanComparisonRhsMarkup,
  hasInvalidBooleanComparisonRhsLookupMarkup,
  hasInvalidBooleanExpressionComparisonMarkup,
  hasInvalidBooleanExpressionLexerMarkup,
  hasInvalidBooleanExpressionLookupMarkup,
  hasInvalidBooleanExpressionTokenMarkup,
  hasInvalidComparisonRhsMarkup,
  hasInvalidConditionalLookupMarkup,
  hasInvalidLogicalOperandMarkup,
  hasInvalidStandaloneConditionalRangeMarkup,
  hasInvalidStandaloneConditionalLexerMarkup,
  hasInvalidStandaloneConditionalTokenMarkup,
  hasSkippedCharacters,
  hasSkippedPrefixCharacters,
  hasSingleTrailingConditionalToken,
  hasTrailingParsedConditionalMarkup,
  hasUnclosedQuotedString,
} from './utils';

const ELSIF_BARE_ARRAY_ACCESS = 'Bare bracket access is not allowed in strict2 mode';
const ELSIF_SYNTAX_ERROR = "Syntax error in 'elsif' tag";
const ELSIF_LIQUID_SYNTAX_ERROR = `Liquid syntax error: ${ELSIF_SYNTAX_ERROR}`;

export function checkBranchTag(
  node: LiquidBranch,
  context: Context,
  ancestors: LiquidHtmlNode[] = [],
): void {
  if (node.name === 'elsif') {
    if (nearestLiquidTagAncestor(ancestors)?.name !== 'if') {
      reportUnknownTag(node, context);
      return;
    }

    checkElsifBranch(node, context);
    return;
  }

  if (node.name === 'when') {
    checkWhenBranch(node, context);
  }
}

export function checkMisplacedElsifTag(node: LiquidTag, context: Context): void {
  context.report({
    message: `Unknown tag '${node.name}'`,
    startIndex: node.position.start,
    endIndex: node.position.end,
  });
}

function nearestLiquidTagAncestor(ancestors: LiquidHtmlNode[]): LiquidTag | undefined {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index];
    if (ancestor.type === NodeTypes.LiquidTag) {
      return ancestor as LiquidTag;
    }
  }
}

function checkWhenBranch(node: LiquidBranch, context: Context): void {
  if (typeof node.markup === 'string') {
    reportWhenSyntaxError(node, context);
    return;
  }

  const markup = node.markup as LiquidExpression[];
  const rawMarkup = node.source.slice(node.markupPosition.start, node.markupPosition.end);

  if (hasUnclosedQuotedString(rawMarkup)) {
    reportWhenSyntaxError(node, context);
    return;
  }

  if (markup.some(hasBareArrayAccess)) {
    context.report({
      message: 'Bare bracket access is not allowed',
      startIndex: node.blockStartPosition.start,
      endIndex: node.blockStartPosition.end,
    });
    return;
  }

  if (expressionsHaveBareContainsValueExpression(markup)) {
    reportWhenSyntaxError(node, context);
    return;
  }

  if (markup.length === 0) {
    return;
  }

  const parsedMarkup = node.source.slice(markup[0].position.start, node.markupPosition.end);
  if (hasSkippedCharacters(parsedMarkup)) {
    reportWhenSyntaxError(node, context);
  }
}

function reportWhenSyntaxError(node: LiquidBranch, context: Context): void {
  context.report({
    message: "Syntax error in 'when' tag",
    startIndex: node.blockStartPosition.start,
    endIndex: node.blockStartPosition.end,
  });
}

function checkElsifBranch(node: LiquidBranch, context: Context): void {
  if (typeof node.markup === 'string') {
    if (
      hasSingleTrailingConditionalToken(node.markup) ||
      hasInvalidBooleanExpressionComparisonMarkup(node.markup) ||
      hasInvalidBooleanExpressionLexerMarkup(node.markup) ||
      hasInvalidBooleanExpressionLookupMarkup(node.markup) ||
      hasInvalidBooleanExpressionTokenMarkup(node.markup) ||
      hasInvalidBooleanComparisonRhsMarkup(node.markup) ||
      hasInvalidBooleanComparisonRhsLookupMarkup(node.markup) ||
      hasInvalidComparisonRhsMarkup(node.markup) ||
      hasInvalidConditionalLookupMarkup(node.markup) ||
      hasInvalidStandaloneConditionalRangeMarkup(node.markup) ||
      hasInvalidLogicalOperandMarkup(node.markup) ||
      hasInvalidStandaloneConditionalLexerMarkup(node.markup) ||
      hasInvalidStandaloneConditionalTokenMarkup(node.markup)
    ) {
      reportLiquidSyntaxError(node, context);
    } else {
      reportSyntaxError(node, context);
    }
    return;
  }

  const markup = node.markup as LiquidConditionalExpression;
  const rawMarkup = node.source.slice(node.markupPosition.start, node.markupPosition.end);

  if (hasInvalidConditionalLookupMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanExpressionComparisonMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanExpressionLexerMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanExpressionLookupMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanExpressionTokenMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanComparisonRhsMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidBooleanComparisonRhsLookupMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidComparisonRhsMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidStandaloneConditionalRangeMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasInvalidStandaloneConditionalTokenMarkup(rawMarkup)) {
    reportLiquidSyntaxError(node, context);
    return;
  }

  if (hasUnclosedQuotedString(rawMarkup)) {
    reportSyntaxError(node, context);
    return;
  }

  if (conditionalHasBareArrayAccess(markup)) {
    context.report({
      message: ELSIF_BARE_ARRAY_ACCESS,
      startIndex: node.blockStartPosition.start,
      endIndex: node.blockStartPosition.end,
    });
    return;
  }

  if (hasSkippedPrefixCharacters(node.source, node.markupPosition.start, markup.position.start)) {
    reportSyntaxError(node, context);
    return;
  }

  const parsedMarkup = node.source.slice(markup.position.start, node.markupPosition.end);
  if (hasSkippedCharacters(parsedMarkup)) {
    if (
      hasInvalidConditionalLookupMarkup(parsedMarkup) ||
      hasInvalidBooleanExpressionComparisonMarkup(parsedMarkup) ||
      hasInvalidBooleanExpressionLexerMarkup(parsedMarkup) ||
      hasInvalidBooleanExpressionLookupMarkup(parsedMarkup) ||
      hasInvalidBooleanExpressionTokenMarkup(parsedMarkup) ||
      hasInvalidBooleanComparisonRhsMarkup(parsedMarkup) ||
      hasInvalidBooleanComparisonRhsLookupMarkup(parsedMarkup) ||
      hasInvalidComparisonRhsMarkup(parsedMarkup) ||
      hasInvalidStandaloneConditionalRangeMarkup(parsedMarkup) ||
      hasInvalidLogicalOperandMarkup(parsedMarkup) ||
      hasInvalidStandaloneConditionalLexerMarkup(parsedMarkup) ||
      hasInvalidStandaloneConditionalTokenMarkup(parsedMarkup)
    ) {
      reportLiquidSyntaxError(node, context);
    } else {
      reportSyntaxError(node, context);
    }
    return;
  }

  if (
    hasTrailingParsedConditionalMarkup(node.source, markup.position.end, node.markupPosition.end)
  ) {
    reportLiquidSyntaxError(node, context);
  }
}

function reportSyntaxError(node: LiquidBranch, context: Context): void {
  context.report({
    message: ELSIF_SYNTAX_ERROR,
    startIndex: node.blockStartPosition.start,
    endIndex: node.blockStartPosition.end,
  });
}

function reportLiquidSyntaxError(node: LiquidBranch, context: Context): void {
  context.report({
    message: ELSIF_LIQUID_SYNTAX_ERROR,
    startIndex: node.blockStartPosition.start,
    endIndex: node.blockStartPosition.end,
  });
}

function reportUnknownTag(node: LiquidBranch, context: Context): void {
  context.report({
    message: `Unknown tag '${node.name}'`,
    startIndex: node.blockStartPosition.start,
    endIndex: node.blockStartPosition.end,
  });
}
