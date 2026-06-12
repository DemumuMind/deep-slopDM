// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
import { readdir, stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Severity,
  Category,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

/** Create a framework-lint diagnostic */
function diag(overrides: Partial<Diagnostic> & Pick<Diagnostic, 'rule' | 'severity' | 'message' | 'filePath'>): Diagnostic {
  return {
    engine: 'framework-lint' as const,
    category: 'style',
    line: 1,
    column: 1,
    fixable: false,
    help: '',
    ...overrides,
  }
}

/** File extensions this engine scans */
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

/** Detect if project uses Next.js (from deps or config) */
async function detectNextJs(rootDir: string): Promise<boolean> {
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps['next']) return true
  } catch { /* no package.json */ }

  const configCandidates = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.cjs',
  ]
  for (const name of configCandidates) {
    if (existsSync(join(rootDir, name))) return true
  }

  return false
}

/** Detect if project uses Tailwind CSS (from deps or config) */
async function detectTailwind(rootDir: string): Promise<boolean> {
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps['tailwindcss'] || allDeps['@tailwindcss/postcss'] || allDeps['@tailwindcss/vite']) return true
  } catch { /* no package.json */ }

  const entries = await readdir(rootDir).catch(() => [] as string[])
  const twConfigs = entries.filter((e) => e.startsWith('tailwind.config'))
  if (twConfigs.length > 0) return true

  for (const name of ['postcss.config.js', 'postcss.config.mjs', 'postcss.config.cjs', 'postcss.config.ts']) {
    const fullPath = join(rootDir, name)
    try {
      const content = await readFileContent(fullPath)
      if (content.includes('tailwindcss') || content.includes('@tailwindcss')) return true
    } catch { /* skip */ }
  }

  return false
}

/** Check if App Router project (has app/ directory) */
async function isAppRouterProject(rootDir: string): Promise<boolean> {
  const appDir = join(rootDir, 'src', 'app')
  const appDirRoot = join(rootDir, 'app')
  try {
    const s = await stat(appDir)
    if (s.isDirectory()) return true
  } catch { /* no src/app */ }
  try {
    const s = await stat(appDirRoot)
    if (s.isDirectory()) return true
  } catch { /* no app */ }
  return false
}

/** Collect all scannable files */
async function collectScanFiles(rootDir: string): Promise<string[]> {
  const files: string[] = []
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage'])

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name))
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        if (SCAN_EXTENSIONS.has(ext)) {
          files.push(join(dir, entry.name))
        }
      }
    }
  }

  await walk(rootDir)
  return files
}

// ── Next.js Rules ───────────────────────────────────────

/** 1. nextjs/misplaced-use-client: Flags 'use client' on files with only server-safe code */
function checkMisplacedUseClient(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const hasUseClient = lines.some((l) => l.text.trim() === "'use client'" || l.text.trim() === '"use client"')
  if (!hasUseClient) return diagnostics

  const clientPatterns = [
    /\buseState\b/, /\buseEffect\b/, /\buseRef\b/, /\buseCallback\b/,
    /\buseMemo\b/, /\buseReducer\b/, /\buseContext\b/, /\buseLayoutEffect\b/,
    /\buseSyncExternalStore\b/, /\bonClick\b/, /\bonChange\b/, /\bonSubmit\b/,
    /\bonKeyDown\b/, /\bonMouseOver\b/, /\bonFocus\b/, /\bonBlur\b/,
    /\bonInput\b/, /\baddEventListener\b/, /\bwindow\b/, /\bdocument\b/,
    /\blocalStorage\b/, /\bsessionStorage\b/, /\bfetch\b/,
    /\bIntersectionObserver\b/, /\bResizeObserver\b/, /\bMutationObserver\b/,
  ]

  const hasClientCode = clientPatterns.some((p) => p.test(content))

  if (!hasClientCode) {
    const lineNum = lines.find((l) => l.text.trim() === "'use client'" || l.text.trim() === '"use client"')?.num ?? 1
    diagnostics.push(diag({
      rule: 'nextjs/misplaced-use-client',
      severity: 'warning',
      filePath: relPath,
      line: lineNum,
      column: 1,
      message: "'use client' directive on file with no client-side code",
      help: "Remove 'use client' — this file only contains server-safe code. Unnecessary 'use client' directives increase client bundle size.",
      category: 'architecture',
    }))
  }

  return diagnostics
}

/** 2. nextjs/missing-use-client: Flags client hooks/handlers without 'use client' */
function checkMissingUseClient(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const hasUseClient = lines.some((l) => l.text.trim() === "'use client'" || l.text.trim() === '"use client"')
  if (hasUseClient) return diagnostics

  const ext = extname(filePath)
  if (ext !== '.tsx' && ext !== '.jsx') return diagnostics

  const clientHooks = [
    { pattern: /\buseState\b/, name: 'useState' },
    { pattern: /\buseEffect\b/, name: 'useEffect' },
    { pattern: /\buseRef\b/, name: 'useRef' },
    { pattern: /\buseCallback\b/, name: 'useCallback' },
    { pattern: /\buseMemo\b/, name: 'useMemo' },
    { pattern: /\buseReducer\b/, name: 'useReducer' },
    { pattern: /\buseLayoutEffect\b/, name: 'useLayoutEffect' },
  ]

  const eventHandlers = [
    { pattern: /\bonClick\s*=/, name: 'onClick' },
    { pattern: /\bonChange\s*=/, name: 'onChange' },
    { pattern: /\bonSubmit\s*=/, name: 'onSubmit' },
    { pattern: /\bonKeyDown\s*=/, name: 'onKeyDown' },
  ]

  const foundHook = clientHooks.find((h) => h.pattern.test(content))
  const foundHandler = eventHandlers.find((h) => h.pattern.test(content))

  if (foundHook || foundHandler) {
    const foundName = foundHook?.name ?? foundHandler?.name ?? ''
    const pattern = foundHook?.pattern ?? foundHandler?.pattern
    const matchLine = pattern ? lines.find((l) => pattern.test(l.text)) : undefined
    const lineNum = matchLine?.num ?? 1

    diagnostics.push(diag({
      rule: 'nextjs/missing-use-client',
      severity: 'error',
      filePath: relPath,
      line: lineNum,
      column: 1,
      message: `${foundName} used without 'use client' directive`,
      help: "Add 'use client' at the top of this file. React hooks and event handlers require client components in Next.js App Router.",
      category: 'architecture',
      fixable: true,
      suggestion: {
        type: 'insert',
        text: "'use client'\n\n",
        range: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
        confidence: 0.9,
        reason: "Adding 'use client' at the top of the file enables React hooks and event handlers",
      },
    }))
  }

  return diagnostics
}

/** 3. nextjs/pages-router-in-app: Flags Pages Router functions in App Router projects */
function checkPagesRouterInApp(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
  isAppRouter: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!isAppRouter) return diagnostics

  const pagesRouterExports = [
    { pattern: /\bexport\s+(?:async\s+)?function\s+getServerSideProps\b/, name: 'getServerSideProps' },
    { pattern: /\bexport\s+(?:async\s+)?function\s+getStaticProps\b/, name: 'getStaticProps' },
    { pattern: /\bexport\s+(?:async\s+)?function\s+getStaticPaths\b/, name: 'getStaticPaths' },
    { pattern: /\bexport\s+const\s+getServerSideProps\b/, name: 'getServerSideProps' },
    { pattern: /\bexport\s+const\s+getStaticProps\b/, name: 'getStaticProps' },
    { pattern: /\bexport\s+const\s+getStaticPaths\b/, name: 'getStaticPaths' },
  ]

  for (const { pattern, name } of pagesRouterExports) {
    const matchLine = lines.find((l) => pattern.test(l.text))
    if (matchLine) {
      diagnostics.push(diag({
        rule: 'nextjs/pages-router-in-app',
        severity: 'warning',
        filePath: relPath,
        line: matchLine.num,
        column: 1,
        message: `Pages Router function '${name}' found in App Router project`,
        help: `Replace with App Router equivalent: use 'fetch' in Server Components or 'use server' actions instead of ${name}. See https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration`,
        category: 'architecture',
      }))
    }
  }

  return diagnostics
}

/** 4. nextjs/next-router-vs-navigation: Flags import from 'next/router' in App Router */
function checkNextRouterVsNavigation(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
  isAppRouter: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!isAppRouter) return diagnostics

  const routerImportPattern = /import\s+(?:\{[^}]*\}|[\w]+)\s+from\s+['"]next\/router['"]/
  const matchLine = lines.find((l) => routerImportPattern.test(l.text))

  if (matchLine) {
    diagnostics.push(diag({
      rule: 'nextjs/next-router-vs-navigation',
      severity: 'warning',
      filePath: relPath,
      line: matchLine.num,
      column: 1,
      message: "Import from 'next/router' in App Router project — use 'next/navigation' instead",
      help: "In App Router, use 'next/navigation' hooks (useRouter, usePathname, useSearchParams) instead of 'next/router'. The old router API is for Pages Router only.",
      category: 'imports',
    }))
  }

  return diagnostics
}

/** 5. nextjs/image-missing-dimensions: Flags <Image> without width/height props */
function checkImageMissingDimensions(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const imageTagPattern = /<(Image|Img)\s+[^>]*>/g
  let match: RegExpExecArray | null

  while ((match = imageTagPattern.exec(content)) !== null) {
    const tagContent = match[0]
    const tagStart = match.index

    const hasWidth = /\bwidth\s*=\s*[{"'0-9]/.test(tagContent)
    const hasHeight = /\bheight\s*=\s*[{"'0-9]/.test(tagContent)

    if (/\bfill(?:\s*=\s*\{?true\b)?/.test(tagContent)) continue

    if (!hasWidth || !hasHeight) {
      const beforeTag = content.slice(0, tagStart)
      const lineNum = (beforeTag.match(/\n/g) ?? []).length + 1
      const missing = !hasWidth && !hasHeight ? 'width and height' : !hasWidth ? 'width' : 'height'

      diagnostics.push(diag({
        rule: 'nextjs/image-missing-dimensions',
        severity: 'warning',
        filePath: relPath,
        line: lineNum,
        column: 1,
        message: `<Image> component missing ${missing} props`,
        help: `Add ${missing} prop(s) to the Image component. Next.js requires explicit dimensions to prevent layout shift. Alternatively, use the 'fill' prop for responsive images with a sized container.`,
        category: 'performance',
      }))
    }
  }

  return diagnostics
}

/** 6. nextjs/metadata-in-client: Flags metadata/generateMetadata export in 'use client' files */
function checkMetadataInClient(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const hasUseClient = lines.some((l) => l.text.trim() === "'use client'" || l.text.trim() === '"use client"')
  if (!hasUseClient) return diagnostics

  const metadataPatterns = [
    { pattern: /\bexport\s+const\s+metadata\b/, name: 'metadata' },
    { pattern: /\bexport\s+(?:async\s+)?function\s+generateMetadata\b/, name: 'generateMetadata' },
    { pattern: /\bexport\s+const\s+generateMetadata\b/, name: 'generateMetadata' },
  ]

  for (const { pattern, name } of metadataPatterns) {
    const matchLine = lines.find((l) => pattern.test(l.text))
    if (matchLine) {
      diagnostics.push(diag({
        rule: 'nextjs/metadata-in-client',
        severity: 'error',
        filePath: relPath,
        line: matchLine.num,
        column: 1,
        message: `${name} export in a 'use client' file — metadata must be in Server Components`,
        help: `Move the ${name} export to a separate Server Component file (without 'use client'). Metadata is only supported in Server Components in Next.js App Router.`,
        category: 'architecture',
      }))
    }
  }

  return diagnostics
}

/** 7. nextjs/hardcoded-env: Flags hardcoded URLs that should use env vars */
function checkHardcodedEnv(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const hardcodedUrlPatterns = [
    /['"]http:\/\/localhost:\d+['"]/,
    /['"]https?:\/\/localhost:\d+['"]/,
    /['"]http:\/\/127\.0\.0\.1:\d+['"]/,
    /['"]https?:\/\/[a-z0-9-]+\.example\.com(?:\/|$|['"])/,
    /['"]http:\/\/0\.0\.0\.0:\d+['"]/,
  ]

  for (const { num, text } of lines) {
    for (const pattern of hardcodedUrlPatterns) {
      if (pattern.test(text)) {
        const matched = text.match(pattern)?.[0] ?? ''
        diagnostics.push(diag({
          rule: 'nextjs/hardcoded-env',
          severity: 'info',
          filePath: relPath,
          line: num,
          column: 1,
          message: `Hardcoded URL '${matched}' — should use NEXT_PUBLIC_ environment variable`,
          help: 'Replace hardcoded URLs with process.env.NEXT_PUBLIC_API_URL or similar. For server-only URLs, use process.env.API_URL (no NEXT_PUBLIC_ prefix).',
          category: 'config',
        }))
        break
      }
    }
  }

  return diagnostics
}

/** 8. nextjs/link-without-aria: Flags <Link> without descriptive text or aria-label */
function checkLinkWithoutAria(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const linkPattern = /<Link\s+[^>]*>/g
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(content)) !== null) {
    const tagContent = match[0]
    const tagStart = match.index

    const hasAriaLabel = /\baria-label\s*=/.test(tagContent)

    const afterTag = content.slice(tagStart)
    const linkBody = afterTag.match(/<Link[^>]*>([\s\S]*?)<\/Link>/)
    const textContent = linkBody?.[1]?.replace(/<[^>]*>/g, '').trim() ?? ''

    if (!hasAriaLabel && (!textContent || textContent.length < 2)) {
      const beforeTag = content.slice(0, tagStart)
      const lineNum = (beforeTag.match(/\n/g) ?? []).length + 1

      diagnostics.push(diag({
        rule: 'nextjs/link-without-aria',
        severity: 'suggestion',
        filePath: relPath,
        line: lineNum,
        column: 1,
        message: '<Link> component without descriptive text or aria-label',
        help: 'Add descriptive text content inside <Link> or add an aria-label prop for accessibility. Screen readers need link text to convey purpose.',
        category: 'style',
      }))
    }
  }

  return diagnostics
}

// ── Tailwind Rules ───────────────────────────────────────

/** 9. tailwind/apply-anti-pattern: Flags @apply with utility classes */
function checkApplyAntiPattern(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const applyMatch = text.match(/@apply\s+(.+)/)
    if (applyMatch) {
      diagnostics.push(diag({
        rule: 'tailwind/apply-anti-pattern',
        severity: 'warning',
        filePath: relPath,
        line: num,
        column: 1,
        message: '@apply with utility classes — prefer component extraction or inline classes',
        help: 'Instead of @apply, use: (1) inline Tailwind classes in JSX className, (2) extract a reusable React component, or (3) use @layer base/components/utilities for custom CSS. @apply negates Tailwind\'s utility-first approach and creates maintenance issues.',
        category: 'style',
      }))
    }
  }

  return diagnostics
}

/** 10. tailwind/inline-style-conflict: Flags inline style= alongside Tailwind className */
function checkInlineStyleConflict(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const elementPattern = /<[A-Z][a-zA-Z]*\s[^>]*>|<\w+\s[^>]*>/g
  let match: RegExpExecArray | null

  while ((match = elementPattern.exec(content)) !== null) {
    const tagContent = match[0]
    const tagStart = match.index

    const hasClassName = /\bclassName\s*=/.test(tagContent)
    const hasInlineStyle = /\bstyle\s*=\s*\{/.test(tagContent)

    if (hasClassName && hasInlineStyle) {
      const beforeTag = content.slice(0, tagStart)
      const lineNum = (beforeTag.match(/\n/g) ?? []).length + 1

      diagnostics.push(diag({
        rule: 'tailwind/inline-style-conflict',
        severity: 'warning',
        filePath: relPath,
        line: lineNum,
        column: 1,
        message: 'Element has both Tailwind className and inline style — conflicting styling approaches',
        help: 'Use only Tailwind utility classes for styling. If Tailwind doesn\'t cover the style, consider: (1) using an arbitrary value like w-[123px], (2) adding a custom utility in tailwind.config, or (3) using the style prop only for truly dynamic values that can\'t be expressed as classes.',
        category: 'style',
      }))
    }
  }

  return diagnostics
}

/** 11. tailwind/important-modifier: Flags !important modifier in classes */
function checkImportantModifier(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    // Match Tailwind important modifier in className strings
    const classNameMatch = text.match(/className\s*=\s*["'`]([^"'`]+)["'`]/)
    if (!classNameMatch) continue

    const classes = classNameMatch[1].trim().split(/\s+/)
    const importantClasses = classes.filter((c) => /^!/.test(c) || /^[a-z]+-.*!/.test(c))

    if (importantClasses.length > 0) {
      // Also check for the !-prefix variant (Tailwind v3)
      const bangClasses = classes.filter((c) => /^!/.test(c))

      if (bangClasses.length > 0) {
        diagnostics.push(diag({
          rule: 'tailwind/important-modifier',
          severity: 'info',
          filePath: relPath,
          line: num,
          column: 1,
          message: `Tailwind !important modifier used: ${bangClasses.join(', ')}`,
          help: 'Avoid the !important modifier (!-prefix). Instead, increase specificity by: (1) using a more specific Tailwind variant (hover:, focus:, etc.), (2) ordering classes correctly (last same-specificity class wins), or (3) using @layer to control cascade order.',
          category: 'style',
        }))
      }
    }
  }

  return diagnostics
}

/** 12. tailwind/duplicate-utilities: Flags conflicting utilities in same className */
function checkDuplicateUtilities(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const conflictGroups: Array<{ prefix: string; label: string }> = [
    { prefix: 'p-', label: 'padding' },
    { prefix: 'px-', label: 'padding-x' },
    { prefix: 'py-', label: 'padding-y' },
    { prefix: 'm-', label: 'margin' },
    { prefix: 'mx-', label: 'margin-x' },
    { prefix: 'my-', label: 'margin-y' },
    { prefix: 'w-', label: 'width' },
    { prefix: 'h-', label: 'height' },
    { prefix: 'text-', label: 'text-size/color' },
    { prefix: 'bg-', label: 'background' },
    { prefix: 'rounded-', label: 'border-radius' },
    { prefix: 'border-', label: 'border' },
    { prefix: 'font-', label: 'font-weight/family' },
    { prefix: 'leading-', label: 'line-height' },
    { prefix: 'tracking-', label: 'letter-spacing' },
    { prefix: 'gap-', label: 'gap' },
    { prefix: 'z-', label: 'z-index' },
    { prefix: 'opacity-', label: 'opacity' },
    { prefix: 'min-w-', label: 'min-width' },
    { prefix: 'max-w-', label: 'max-width' },
    { prefix: 'min-h-', label: 'min-height' },
    { prefix: 'max-h-', label: 'max-height' },
  ]

  for (const { num, text } of lines) {
    const classNameMatch = text.match(/className\s*=\s*["'`]([^"'`]+)["'`]/)
    if (!classNameMatch) continue

    const classes = classNameMatch[1].trim().split(/\s+/)
    const seen = new Map<string, string>()

    for (const cls of classes) {
      const strippedCls = cls.replace(/^(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|peer-hover|first|last|odd|even|focus-within|focus-visible):/, '')

      for (const { prefix, label } of conflictGroups) {
        if (strippedCls.startsWith(prefix)) {
          if (seen.has(prefix)) {
            diagnostics.push(diag({
              rule: 'tailwind/duplicate-utilities',
              severity: 'warning',
              filePath: relPath,
              line: num,
              column: 1,
              message: `Conflicting Tailwind utilities in same className: multiple '${label}' values`,
              help: `Remove the duplicate ${label} utility. When conflicting utilities are present, only the last one in the class list takes effect (same specificity). This is likely a copy-paste error.`,
              category: 'style',
            }))
            break
          }
          seen.set(prefix, cls)
        }
      }
    }
  }

  return diagnostics
}

/** 13. tailwind/magic-values: Flags arbitrary values like w-[123px] */
function checkMagicValues(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const standardSpacing = new Set([
    '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8',
    '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40',
    '44', '48', '52', '56', '60', '64', '72', '80', '96',
  ])

  const arbitraryValuePattern = /\b(?:w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|top|left|right|bottom|space-x|space-y)-\[([^\]]+)\]/g

  for (const { num, text } of lines) {
    const classContent = text.match(/className\s*=\s*["'`]([^"'`]+)["'`]/)?.[1] ?? ''
    let match: RegExpExecArray | null
    arbitraryValuePattern.lastIndex = 0

    while ((match = arbitraryValuePattern.exec(classContent)) !== null) {
      const value = match[1]
      if (value.startsWith('var(') || value.startsWith('calc(') || value.startsWith('theme(')) continue

      const numericPart = value.replace(/px|rem|em|%|vw|vh|fr|deg|ms|s$/, '').trim()

      if (/^\d+(\.\d+)?$/.test(numericPart) && !standardSpacing.has(numericPart)) {
        diagnostics.push(diag({
          rule: 'tailwind/magic-values',
          severity: 'suggestion',
          filePath: relPath,
          line: num,
          column: 1,
          message: `Arbitrary Tailwind value '${match[0]}' — use standard spacing scale instead`,
          help: "Use a standard Tailwind spacing value instead of an arbitrary value. For example, use 'p-4' (1rem) instead of 'p-[16px]'. If no standard value fits, consider extending your tailwind.config theme instead of using arbitrary values everywhere.",
          category: 'style',
        }))
      }
    }
  }

  return diagnostics
}

/** 14. tailwind/incomplete-flex: Flags flex without items-center or justify-* */
function checkIncompleteFlex(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const classContent = text.match(/className\s*=\s*["'`]([^"'`]+)["'`]/)?.[1] ?? ''
    if (!classContent) continue

    const classes = classContent.split(/\s+/)
    const hasFlex = classes.some((c) => c === 'flex' || c === 'inline-flex')
    if (!hasFlex) continue

    const hasItemsAlign = classes.some((c) =>
      c.startsWith('items-')
    )
    const hasJustify = classes.some((c) =>
      c.startsWith('justify-')
    )

    if (!hasItemsAlign && !hasJustify) {
      diagnostics.push(diag({
        rule: 'tailwind/incomplete-flex',
        severity: 'info',
        filePath: relPath,
        line: num,
        column: 1,
        message: 'flex container without items-* or justify-* alignment',
        help: "Add alignment utilities to the flex container: 'items-center' for cross-axis alignment and 'justify-between'/'justify-center' for main-axis alignment. Bare 'flex' defaults to stretch and start which may not be intended.",
        category: 'style',
      }))
    }
  }

  return diagnostics
}

/** 15. tailwind/overloaded-classname: Flags className strings with 15+ utility classes */
function checkOverloadedClassname(
  filePath: string,
  relPath: string,
  content: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const CLASS_THRESHOLD = 15

  for (const { num, text } of lines) {
    const classNameMatch = text.match(/className\s*=\s*["'`]([^"'`]+)["'`]/)
    if (!classNameMatch) continue

    const classes = classNameMatch[1].trim().split(/\s+/).filter((c) => c.length > 0)

    if (classes.length >= CLASS_THRESHOLD) {
      diagnostics.push(diag({
        rule: 'tailwind/overloaded-classname',
        severity: 'suggestion',
        filePath: relPath,
        line: num,
        column: 1,
        message: `className has ${classes.length} utility classes (${CLASS_THRESHOLD}+ threshold) — extract to component`,
        help: 'Extract this element into a reusable component with descriptive props, or use cva (class-variance-authority) / clsx for conditional class composition. Long className strings are hard to read and maintain.',
        category: 'style',
      }))
    }
  }

  return diagnostics
}

// ── Engine ────────────────────────────────────────────────

export const frameworkLintEngine: Engine = {
  name: 'framework-lint' as const,
  description:
    'Framework-specific AI slop detection (Next.js, Tailwind CSS)',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const root = context.rootDirectory

    const isRelevant =
      context.languages.includes('typescript') ||
      context.languages.includes('javascript') ||
      context.languages.includes('tsx') ||
      context.languages.includes('jsx')

    if (!isRelevant) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No TypeScript or JavaScript detected in project',
      }
    }

    const hasNextJs = await detectNextJs(root)
    const hasTailwind = await detectTailwind(root)
    const isAppRouter = hasNextJs && await isAppRouterProject(root)

    if (!hasNextJs && !hasTailwind) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No Next.js or Tailwind CSS detected in project',
      }
    }

    const scanFiles = context.files?.length
      ? context.files.map((f) => join(root, f))
      : await collectScanFiles(root)

    for (const filePath of scanFiles) {
      const ext = extname(filePath)
      if (!SCAN_EXTENSIONS.has(ext)) continue

      let content: string
      try {
        content = await readFileContent(filePath)
      } catch {
        continue
      }

      const relPath = relative(root, filePath)
      const lines = toLines(content)

      if (hasNextJs && ext !== '.css') {
        const nextDiagnostics = [
          ...checkMisplacedUseClient(filePath, relPath, content, lines),
          ...checkMissingUseClient(filePath, relPath, content, lines),
          ...checkPagesRouterInApp(filePath, relPath, content, lines, isAppRouter),
          ...checkNextRouterVsNavigation(filePath, relPath, content, lines, isAppRouter),
          ...checkImageMissingDimensions(filePath, relPath, content, lines),
          ...checkMetadataInClient(filePath, relPath, content, lines),
          ...checkHardcodedEnv(filePath, relPath, content, lines),
          ...checkLinkWithoutAria(filePath, relPath, content, lines),
        ]
        diagnostics.push(...nextDiagnostics)
      }

      if (hasTailwind) {
        const tailwindDiagnostics = [
          ...checkApplyAntiPattern(filePath, relPath, content, lines),
          ...checkInlineStyleConflict(filePath, relPath, content, lines),
          ...checkImportantModifier(filePath, relPath, content, lines),
          ...checkDuplicateUtilities(filePath, relPath, content, lines),
          ...checkMagicValues(filePath, relPath, content, lines),
          ...checkIncompleteFlex(filePath, relPath, content, lines),
          ...checkOverloadedClassname(filePath, relPath, content, lines),
        ]
        diagnostics.push(...tailwindDiagnostics)
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
