// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/as-any
// ── Tree-sitter AST Parsing Utility ─────────────────────
// Lazy-loads web-tree-sitter + TypeScript and Python grammars.
// All exports return null on failure so the engine can fall back to regex.

import type { Language as TSLanguage, Node as TSNode, Parser, Tree } from "web-tree-sitter";

// ── Lazy singleton state ────────────────────────────────

let parserInstance: Parser | null = null;
let tsLang: TSLanguage | null = null;
let tsxLang: TSLanguage | null = null;
let pyLang: TSLanguage | null = null;
let initPromise: Promise<boolean> | null = null;
let initDone = false;
let initOk = false;

// ── Python grammar state ────────────────────────────────
let pyInitDone = false
let pyInitOk = false

/**
 * Attempt to initialise web-tree-sitter with the TypeScript grammar.
 * Returns true on success; false on any failure (missing WASM, etc.).
 * Safe to call multiple times – only the first call does real work.
 */
export async function initParser(): Promise<boolean> {
  if (initDone) return initOk;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import so the module is never loaded when tree-sitter is not used.
      const wt = await import("web-tree-sitter");

      // Resolve the WASM path — web-tree-sitter .wasm lives alongside the JS
      const { dirname } = await import("node:path");
      const wasmDir = dirname(
        require.resolve("web-tree-sitter/tree-sitter.wasm"),
      );

      await wt.Parser.init({
        locateFile: (name: string) => `${wasmDir}/${name}`,
      });

      const parser = new wt.Parser();
      parserInstance = parser;

      // Load TypeScript grammar
      const tsWasm = require.resolve(
        "tree-sitter-typescript/tree-sitter-typescript.wasm",
      );
      tsLang = await wt.Language.load(tsWasm);

      // Load TSX grammar
      const tsxWasm = require.resolve(
        "tree-sitter-typescript/tree-sitter-tsx.wasm",
      );
      tsxLang = await wt.Language.load(tsxWasm);

      initDone = true;
      initOk = true;
      return true;
    } catch (err) {
      initDone = true;
      initOk = false;
      return false;
    }
  })();

  return initPromise;
}

/**
 * Attempt to load the Python grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-python is not installed.
 */
export async function initPythonParser(): Promise<boolean> {
  if (pyInitDone) return pyInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      pyInitDone = true
      pyInitOk = false
      return false
    }
  }

  try {
    const pyWasm = require.resolve(
      'tree-sitter-python/python.wasm',
    )
    const wt = await import('web-tree-sitter')
    pyLang = await wt.Language.load(pyWasm)
    pyInitDone = true
    pyInitOk = true
    return true
  } catch {
    pyInitDone = true
    pyInitOk = false
    return false
  }
}

/** Check if tree-sitter is available and initialized */
export function isAvailable(): boolean {
  return initOk && parserInstance !== null;
}

/** Check if Python tree-sitter grammar is available */
export function isPythonAvailable(): boolean {
  return pyInitOk && pyLang !== null
}

// ── Types ──────────────────────────────────────────────

export interface ASTNode {
  type: string;
  text: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  children: ASTNode[];
  parent: ASTNode | null;
  fieldName: string | null;
}

export interface ASTRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// ── Parse ──────────────────────────────────────────────

/**
 * Parse a source file into an AST tree.
 * Returns null if tree-sitter is not available or parsing fails.
 */
export async function parseFile(
  content: string,
  isTsx = false,
): Promise<ASTNode | null> {
  if (!parserInstance || (!tsLang && !tsxLang)) {
    const ok = await initParser();
    if (!ok) return null;
  }

  try {
    const lang = isTsx ? tsxLang! : tsLang!;
    parserInstance!.setLanguage(lang);
    const tree = parserInstance!.parse(content);
    if (!tree) return null;
    return convertNode(tree.rootNode, null);
  } catch {
    return null;
  }
}

/**
 * Parse Python source content into an AST tree.
 * Returns null if tree-sitter-python is not available or parsing fails.
 */
export async function parsePython(content: string): Promise<ASTNode | null> {
  if (!pyLang) {
    const ok = await initPythonParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(pyLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) return null
    return convertNode(tree.rootNode, null)
  } catch {
    return null
  }
}

// ── Node helpers (TypeScript) ──────────────────────────

/**
 * Find all descendant nodes of a given type.
 */
export function findNodesOfType(
  root: ASTNode,
  type: string,
): ASTNode[] {
  const results: ASTNode[] = [];
  function walk(node: ASTNode) {
    if (node.type === type) results.push(node);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return results;
}

/**
 * Find all descendant nodes matching any of the given types.
 */
export function findNodesOfTypes(
  root: ASTNode,
  types: string[],
): ASTNode[] {
  const typeSet = new Set(types);
  const results: ASTNode[] = [];
  function walk(node: ASTNode) {
    if (typeSet.has(node.type)) results.push(node);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return results;
}

/**
 * Get the text content of a node.
 */
export function getNodeText(node: ASTNode): string {
  return node.text;
}

/**
 * Get the source range of a node (1-indexed lines).
 */
export function getNodeRange(node: ASTNode): ASTRange {
  return {
    startRow: node.startRow + 1, // Convert 0-indexed to 1-indexed
    startCol: node.startCol,
    endRow: node.endRow + 1,
    endCol: node.endCol,
  };
}

/**
 * Walk the AST depth-first, calling visitor on each node.
 * Return false from visitor to skip children.
 */
export function walkAST(
  root: ASTNode,
  visitor: (node: ASTNode) => boolean | void,
): void {
  function walk(node: ASTNode) {
    const result = visitor(node);
    if (result !== false) {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
}

/**
 * Find the nearest ancestor of a node matching a type predicate.
 */
export function findAncestor(
  node: ASTNode,
  predicate: (n: ASTNode) => boolean,
): ASTNode | null {
  let current = node.parent;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Check if a node is inside a function of a certain kind.
 */
export function isInsideFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) =>
    ["function_declaration", "function", "arrow_function", "method_definition", "generator_function_declaration"].includes(n.type),
  ) !== null;
}

/**
 * Check if a node is inside a try/catch block.
 */
export function isInsideCatch(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === "catch_clause") !== null;
}

/** Alias for initDone check */
export function isReady(): boolean {
  return initOk;
}

/** Find ancestor of specific type */
export function findAncestorOfType(
  node: ASTNode,
  type: string,
): ASTNode | null {
  return findAncestor(node, (n) => n.type === type);
}

/** Get next named sibling that is not a comment */
export function nextNamedNonCommentSibling(node: ASTNode): ASTNode | null {
  if (!node.parent) return null;
  const siblings = node.parent.children.filter(
    (c) => c.type !== "comment" && c.type !== "//" && c.type !== "/*",
  );
  const idx = siblings.indexOf(node);
  return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
}

/** Get previous named sibling that is not a comment */
export function prevNamedNonCommentSibling(node: ASTNode): ASTNode | null {
  if (!node.parent) return null;
  const siblings = node.parent.children.filter(
    (c) => c.type !== "comment" && c.type !== "//" && c.type !== "/*",
  );
  const idx = siblings.indexOf(node);
  return idx > 0 ? siblings[idx - 1] : null;
}

/** Check if a catch clause body is empty (only contains comments or whitespace) */
export function isCatchBodyEmpty(catchNode: ASTNode): boolean {
  if (catchNode.type !== "catch_clause") return false;
  const body = catchNode.children.find(
    (c) => c.type === "statement_block" || c.type === "block",
  );
  if (!body) return true;
  const nonTrivial = body.children.filter(
    (c) =>
      c.type !== "comment" &&
      c.type !== "//" &&
      c.type !== "/*" &&
      c.type !== "{" &&
      c.type !== "}" &&
      c.text.trim() !== "",
  );
  return nonTrivial.length === 0;
}

/** Get the type annotation from an `as` expression (e.g., `x as any` → "any") */
export function getAsExpressionType(node: ASTNode): string | null {
  if (node.type !== "as_expression") return null;
  const typeChild = node.children.find((c) => c.fieldName === "type");
  return typeChild?.text ?? null;
}

/** Get context of an `as` expression — returns 'catch', 'orm', 'json', 'variable', or 'unknown' */
export function getAsExpressionContext(node: ASTNode): string {
  if (isInsideCatch(node)) return "catch";
  const funcAncestor = findAncestor(node, (n) =>
    ["function_declaration", "arrow_function", "method_definition"].includes(n.type),
  );
  if (funcAncestor) {
    const text = funcAncestor.text.toLowerCase();
    if (/prisma|drizzle|sequelize|mongoose|typeorm|knex|supabase/.test(text))
      return "orm";
    if (/json\.parse|parse\(/.test(text)) return "json";
  }
  return "unknown";
}

/** Extract import info from an import_statement or import_declaration node */
export function extractImportFromNode(node: ASTNode): {
  source: string;
  symbols: string[];
  line: number;
  isTypeOnly: boolean;
} | null {
  if (node.type !== "import_statement" && node.type !== "import_declaration")
    return null;

  const sourceNode = node.children.find(
    (c) => c.type === "string" || c.fieldName === "source",
  );
  if (!sourceNode) return null;
  const source = sourceNode.text.replace(/^['"]|['"]$/g, "");

  const isTypeOnly = node.text.includes("import type ");

  const symbols: string[] = [];
  const namedImport = node.children.find(
    (c) => c.type === "named_imports" || c.type === "import_clause",
  );
  if (namedImport) {
    for (const child of namedImport.children) {
      if (
        child.type === "identifier" ||
        child.type === "type_identifier" ||
        child.type === "import_specifier"
      ) {
        symbols.push(child.text);
      }
    }
  }

  return { source, symbols, line: node.startRow + 1, isTypeOnly };
}

/** Check if a node is in an HTML attribute context (JSX attribute value) */
export function isHtmlAttributeContext(node: ASTNode): boolean {
  const attr = findAncestor(node, (n) =>
    n.type === "jsx_attribute" || n.type === "attribute",
  );
  return attr !== null;
}

/** Check if a name is a destructured API binding (e.g., `const { data } = useSWR()`) */
export function isDestructuredApiBinding(node: ASTNode): boolean {
  const objPattern = findAncestor(node, (n) =>
    n.type === "object_pattern",
  );
  if (!objPattern) return false;
  const declarator = findAncestor(objPattern, (n) =>
    n.type === "variable_declarator",
  );
  if (!declarator) return false;
  const callExpr = declarator.children.find(
    (c) => c.type === "call_expression",
  );
  if (callExpr) {
    const text = callExpr.text;
    return /^(useSWR|useQuery|useMutation|fetch|axios|prisma|db)\./.test(text);
  }
  return false;
}

// ── Python-specific node helpers ────────────────────────

/** Info extracted from a Python function definition */
export interface PythonFunctionInfo {
  /** Function name */
  name: string
  /** Decorators applied (e.g. '@staticmethod') */
  decorators: string[]
  /** Parameter names */
  parameters: string[]
  /** Whether the function is async */
  isAsync: boolean
  /** Start line (1-indexed) */
  line: number
  /** End line (1-indexed) */
  endLine: number
  /** Full text of the function */
  text: string
}

/** Info extracted from a Python class definition */
export interface PythonClassInfo {
  /** Class name */
  name: string
  /** Base classes (inheritance) */
  bases: string[]
  /** Decorators applied */
  decorators: string[]
  /** Methods defined within the class */
  methods: PythonFunctionInfo[]
  /** Start line (1-indexed) */
  line: number
  /** End line (1-indexed) */
  endLine: number
  /** Full text of the class */
  text: string
}

/** Info extracted from a Python import statement */
export interface PythonImportInfo {
  /** Module being imported from */
  module: string
  /** Symbols imported */
  symbols: string[]
  /** Whether this is a from-import (vs bare import) */
  isFromImport: boolean
  /** Start line (1-indexed) */
  line: number
  /** Full text of the import */
  text: string
}

/**
 * Find all Python function definitions in an AST.
 */
export function findPythonFunctions(root: ASTNode): PythonFunctionInfo[] {
  const funcNodes = findNodesOfTypes(root, [
    'function_definition',
    'decorated_definition',
  ])

  const results: PythonFunctionInfo[] = []

  for (const node of funcNodes) {
    // decorated_definition wraps a function_definition
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(
        (c) => c.type === 'function_definition'
      )
      if (inner) {
        results.push(extractPythonFunctionInfo(inner, node))
      }
    } else {
      results.push(extractPythonFunctionInfo(node))
    }
  }

  return results
}

/**
 * Find all Python class definitions in an AST.
 */
export function findPythonClasses(root: ASTNode): PythonClassInfo[] {
  const classNodes = findNodesOfTypes(root, [
    'class_definition',
    'decorated_definition',
  ])

  const results: PythonClassInfo[] = []

  for (const node of classNodes) {
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(
        (c) => c.type === 'class_definition'
      )
      if (inner) {
        results.push(extractPythonClassInfo(inner, node))
      }
    } else {
      results.push(extractPythonClassInfo(node))
    }
  }

  return results
}

/**
 * Find all Python import statements in an AST.
 */
export function findPythonImports(root: ASTNode): PythonImportInfo[] {
  const importNodes = findNodesOfTypes(root, [
    'import_statement',
    'import_from_statement',
  ])

  return importNodes.map(extractPythonImportInfo)
}

/**
 * Check if a Python function body is essentially empty
 * (only contains pass, ..., or docstrings).
 */
export function isPythonFunctionStub(funcInfo: PythonFunctionInfo): boolean {
  const text = funcInfo.text
  // Remove the def line
  const bodyLines = text.split('\n').slice(1).join('\n').trim()

  // Only pass or ellipsis
  if (/^(\s*(pass|\.\.\.)\s*)$/.test(bodyLines)) return true

  // Only a docstring
  const docstringOnly = bodyLines
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .trim()

  if (docstringOnly === '' || docstringOnly === 'pass' || docstringOnly === '...') {
    return true
  }

  return false
}

/**
 * Detect Python AI patterns in an AST.
 * Returns diagnostic-like findings for the ast-slop engine.
 */
export function detectPythonAIPatterns(root: ASTNode): Array<{
  type: string
  message: string
  line: number
}> {
  const findings: Array<{ type: string; message: string; line: number }> = []

  // Find stub functions (pass / ...)
  const functions = findPythonFunctions(root)
  for (const fn of functions) {
    if (isPythonFunctionStub(fn)) {
      findings.push({
        type: 'python-stub-function',
        message: `Function '${fn.name}' is a stub (only pass/ellipsis)`,
        line: fn.line,
      })
    }
  }

  // Find overly broad except handlers
  const tryNodes = findNodesOfType(root, 'try_statement')
  for (const tryNode of tryNodes) {
    const exceptNodes = tryNode.children.filter(
      (c) => c.type === 'except_clause'
    )
    for (const exceptNode of exceptNodes) {
      const hasSpecificType = exceptNode.children.some(
        (c) => c.type === 'identifier' || c.type === 'tuple'
      )
      if (!hasSpecificType) {
        const bareExcept = exceptNode.children.find(
          (c) => c.text && c.text.includes('except')
        )
        findings.push({
          type: 'python-bare-except',
          message: 'Bare except clause catches all exceptions',
          line: exceptNode.startRow + 1,
        })
      }
    }
  }

  // Find TODO/FIXME stubs in comments
  const commentNodes = findNodesOfType(root, 'comment')
  for (const comment of commentNodes) {
    const text = comment.text.toLowerCase()
    if (/todo|fixme|hack|xxx/.test(text)) {
      findings.push({
        type: 'python-todo-stub',
        message: `TODO/FIXME comment: ${comment.text.trim()}`,
        line: comment.startRow + 1,
      })
    }
  }

  // Find print statements (AI debug leftovers)
  const callNodes = findNodesOfType(root, 'call')
  for (const call of callNodes) {
    const func = call.children[0]
    if (func && func.text === 'print') {
      findings.push({
        type: 'python-print-leftover',
        message: 'print() statement — likely debug leftover',
        line: call.startRow + 1,
      })
    }
  }

  return findings
}

// ── Internal helpers for Python AST ────────────────────

function extractPythonFunctionInfo(
  funcNode: ASTNode,
  decoratedParent?: ASTNode,
): PythonFunctionInfo {
  const nameNode = funcNode.children.find((c) => c.fieldName === 'name')
    ?? funcNode.children.find((c) => c.type === 'identifier')
  const name = nameNode?.text ?? '(anonymous)'

  const params = funcNode.children.find(
    (c) => c.type === 'parameters'
  )
  const parameters = params
    ? params.children
        .filter((c) => c.type === 'identifier' || c.type === 'typed_parameter' || c.type === 'default_parameter')
        .map((c) => c.children[0]?.text ?? c.text)
    : []

  const isAsync = funcNode.children.some(
    (c) => c.type === 'async'
  )

  const decorators: string[] = []
  if (decoratedParent) {
    for (const child of decoratedParent.children) {
      if (child.type === 'decorator') {
        decorators.push(child.text.replace('@', ''))
      }
    }
  }

  return {
    name,
    decorators,
    parameters,
    isAsync,
    line: funcNode.startRow + 1,
    endLine: funcNode.endRow + 1,
    text: funcNode.text,
  }
}

function extractPythonClassInfo(
  classNode: ASTNode,
  decoratedParent?: ASTNode,
): PythonClassInfo {
  const nameNode = classNode.children.find((c) => c.fieldName === 'name')
    ?? classNode.children.find((c) => c.type === 'identifier')
  const name = nameNode?.text ?? '(anonymous)'

  const argList = classNode.children.find(
    (c) => c.type === 'argument_list'
  )
  const bases = argList
    ? argList.children
        .filter((c) => c.type === 'identifier' || c.type === 'attribute')
        .map((c) => c.text)
    : []

  const decorators: string[] = []
  if (decoratedParent) {
    for (const child of decoratedParent.children) {
      if (child.type === 'decorator') {
        decorators.push(child.text.replace('@', ''))
      }
    }
  }

  // Find methods inside the class body
  const body = classNode.children.find(
    (c) => c.type === 'block'
  )
  const methods: PythonFunctionInfo[] = []
  if (body) {
    for (const child of body.children) {
      if (child.type === 'function_definition') {
        methods.push(extractPythonFunctionInfo(child))
      } else if (child.type === 'decorated_definition') {
        const inner = child.children.find(
          (c) => c.type === 'function_definition'
        )
        if (inner) {
          methods.push(extractPythonFunctionInfo(inner, child))
        }
      }
    }
  }

  return {
    name,
    bases,
    decorators,
    methods,
    line: classNode.startRow + 1,
    endLine: classNode.endRow + 1,
    text: classNode.text,
  }
}

function extractPythonImportInfo(importNode: ASTNode): PythonImportInfo {
  const isFromImport = importNode.type === 'import_from_statement'

  let module = ''
  const symbols: string[] = []

  if (isFromImport) {
    // from X import Y, Z
    const moduleNode = importNode.children.find(
      (c) => c.fieldName === 'module_name'
        || (c.type === 'dotted_name' && c.fieldName !== 'name')
        || (c.type === 'identifier' && c.fieldName !== 'name')
    )
    module = moduleNode?.text ?? ''

    const nameList = importNode.children.find(
      (c) => c.type === 'dotted_name' && c !== moduleNode
    )
    const identifierChildren = importNode.children.filter(
      (c) => c.type === 'identifier' && c !== moduleNode
    )

    if (nameList) {
      symbols.push(nameList.text)
    }
    for (const id of identifierChildren) {
      if (id.text !== 'from' && id.text !== 'import' && id.text !== module) {
        symbols.push(id.text)
      }
    }
  } else {
    // import X, Y
    const dottedNames = importNode.children.filter(
      (c) => c.type === 'dotted_name'
    )
    const identifiers = importNode.children.filter(
      (c) => c.type === 'identifier'
    )
    for (const dn of dottedNames) {
      symbols.push(dn.text)
    }
    for (const id of identifiers) {
      if (id.text !== 'import') {
        symbols.push(id.text)
      }
    }
    module = symbols[0] ?? ''
  }

  return {
    module,
    symbols,
    isFromImport,
    line: importNode.startRow + 1,
    text: importNode.text,
  }
}

// ── Internal ───────────────────────────────────────────

function convertNode(node: TSNode, parent: ASTNode | null): ASTNode {
  const children: ASTNode[] = [];
  const astNode: ASTNode = {
    type: node.type,
    text: node.text,
    startRow: node.startPosition.row,
    startCol: node.startPosition.column,
    endRow: node.endPosition.row,
    endCol: node.endPosition.column,
    children,
    parent,
    fieldName: null,
  };

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const converted = convertNode(child, astNode);
      converted.fieldName = node.fieldNameForChild(i) ?? null;
      children.push(converted);
    }
  }

  return astNode;
}
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
