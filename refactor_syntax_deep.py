#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path('/home/sprite/deep-slop')
SRC = ROOT / 'src/engines/syntax-deep/index.ts'


def find_line_index(lines, marker):
    for i, line in enumerate(lines):
        if marker in line:
            return i
    raise ValueError(f'Marker not found: {marker}')


def find_matching_paren(text, start):
    depth = 1
    i = start + 1
    n = len(text)
    while i < n and depth > 0:
        c = text[i]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
        elif c == '"':
            i += 1
            while i < n and text[i] != '"':
                if text[i] == '\\':
                    i += 1
                i += 1
        elif c == "'":
            i += 1
            while i < n and text[i] != "'":
                if text[i] == '\\':
                    i += 1
                i += 1
        elif c == '`':
            i += 1
            while i < n and text[i] != '`':
                if text[i] == '\\':
                    i += 1
                i += 1
        elif c == '/':
            if i + 1 < n and text[i + 1] == '/':
                nl = text.find('\n', i)
                i = len(text) if nl == -1 else nl
            elif i + 1 < n and text[i + 1] == '*':
                end = text.find('*/', i + 2)
                i = len(text) if end == -1 else end + 2
            else:
                i += 1
                while i < n and text[i] != '/':
                    if text[i] == '\\':
                        i += 1
                    i += 1
                if i < n:
                    i += 1
        i += 1
    return -1


def compress_make_diagnostic_calls(text):
    parts = []
    i = 0
    while i < len(text):
        idx = text.find('makeDiagnostic(', i)
        if idx == -1:
            parts.append(text[i:])
            break
        parts.append(text[i:idx])
        start = text.find('(', idx)
        end = find_matching_paren(text, start)
        if end == -1:
            parts.append(text[idx:])
            break
        call = text[idx:end + 1]
        # Collapse newlines and surrounding whitespace to a single space.
        compressed = re.sub(r'\s*\n\s*', ' ', call).strip()
        parts.append(compressed)
        i = end + 1
    return ''.join(parts)


def add_exports(section):
    return re.sub(r'^function ', 'export function ', section, flags=re.MULTILINE)


def main():
    lines = SRC.read_text(encoding='utf-8').splitlines(keepends=True)

    const_idx = find_line_index(lines, '// ── Constants')
    helpers_idx = find_line_index(lines, '// ── Helpers')
    check_idx = find_line_index(lines, '// ── Check Functions')
    engine_idx = find_line_index(lines, '// ── Engine Implementation')

    constants_section = ''.join(lines[const_idx:helpers_idx])
    helpers_section = ''.join(lines[helpers_idx:check_idx])
    rules_section = ''.join(lines[check_idx:engine_idx])
    engine_section = ''.join(lines[engine_idx:])

    helpers_section = add_exports(helpers_section)
    rules_section = add_exports(rules_section)
    rules_section = compress_make_diagnostic_calls(rules_section)

    helpers_header = '''import { join, relative } from "node:path";

import type { Diagnostic, EngineContext, Severity } from "../../types/index.js";

'''

    rules_header = '''import type { Diagnostic } from "../../types/index.js";

import { detectEncodingAnomalies, toLines } from "../../utils/file-utils.js";

import { makeDiagnostic } from "./helpers.js";

'''

    engine_header = '''import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from "../../config/engine-utils.js";

import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  FixResult,
} from "../../types/index.js";

import { readFileContent } from "../../utils/file-utils.js";

import { collectFiles, readRawBytes } from "./helpers.js";

import {
  checkBomAndZwnbsp,
  checkLineEndings,
  checkInvalidEscapes,
  checkUnnecessaryRegexEscapes,
  checkNumberPrecision,
  checkUnicodeAnomalies,
  checkTrailingWhitespace,
  checkMissingFinalNewline,
  checkInconsistentIndentation,
} from "./rules.js";

'''

    (ROOT / 'src/engines/syntax-deep/helpers.ts').write_text(
        helpers_header + helpers_section, encoding='utf-8'
    )
    (ROOT / 'src/engines/syntax-deep/rules.ts').write_text(
        rules_header + constants_section + rules_section, encoding='utf-8'
    )
    (ROOT / 'src/engines/syntax-deep/index.ts').write_text(
        engine_header + engine_section, encoding='utf-8'
    )


if __name__ == '__main__':
    main()
