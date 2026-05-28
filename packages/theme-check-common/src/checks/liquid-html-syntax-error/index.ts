import { Severity, SourceCodeType, LiquidCheckDefinition, Problem, Context } from '../../types';
import { getOffset, getPosition, isError } from '../../utils';
import { detectMultipleAssignValues } from './checks/MultipleAssignValues';
import { detectInvalidBooleanExpressions } from './checks/InvalidBooleanExpressions';
import { detectInvalidEchoValue } from './checks/InvalidEchoValue';
import { detectInvalidConditionalNode } from './checks/InvalidConditionalNode';
import { detectInvalidLoopRange } from './checks/InvalidLoopRange';
import { detectInvalidLoopArguments } from './checks/InvalidLoopArguments';
import { detectConditionalNodeUnsupportedParenthesis } from './checks/InvalidConditionalNodeParenthesis';
import { detectInvalidFilterName } from './checks/InvalidFilterName';
import { detectInvalidPipeSyntax } from './checks/InvalidPipeSyntax';
import { LiquidSyntaxError } from './checks/liquid-syntax-error';
import { isWithinRawTagThatDoesNotParseItsContents } from '../utils';

type LineColPosition = {
  line: number;
  column: number;
};

type LiquidHtmlProblem = Problem<SourceCodeType.LiquidHtml>;
type LiquidHtmlContext = Context<SourceCodeType.LiquidHtml>;

function isParsingErrorWithLocation(
  error: Error,
): error is Error & { loc: { start: LineColPosition; end: LineColPosition } } {
  return 'name' in error && error.name === 'LiquidHTMLParsingError' && 'loc' in error;
}

function cleanErrorMessage(message: string, highlight: string): string {
  return message
    .replace(/Line \d+, col \d+:\s+/, 'SyntaxError: ')
    .replace(/(?!<expected ".+",) not .*/, ` not "${highlight}"`);
}

function diagnosticLine(source: string, problem: LiquidHtmlProblem): number {
  const start = getPosition(source, problem.startIndex);
  return start.line;
}

function reportProblem(
  context: LiquidHtmlContext,
  reportedProblemLines: Set<number>,
  problem: LiquidHtmlProblem,
) {
  reportedProblemLines.add(diagnosticLine(context.file.source, problem));
  context.report(problem);
}

function contextWithDedupedReports(
  context: LiquidHtmlContext,
  reportedProblemLines: Set<number>,
): LiquidHtmlContext {
  return {
    ...context,
    report(problem) {
      if (isExistingConditionalParserResponsibility(problem)) return;

      const line = diagnosticLine(context.file.source, problem);
      if (reportedProblemLines.has(line)) return;

      reportedProblemLines.add(line);
      context.report(problem);
    },
  };
}

function isExistingConditionalParserResponsibility(problem: LiquidHtmlProblem): boolean {
  return /^Syntax error in '(if|unless|elsif)' tag$/.test(problem.message);
}

function hasBooleanExpressionMarkup(node: { markup: unknown }): boolean {
  return (
    typeof node.markup === 'object' &&
    node.markup !== null &&
    'expression' in node.markup &&
    (node.markup as { expression?: { type?: string } }).expression?.type === 'BooleanExpression'
  );
}

function withLiquidSyntaxCompatNode<
  Node extends { type: string; source: string; position: LineRange },
>(node: Node): Node & { markupPosition: LineRange } {
  if ('markupPosition' in node) return node as Node & { markupPosition: LineRange };

  const compatNode = {
    ...node,
    position: liquidBlockStatementPosition(node) ?? node.position,
    markupPosition:
      node.type === 'LiquidVariableOutput'
        ? variableOutputMarkupPosition(node)
        : liquidTagMarkupPosition(node),
  };

  return compatNode;
}

function variableOutputMarkupPosition(node: { source: string; position: LineRange }): LineRange {
  const { source, position } = node;
  const openLength = source.startsWith('{{-', position.start) ? 3 : 2;
  const closeLength = source.slice(position.end - 3, position.end) === '-}}' ? 3 : 2;

  return {
    start: position.start + openLength,
    end: position.end - closeLength,
  };
}

function liquidTagMarkupPosition(node: {
  source: string;
  name?: string | null;
  position: LineRange;
  blockStartPosition?: LineRange;
}): LineRange {
  const { source } = node;
  const position = node.blockStartPosition ?? node.position;
  const hasLiquidTagDelimiters = source.startsWith('{%', position.start);
  const openLength = hasLiquidTagDelimiters
    ? source.startsWith('{%-', position.start)
      ? 3
      : 2
    : 0;
  const closeLength = hasLiquidTagDelimiters
    ? source.slice(position.end - 3, position.end) === '-%}'
      ? 3
      : 2
    : 0;
  const contentStart = position.start + openLength;
  const contentEnd = position.end - closeLength;
  const content = source.slice(contentStart, contentEnd);

  if (!node.name) {
    return { start: contentStart, end: contentEnd };
  }

  const tagNameMatch = content.match(tagNamePattern(node.name));
  return {
    start: contentStart + (tagNameMatch?.[0].length ?? 0),
    end: contentEnd,
  };
}

function liquidBlockStatementPosition(node: {
  type: string;
  source: string;
  blockStartPosition?: LineRange;
}): LineRange | undefined {
  if (node.type !== 'LiquidTag' || !node.blockStartPosition) return;
  if (node.source.startsWith('{%', node.blockStartPosition.start)) return;

  return node.blockStartPosition;
}

function tagNamePattern(name: string): RegExp {
  const boundary = /\w$/.test(name) ? '\\b' : '';
  return new RegExp(`^\\s*${escapeRegExp(name)}${boundary}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type LineRange = {
  start: number;
  end: number;
};

export const LiquidHTMLSyntaxError: LiquidCheckDefinition = {
  meta: {
    code: 'LiquidHTMLSyntaxError',
    aliases: ['SyntaxError', 'HtmlParsingError'],
    name: 'Prevent LiquidHTML Syntax Errors',
    docs: {
      description: 'This check exists to inform the user of Liquid HTML syntax errors.',
      recommended: true,
    },
    type: SourceCodeType.LiquidHtml,
    severity: Severity.ERROR,
    schema: {},
    targets: [],
  },

  create(context) {
    const ast = context.file.ast;
    const filtersPromise = context.themeDocset?.filters();
    const tagsPromise = context.themeDocset?.tags();
    const reportedProblemLines = new Set<number>();
    const liquidSyntaxVisitors = LiquidSyntaxError.create(
      contextWithDedupedReports(context, reportedProblemLines),
    ) as Record<string, Function | undefined>;

    if (!isError(ast)) {
      return {
        async BooleanExpression(node, ancestors) {
          if (isWithinRawTagThatDoesNotParseItsContents(ancestors)) return;

          const problem = detectInvalidBooleanExpressions(node, ancestors);

          if (!problem) {
            return;
          }

          reportProblem(context, reportedProblemLines, problem);
        },
        async LiquidTag(node, ancestors) {
          if (isWithinRawTagThatDoesNotParseItsContents(ancestors)) return;

          const problems = [
            detectMultipleAssignValues(node),
            detectInvalidEchoValue(node),
            detectInvalidLoopRange(node),
            detectInvalidLoopArguments(node, await tagsPromise),
          ].filter(Boolean) as Problem<SourceCodeType.LiquidHtml>[];

          // Fixers for `detectConditionalNodeUnsupportedParenthesis` and `detectInvalidConditionalNode` consume
          // the whole node markup, so we MUST not run both.
          const conditionalNodeProblem =
            detectConditionalNodeUnsupportedParenthesis(node) || detectInvalidConditionalNode(node);

          if (conditionalNodeProblem) {
            problems.push(conditionalNodeProblem);
          }

          problems.forEach((problem) => reportProblem(context, reportedProblemLines, problem));

          const filterProblems = await detectInvalidFilterName(node, await filtersPromise);
          if (filterProblems.length > 0) {
            filterProblems.forEach((filterProblem) =>
              reportProblem(context, reportedProblemLines, filterProblem),
            );
          }

          const pipeProblems = await detectInvalidPipeSyntax(node);
          if (pipeProblems.length > 0) {
            pipeProblems.forEach((pipeProblem) =>
              reportProblem(context, reportedProblemLines, pipeProblem),
            );
          }

          await liquidSyntaxVisitors.LiquidTag?.(withLiquidSyntaxCompatNode(node), ancestors);
        },

        async LiquidBranch(node, ancestors) {
          if (isWithinRawTagThatDoesNotParseItsContents(ancestors)) return;

          const problem = detectInvalidConditionalNode(node);

          if (problem) {
            reportProblem(context, reportedProblemLines, problem);
          }

          await liquidSyntaxVisitors.LiquidBranch?.(withLiquidSyntaxCompatNode(node), ancestors);
        },

        async LiquidVariableOutput(node, ancestors) {
          if (isWithinRawTagThatDoesNotParseItsContents(ancestors)) return;

          const filterProblems = await detectInvalidFilterName(node, await filtersPromise);
          if (filterProblems.length > 0) {
            filterProblems.forEach((problem) =>
              reportProblem(context, reportedProblemLines, problem),
            );
          }

          const pipeProblems = await detectInvalidPipeSyntax(node);
          if (pipeProblems.length > 0) {
            pipeProblems.forEach((pipeProblem) =>
              reportProblem(context, reportedProblemLines, pipeProblem),
            );
          }

          const problem = detectInvalidEchoValue(node);
          if (problem) {
            reportProblem(context, reportedProblemLines, problem);
          }

          if (!hasBooleanExpressionMarkup(node)) {
            await liquidSyntaxVisitors.LiquidVariableOutput?.(
              withLiquidSyntaxCompatNode(node),
              ancestors,
            );
          }
        },

        async LiquidRawTag(node, ancestors) {
          if (isWithinRawTagThatDoesNotParseItsContents(ancestors)) return;

          await liquidSyntaxVisitors.LiquidRawTag?.(withLiquidSyntaxCompatNode(node), ancestors);
        },
      };
    }

    return {
      async onCodePathStart(file) {
        if (isParsingErrorWithLocation(ast)) {
          const { start, end } = ast.loc;
          const startIndex = getOffset(file.source, start.line, start.column);
          let endIndex = getOffset(file.source, end.line, end.column);
          if (startIndex === endIndex) endIndex += 1;
          const highlight = file.source.slice(startIndex, endIndex);
          reportProblem(context, reportedProblemLines, {
            message: cleanErrorMessage(ast.message, highlight),
            startIndex,
            endIndex: endIndex,
          });
        } else {
          reportProblem(context, reportedProblemLines, {
            message: ast.message,
            startIndex: 0,
            endIndex: file.source.length,
          });
        }

        await liquidSyntaxVisitors.onCodePathStart?.(file);
      },
    };
  },
};
