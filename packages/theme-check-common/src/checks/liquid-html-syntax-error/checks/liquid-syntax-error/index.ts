import {
  Severity,
  SourceCodeType,
  type LiquidCheckDefinition,
  type LiquidHtmlNode,
} from '../../../../types';
import type { LiquidRawTag, LiquidTag, LiquidVariableOutput } from './parser-compat';
import { checkAssignTag } from './assign';
import { checkBaseTag } from './base';
import { checkBranchTag, checkMisplacedElsifTag } from './branch';
import { checkCaptureTag } from './capture';
import { checkCaseTag } from './case';
import { checkCommentRawTag, checkCommentSourceStructure, checkCommentTag } from './comment';
import { checkContentForTag } from './content-for';
import { checkCycleTag } from './cycle';
import { checkDecrementTag } from './decrement';
import { checkDocParserError, checkDocSourceStructure, checkDocTag } from './doc';
import { checkEchoTag } from './echo';
import { checkFormTag } from './form';
import { checkForTag } from './for';
import { checkIfTag } from './if';
import { checkIncludeTag } from './include';
import { checkIncrementTag } from './increment';
import { checkInlineCommentTag } from './inline_comment';
import {
  checkJavascriptParserError,
  checkJavascriptSourceStructure,
  checkJavascriptTag,
} from './javascript';
import { checkLayoutTag } from './layout';
import { checkPaginateTag } from './paginate';
import { checkRawParserError, checkRawSourceStructure, checkRawTag } from './raw';
import { checkRenderTag } from './render';
import { checkSchemaSourceStructure, checkSchemaTag } from './schema';
import { checkSectionsTag } from './sections';
import { checkSectionTag } from './section';
import { checkStyleTag } from './style';
import { checkStylesheetTag } from './stylesheet';
import { checkTablerowTag } from './tablerow';
import { checkUnlessTag } from './unless';
import { checkVariableOutput } from './variable';

export type Context = Parameters<LiquidCheckDefinition['create']>[0];

type TagChecker = (node: LiquidTag, context: Context) => void;
type RawTagChecker = (node: LiquidRawTag, context: Context) => void;

const noop = (_n: LiquidTag, _c: Context) => {};

const tagCheckers: Record<string, TagChecker> = {
  '#': checkInlineCommentTag,
  assign: checkAssignTag,
  break: noop,
  capture: checkCaptureTag,
  case: checkCaseTag,
  continue: noop,
  content_for: checkContentForTag,
  cycle: checkCycleTag,
  decrement: checkDecrementTag,
  echo: checkEchoTag,
  form: checkFormTag,
  for: checkForTag,
  tablerow: checkTablerowTag,
  if: checkIfTag,
  ifchanged: noop,
  include: checkIncludeTag,
  increment: checkIncrementTag,
  layout: checkLayoutTag,
  paginate: checkPaginateTag,
  render: checkRenderTag,
  section: checkSectionTag,
  sections: checkSectionsTag,
  unless: checkUnlessTag,
};

const misplacedTagCheckers: Record<string, TagChecker> = {
  // Branch keywords reach this path only when they are out of context.
  elsif: checkMisplacedElsifTag,
};

const rawTagCheckers: Record<string, RawTagChecker> = {
  comment: checkCommentRawTag,
  doc: checkDocTag,
  javascript: checkJavascriptTag,
  schema: checkSchemaTag,
  style: checkStyleTag,
  stylesheet: checkStylesheetTag,
  raw: checkRawTag,
};

const COMMENT_SOURCE_STRUCTURE_TAGS = new Set(['comment', 'endcomment', 'raw', 'endraw']);
const JAVASCRIPT_SOURCE_STRUCTURE_TAGS = new Set(['javascript', 'endjavascript']);
const SCHEMA_SOURCE_STRUCTURE_TAGS = new Set(['schema']);
const RAW_SOURCE_STRUCTURE_TAGS = new Set(['raw', 'endraw']);
const DOC_SOURCE_STRUCTURE_TAGS = new Set(['doc', 'enddoc']);

export const LiquidSyntaxError: LiquidCheckDefinition = {
  meta: {
    code: 'LiquidSyntaxError',
    name: 'LiquidSyntaxError',
    docs: {
      description: 'Reports Liquid syntax errors.',
      recommended: true,
    },
    type: SourceCodeType.LiquidHtml,
    severity: Severity.ERROR,
    schema: {},
    targets: [],
  },
  create(context) {
    let checkedCommentSourceStructure = false;
    let checkedJavascriptSourceStructure = false;
    let checkedSchemaSourceStructure = false;
    let checkedRawSourceStructure = false;
    let checkedDocSourceStructure = false;
    const checkCommentSourceStructureOnce = (source: string) => {
      if (checkedCommentSourceStructure) return;
      checkedCommentSourceStructure = true;
      checkCommentSourceStructure(source, context);
    };
    const checkJavascriptSourceStructureOnce = (source: string) => {
      if (checkedJavascriptSourceStructure) return;
      checkedJavascriptSourceStructure = true;
      checkJavascriptSourceStructure(source, context);
    };
    const checkSchemaSourceStructureOnce = (source: string) => {
      if (checkedSchemaSourceStructure) return;
      checkedSchemaSourceStructure = true;
      checkSchemaSourceStructure(source, context);
    };
    const checkRawSourceStructureOnce = (source: string) => {
      if (checkedRawSourceStructure) return;
      checkedRawSourceStructure = true;
      checkRawSourceStructure(source, context);
    };
    const checkDocSourceStructureOnce = (source: string) => {
      if (checkedDocSourceStructure) return;
      checkedDocSourceStructure = true;
      checkDocSourceStructure(source, context);
    };

    if (context.file.ast instanceof Error) {
      const error = context.file.ast as Error;
      return {
        async onCodePathStart(file) {
          checkCommentSourceStructureOnce(file.source);
          checkJavascriptSourceStructureOnce(file.source);
          checkSchemaSourceStructureOnce(file.source);
          checkRawSourceStructureOnce(file.source);
          checkDocSourceStructureOnce(file.source);
          checkCommentTag(error, context, file.source);
          checkDocParserError(error, context, file.source);
          checkRawParserError(error, context, file.source);
          checkJavascriptParserError(error, context, file.source);
        },
      };
    }

    return {
      async LiquidRawTag(node) {
        const rawTagCheck = rawTagCheckers[node.name];

        if (node.name === 'javascript') {
          checkJavascriptSourceStructureOnce(node.source);
        }

        if (node.name === 'schema') {
          checkSchemaSourceStructureOnce(node.source);
        }

        if (node.name === 'raw') {
          checkRawSourceStructureOnce(node.source);
        }

        if (node.name === 'doc') {
          checkDocSourceStructureOnce(node.source);
        }

        if (rawTagCheck) {
          rawTagCheck(node as LiquidRawTag, context);
        }
      },

      async LiquidTag(node) {
        if (COMMENT_SOURCE_STRUCTURE_TAGS.has(node.name)) {
          checkCommentSourceStructureOnce(node.source);
        }

        if (JAVASCRIPT_SOURCE_STRUCTURE_TAGS.has(node.name)) {
          checkJavascriptSourceStructureOnce(node.source);
        }

        if (SCHEMA_SOURCE_STRUCTURE_TAGS.has(node.name)) {
          checkSchemaSourceStructureOnce(node.source);
        }

        if (RAW_SOURCE_STRUCTURE_TAGS.has(node.name)) {
          checkRawSourceStructureOnce(node.source);
        }

        if (DOC_SOURCE_STRUCTURE_TAGS.has(node.name)) {
          checkDocSourceStructureOnce(node.source);
        }

        const tagCheck = tagCheckers[node.name] ?? misplacedTagCheckers[node.name];

        if (tagCheck) {
          tagCheck(node as LiquidTag, context);
          return;
        }

        checkBaseTag(node as LiquidTag, context);
      },

      async LiquidBranch(node, ancestors) {
        checkBranchTag(
          node as Parameters<typeof checkBranchTag>[0],
          context,
          ancestors as LiquidHtmlNode[],
        );
      },

      async LiquidVariableOutput(node) {
        checkVariableOutput(node as LiquidVariableOutput, context);
      },
    };
  },
};
