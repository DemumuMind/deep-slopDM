// ── Tree-sitter AST Parsing Utility ─────────────────────
// Lazy-loads web-tree-sitter + TypeScript grammars.
// All exports return null on failure so the engine can fall back to regex.

import type { Language as TSLanguage, Node as TSNode, Parser, Tree } from "web-tree-sitter";

// ── Lazy singleton state ────────────────────────────────

let parserInstance: Parser | null = null;
let tsLang: TSLanguage | null = null;
let tsxLang: TSLanguage | null = null;
let initPromise: Promise<boolean> | null = null;
let initDone = false;
let initOk = false;

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

/** Check if tree-sitter is available and initialized */
export function isAvailable(): boolean {
  return initOk && parserInstance !== null;
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

// ── Node helpers ───────────────────────────────────────

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
  // In tree-sitter TS: as_expression has [value, "as", type]
  const typeChild = node.children.find((c) => c.fieldName === "type");
  return typeChild?.text ?? null;
}

/** Get context of an `as` expression — returns 'catch', 'orm', 'json', 'variable', or 'unknown' */
export function getAsExpressionContext(node: ASTNode): string {
  // Check if inside catch clause
  if (isInsideCatch(node)) return "catch";
  // Check if near ORM patterns (prisma, drizzle, sequelize, mongoose)
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
  // Check if this is inside an object_pattern that is the LHS of a variable declarator
  const objPattern = findAncestor(node, (n) =>
    n.type === "object_pattern",
  );
  if (!objPattern) return false;
  const declarator = findAncestor(objPattern, (n) =>
    n.type === "variable_declarator",
  );
  if (!declarator) return false;
  // Check if the RHS contains an API call pattern
  const callExpr = declarator.children.find(
    (c) => c.type === "call_expression",
  );
  if (callExpr) {
    const text = callExpr.text;
    return /^(useSWR|useQuery|useMutation|fetch|axios|prisma|db)\./.test(text);
  }
  return false;
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
