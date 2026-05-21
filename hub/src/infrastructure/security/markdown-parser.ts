/**
 * Markdown Security Parser using Tree-Sitter
 * 
 * Validates markdown content to prevent injection attacks while
 * allowing rich code block documentation.
 * 
 * Uses tree-sitter (via tree-sitter-pack loader) for structural parsing when available.
 * 
 * Security approach:
 * - Parse markdown to extract code blocks
 * - Validate code block content for dangerous patterns (context-aware)
 * - Shell-like languages get additional execution pattern checks
 * - Generic dangerous patterns only flagged in shell contexts
 */

import { getTreeSitterPack } from './tree-sitter-pack.js';

/**
 * Forbidden patterns that indicate potential injection attempts
 * These are checked in the raw markdown content (not in code blocks)
 */
const FORBIDDEN_PATTERNS = [
  // OS-level call signatures (simplified detection)
  /\$\([^)]*\)/,  // Command substitution $(...)
  /\|\s*sh\b/,    // Pipe to shell
  /\bcurl\s+.*\|\s*sh/,  // Curl pipe to shell
  /\bwget\s+.*\|\s*sh/,  // Wget pipe to shell
  /\bsudo\s+rm/,  // Dangerous sudo commands
  /fork\s*\(\s*\)/, // Fork bomb pattern
  /:()\s*{\s*:\s*\|\s*:\s*&\s*};/, // Fork bomb
];

/**
 * Shell execution patterns - only apply within shell/bash code blocks
 */
const SHELL_EXECUTION_PATTERNS = [
  /\$\([^)]*\)/,  // Command substitution $(...)
  /`[^`]+`/,      // Backtick command substitution
  /\|\s*sh\b/,    // Pipe to shell
];

/**
 * Shell-like languages that need execution pattern checks
 */
const SHELL_LANGUAGES = ['bash', 'sh', 'shell', 'zsh', 'ash', 'dash', 'fish', 'pwsh', 'powershell', 'cmd', 'batch'];

/**
 * Parse markdown and extract structural information
 */
export interface MarkdownParseResult {
  valid: boolean;
  errors: string[];
  codeBlockCount: number;
  structure: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Process markdown content through tree-sitter parser
 */
export async function parseMarkdown(content: string): Promise<MarkdownParseResult> {
  const errors: string[] = [];
  const treeSitter = getTreeSitterPack();
  
  try {
    if (treeSitter) {
      const result = await treeSitter.process(content, { language: 'markdown', diagnostics: true });
      const errorDiagnostics = (result.diagnostics || []).filter(
        d => d.severity === treeSitter.JsDiagnosticSeverity.Error,
      );
      if (errorDiagnostics.length > 0) {
        errors.push(...errorDiagnostics.map(d => `Parse error: ${d.message}`));
      }
    }
    
    // Extract code blocks for validation
    const codeBlocks = extractCodeBlocks(content);
    
    // Validate each code block's internal structure
    for (const block of codeBlocks) {
      if (block.language && block.content) {
        const validationResult = await validateCodeBlock(block, treeSitter);
        if (!validationResult.valid) {
          errors.push(...validationResult.errors);
        }
      }
    }
    
    // Check raw content for forbidden patterns (outside of code blocks)
    // We need to exclude code block content from this check
    const blockRanges = codeBlocks.map(b => ({ start: b.startLine, end: b.endLine }));
    const contentWithoutBlocks = removeCodeBlocksFromContent(content, blockRanges);
    
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(contentWithoutBlocks)) {
        errors.push(`Content contains forbidden pattern: ${pattern.source}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      codeBlockCount: codeBlocks.length,
      structure: `markdown with ${codeBlocks.length} code blocks`,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Parse exception: ${error instanceof Error ? error.message : 'Unknown error'}`],
      codeBlockCount: 0,
      structure: '',
    };
  }
}

/**
 * Extract code blocks from markdown content using simple regex parsing
 * (more reliable than trying to extract from tree-sitter output for this use case)
 */
function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  
  // Match fenced code blocks: ```language\ncontent\n```
  const fencedRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = fencedRegex.exec(content)) !== null) {
    const [fullMatch, language, blockContent] = match;
    const startLine = content.substring(0, match.index).split('\n').length;
    const endLine = startLine + fullMatch.split('\n').length - 1;
    
    blocks.push({
      language: language || '',
      content: blockContent,
      startLine,
      endLine,
    });
  }
  
  // Also match inline code spans for informational purposes (not validated as heavily)
  // but we count them
  const inlineCodeRegex = /`[^`]+`/g;
  const inlineCount = (content.match(inlineCodeRegex) || []).length;
  
  return blocks;
}

/**
 * Remove code block content from markdown to avoid false positives on forbidden patterns
 */
function removeCodeBlocksFromContent(content: string, blockRanges: { start: number; end: number }[]): string {
  // Simple approach: remove fenced code block content
  return content.replace(/```[\s\S]*?```/g, '<code_block>');
}

/**
 * Validate a code block's internal structure
 * Uses tree-sitter to detect malformed/obfuscated content
 * 
 * Context-aware security:
 * - Shell-like languages (bash, sh, zsh) get additional execution pattern checks
 * - Other languages only get generic dangerous pattern check in shell context
 */
async function validateCodeBlock(
  block: CodeBlock,
  treeSitter: ReturnType<typeof getTreeSitterPack>,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  if (!block.language || !block.content) {
    return { valid: true, errors: [] };
  }
  
  // Normalize language to lowercase for comparison
  const lang = block.language.toLowerCase();
  
  // Determine if this is a shell-like language that needs execution pattern checks
  const isShellContext = SHELL_LANGUAGES.includes(lang);
  
  try {
    if (!treeSitter) {
      if (isShellContext) {
        for (const pattern of SHELL_EXECUTION_PATTERNS) {
          if (pattern.test(block.content)) {
            errors.push(`Shell block contains execution pattern: ${pattern.source}`);
          }
        }
      }
      return { valid: errors.length === 0, errors };
    }

    // Check if language is available
    if (!treeSitter.hasLanguage(lang)) {
      // If language is not available, we can't validate internal structure
      // Just do pattern checks
      if (isShellContext) {
        for (const pattern of SHELL_EXECUTION_PATTERNS) {
          if (pattern.test(block.content)) {
            errors.push(`Shell block contains execution pattern: ${pattern.source}`);
          }
        }
      }
      return { valid: errors.length === 0, errors };
    }
    
    // Try to parse the code block content with tree-sitter
    // This will detect obfuscated/malformed content
    const result = await treeSitter.process(block.content, { language: lang, diagnostics: true });
    
    // Check for parse errors in the code
    const errorDiagnostics = (result.diagnostics || []).filter(
      d => d.severity === treeSitter.JsDiagnosticSeverity.Error,
    );
    if (errorDiagnostics.length > 0) {
      errors.push(`Code block '${block.language}' has structural issues: ${errorDiagnostics.map(d => d.message).join(', ')}`);
    }
    
    // Context-aware security: Shell languages get execution pattern checks
    if (isShellContext) {
      for (const pattern of SHELL_EXECUTION_PATTERNS) {
        if (pattern.test(block.content)) {
          errors.push(`Shell block contains execution pattern: ${pattern.source}`);
        }
      }
      
      // Also check for dangerous patterns in shell context
      const dangerousPatterns = [
        /\beval\s*\(/i,           // eval() calls
        /\bexec\s*\(/i,          // exec() calls  
        /\bsystem\s*\(/i,       // system() calls
        /\bspawn\s*\(/i,         // spawn with shell
        /subprocess\.run.*shell\s*=\s*true/i, // subprocess with shell
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(block.content)) {
          errors.push(`Code block contains potentially dangerous pattern: ${pattern.source}`);
        }
      }
    }
  } catch (error) {
    // If tree-sitter fails to parse, it's likely malformed
    errors.push(`Failed to validate code block language '${block.language}': ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if a document type is allowed for project agents
 * 
 * Project agents (USER level): Can create SPECIFICATION, BRAINSTORM, OTHER
 * Platform agents: Can also create IMPLEMENTATION_PLAN, POST_MORTEM, CONSTITUTION
 * 
 * CONSTITUTION is strictly blocked for project agents.
 */
export function isDocTypeAllowedForAgent(docType: string, isPlatformAgent: boolean = false): boolean {
  // CONSTITUTION is only for platform-level agents
  if (docType === 'CONSTITUTION' && !isPlatformAgent) {
    return false;
  }
  
  // Project agents can create these types
  const projectAgentTypes = ['SPECIFICATION', 'BRAINSTORM', 'OTHER'];
  const platformAgentTypes = ['CONSTITUTION', 'SPECIFICATION', 'BRAINSTORM', 'POST_MORTEM', 'IMPLEMENTATION_PLAN', 'OTHER'];
  
  if (isPlatformAgent) {
    return platformAgentTypes.includes(docType);
  }
  
  return projectAgentTypes.includes(docType);
}

/**
 * Get allowed doc types for project agents vs platform agents
 */
export function getAllowedDocTypes(isPlatformAgent: boolean = false): string[] {
  if (isPlatformAgent) {
    return ['CONSTITUTION', 'SPECIFICATION', 'BRAINSTORM', 'POST_MORTEM', 'IMPLEMENTATION_PLAN', 'OTHER'];
  }
  return ['SPECIFICATION', 'BRAINSTORM', 'OTHER'];
}