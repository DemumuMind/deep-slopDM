# Phase 4: Security Audit + Extended Security

**Depends on:** none
**Objective:** Add real dependency vulnerability auditing (npm/pip/govulncheck/cargo) plus extended security patterns (secrets, XSS, HTML safety)

## Work

### Task 4.1: Security audit runner
**Files:**
- Create: `src/security/audit.ts`

Multi-language vulnerability auditing:
- **npm audit**: run `npm audit --json`, parse advisories + vulnerabilities format. Aggregate per-package, worst severity. Handle ENOLOCK, pnpm fallback.
- **pnpm audit**: with fallback to npm if pnpm fails
- **pip-audit**: run `pip-audit --format=json`, map Python vulns
- **govulncheck**: run `govulncheck -json ./...`, parse JSON lines
- **cargo audit**: run `cargo audit --json`, map Rust vulns

Each audit: detect if package manager exists, run with timeout (25s default), parse output, produce diagnostics per vulnerability.

Config: `security.audit: true`, `security.auditTimeout: 25000`

### Task 4.2: Secrets detection
**Files:**
- Create: `src/security/secrets.ts`

Detect hardcoded secrets/credentials:
- API keys (sk-, ghp_, AKIA, etc.)
- Bearer tokens
- Database connection strings
- Private keys (PEM headers)
- Password assignments
- URL credentials

Each detection produces a STRICT severity diagnostic with masked value in message (use source-mask.ts).

### Task 4.3: HTML safety / XSS detection
**Files:**
- Create: `src/security/html-safety.ts`

Detect XSS and HTML injection:
- `innerHTML` assignment with dynamic content
- `dangerouslySetInnerHTML` in React
- `v-html` in Vue
- Unsanitized user input in DOM manipulation
- `document.write()` with external input

### Task 4.4: Integrate into security-deep engine
**Files:**
- Modify: `src/engines/security-deep/index.ts`

Add new rules to security-deep engine:
- `security-deep/dependency-vulnerability` (from audit.ts)
- `security-deep/hardcoded-secret` (from secrets.ts)
- `security-deep/xss-risk` (from html-safety.ts)
- `security-deep/unsafe-html` (from html-safety.ts)

Audit runs only if config security.audit is true (default: false, since it runs external commands).

## Acceptance criteria
- [ ] With `security.audit: true`, npm audit vulnerabilities appear as diagnostics
- [ ] pip-audit runs for Python projects (if pip-audit installed)
- [ ] Hardcoded API keys produce STRICT severity diagnostics with masked values
- [ ] `innerHTML` with dynamic content produces XSS diagnostic
- [ ] `dangerouslySetInnerHTML` produces unsafe-html diagnostic
- [ ] Audit timeout is configurable via `security.auditTimeout`
- [ ] If audit tool not installed: skip with info message (not error)
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Scan with secrets detection
echo 'const key = "***"' > /tmp/test-secret.ts
node dist/cli.js scan /tmp/test-secret.ts 2>&1 | grep -c "hardcoded-secret"
# Build + test
npx tsc --noEmit && npx vitest run
```

## Mandatory commands
```bash
npx tsc --noEmit
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
