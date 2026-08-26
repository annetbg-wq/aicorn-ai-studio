/**
 * CoderPromptBlockSizeDiagnostics.ts
 *
 * Safe pre-call diagnostics for coder prompt block sizes.
 *
 * Purpose: measure the char count of each coder system prompt block
 * BEFORE the LLM call to identify which blocks contribute most to payload size.
 *
 * Safety contract:
 *   - Only counts characters; never logs block content.
 *   - Never logs generated code, prompt text, or secrets.
 *   - Pure diagnostic; does NOT block generation or change behavior.
 *
 * Part of: p2/coder-skeleton-context-contract
 */

// ── Block size record ─────────────────────────────────────────────────────────

/**
 * Character counts for each named block in the coder system prompt.
 * All fields are safe to log (sizes only, no content).
 */
export interface CoderPromptBlockSizes {
  /** "You are a senior React…" header + SKELETON/COMPONENTS/HOOKS/PRIMITIVES lines */
  skeleton_header_chars: number;
  /** APPCONTEXT CONTRACT and CONTEXT CONTRACT blocks from skeleton.contextContract */
  context_contract_chars: number;
  /** All planning blocks: design, composition, functional, integration, specificity, marketBrief */
  planning_blocks_chars: number;
  /** Skeleton foundation block (installed-files statement, working groups, rules) */
  skeleton_foundation_chars: number;
  /** New skeleton contract block from buildSkeletonContractForCoder */
  skeleton_contract_chars: number;
  /** DELTA FILE TREE + file list + page list + data model + notes */
  file_plan_chars: number;
  /** OUTPUT FORMAT section */
  output_format_chars: number;
  /** IMPORT RULES section: UI primitive catalog + nav contract */
  import_rules_chars: number;
  /** RULES section: general coder behavior rules */
  rules_block_chars: number;
  /** Total system prompt character count */
  total_system_chars: number;
  /** User message character count */
  user_message_chars: number;
  /** Estimated token count (chars / 4 heuristic) */
  estimated_total_tokens: number;
}

// ── Measurement helper ────────────────────────────────────────────────────────

/**
 * Measures the character counts of coder prompt block inputs.
 * Returns a CoderPromptBlockSizes record safe for logging.
 *
 * Call before the LLM call to get pre-call block size visibility.
 * Does not modify any prompt; purely observational.
 */
export function measureCoderPromptBlockSizes(input: {
  skeletonHeader: string;
  contractBlock: string;
  planningBlocks: string;
  skeletonFoundation: string;
  skeletonContract: string;
  filePlan: string;
  outputFormat: string;
  importRules: string;
  rules: string;
  userMessage: string;
}): CoderPromptBlockSizes {
  const skeletonHeaderChars      = input.skeletonHeader.length;
  const contextContractChars     = input.contractBlock.length;
  const planningBlocksChars      = input.planningBlocks.length;
  const skeletonFoundationChars  = input.skeletonFoundation.length;
  const skeletonContractChars    = input.skeletonContract.length;
  const filePlanChars            = input.filePlan.length;
  const outputFormatChars        = input.outputFormat.length;
  const importRulesChars         = input.importRules.length;
  const rulesBlockChars          = input.rules.length;
  const userMessageChars         = input.userMessage.length;

  const totalSystemChars =
    skeletonHeaderChars +
    contextContractChars +
    planningBlocksChars +
    skeletonFoundationChars +
    skeletonContractChars +
    filePlanChars +
    outputFormatChars +
    importRulesChars +
    rulesBlockChars;

  const estimatedTotalTokens = Math.ceil((totalSystemChars + userMessageChars) / 4);

  return {
    skeleton_header_chars:     skeletonHeaderChars,
    context_contract_chars:    contextContractChars,
    planning_blocks_chars:     planningBlocksChars,
    skeleton_foundation_chars: skeletonFoundationChars,
    skeleton_contract_chars:   skeletonContractChars,
    file_plan_chars:           filePlanChars,
    output_format_chars:       outputFormatChars,
    import_rules_chars:        importRulesChars,
    rules_block_chars:         rulesBlockChars,
    total_system_chars:        totalSystemChars,
    user_message_chars:        userMessageChars,
    estimated_total_tokens:    estimatedTotalTokens,
  };
}

// ── Safe logger ───────────────────────────────────────────────────────────────

/**
 * Logs prompt block sizes as a compact structured record.
 * Safe to call unconditionally — never logs content, generated code, or secrets.
 */
export function recordCoderPromptBlockSizes(sizes: CoderPromptBlockSizes): void {
  console.log('[coder_prompt_block_sizes]', {
    skeleton_header_chars:     sizes.skeleton_header_chars,
    context_contract_chars:    sizes.context_contract_chars,
    planning_blocks_chars:     sizes.planning_blocks_chars,
    skeleton_foundation_chars: sizes.skeleton_foundation_chars,
    skeleton_contract_chars:   sizes.skeleton_contract_chars,
    file_plan_chars:           sizes.file_plan_chars,
    output_format_chars:       sizes.output_format_chars,
    import_rules_chars:        sizes.import_rules_chars,
    rules_block_chars:         sizes.rules_block_chars,
    total_system_chars:        sizes.total_system_chars,
    user_message_chars:        sizes.user_message_chars,
    estimated_total_tokens:    sizes.estimated_total_tokens,
  });
}
