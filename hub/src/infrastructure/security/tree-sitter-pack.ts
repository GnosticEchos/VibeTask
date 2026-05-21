/**
 * Load @kreuzberg/tree-sitter-language-pack native bindings without the package
 * entrypoint, which mis-detects musl on Node 25+ (checks glibcVersion instead of
 * glibcVersionRuntime).
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export type TreeSitterPackBinding = {
  process: (
    content: string,
    options: { language: string; diagnostics?: boolean },
  ) => Promise<{
    diagnostics?: Array<{ severity: number; message: string }>;
  }>;
  hasLanguage: (language: string) => boolean;
  JsDiagnosticSeverity: { Error: number };
};

function isMuslLinux(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  const header = process.report?.getReport?.()?.header as
    | {
        glibcVersion?: string;
        glibcVersionRuntime?: string;
        glibcVersionCompiler?: string;
      }
    | undefined;

  if (header) {
    const glibc =
      header.glibcVersion ??
      header.glibcVersionRuntime ??
      header.glibcVersionCompiler;
    if (typeof glibc === 'string' && glibc.length > 0) {
      return false;
    }
  }

  try {
    require('node:fs').statSync('/lib64/ld-musl-x86_64.so.1');
    return true;
  } catch {
    return false;
  }
}

function resolveBindingFile(): string | null {
  const { platform, arch } = process;

  if (platform === 'darwin') {
    if (arch === 'arm64') return 'ts-pack-core-node.darwin-arm64.node';
    if (arch === 'x64') return 'ts-pack-core-node.darwin-x64.node';
    return null;
  }

  if (platform === 'win32') {
    if (arch === 'x64') return 'ts-pack-core-node.win32-x64-msvc.node';
    if (arch === 'arm64') return 'ts-pack-core-node.win32-arm64-msvc.node';
    return null;
  }

  if (platform === 'linux') {
    const musl = isMuslLinux();
    if (arch === 'x64') {
      return musl
        ? 'ts-pack-core-node.linux-x64-musl.node'
        : 'ts-pack-core-node.linux-x64-gnu.node';
    }
    if (arch === 'arm64') {
      return musl
        ? 'ts-pack-core-node.linux-arm64-musl.node'
        : 'ts-pack-core-node.linux-arm64-gnu.node';
    }
  }

  return null;
}

let cached: TreeSitterPackBinding | null | undefined;

export function getTreeSitterPack(): TreeSitterPackBinding | null {
  if (cached !== undefined) {
    return cached;
  }

  const bindingFile = resolveBindingFile();
  if (!bindingFile) {
    cached = null;
    return null;
  }

  try {
    const packRoot = path.dirname(
      require.resolve('@kreuzberg/tree-sitter-language-pack/package.json'),
    );
    const native = require(path.join(packRoot, bindingFile)) as TreeSitterPackBinding;
    cached = {
      process: native.process.bind(native),
      hasLanguage: native.hasLanguage.bind(native),
      JsDiagnosticSeverity: native.JsDiagnosticSeverity,
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
