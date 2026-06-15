// ── Home Screen ────────────────────────────────────────
// Branded welcome when no args in non-TTY mode

import { APP_VERSION } from '../version.js'
import { style, styleBold, separator } from '../output/theme.js'

const LOGO = `
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║    ██████╗ ███████╗██████╗ ███████╗       ║
  ║    ██╔══██╗██╔════╝██╔══██╗██╔════╝       ║
  ║    ██║  ██║█████╗  ██████╔╝█████╗         ║
  ║    ██║  ██║██╔══╝  ██╔══██╗██╔══╝         ║
  ║    ██████╔╝███████╗██║  ██║███████╗       ║
  ║    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝       ║
  ║                                           ║
  ║         deep-slop  —  AI slop detector    ║
  ╚═══════════════════════════════════════════╝`

/**
 * Render the branded home screen.
 * Shown when --help or no args in non-interactive mode.
 */
export function renderHomeScreen(): void {
  console.log(LOGO)
  console.log('')
  console.log(`  ${styleBold('info', 'deep-slop')} ${style('muted', `v${APP_VERSION}`)}`)
  console.log(`  ${style('muted', 'Deep AI slop detection — 20 engines, AST-powered')}`)
  console.log('')
  console.log(separator())
  console.log('')

  // Command groups
  console.log(`  ${styleBold('info', 'Run')}`)
  console.log(`    ${style('suggestion', 'scan')}      Scan project for AI slop and quality issues`)
  console.log(`    ${style('suggestion', 'fix')}       Auto-fix detected issues`)
  console.log(`    ${style('suggestion', 'ci')}        CI mode: quality gate with coverage-aware scoring`)
  console.log('')

  console.log(`  ${styleBold('info', 'Setup')}`)
  console.log(`    ${style('suggestion', 'init')}      Initialize deep-slop configuration`)
  console.log(`    ${style('suggestion', 'doctor')}    Check environment for compatibility`)
  console.log(`    ${style('suggestion', 'hook')}      Manage hooks for AI coding tools`)
  console.log('')

  console.log(`  ${styleBold('info', 'Explore')}`)
  console.log(`    ${style('suggestion', 'rules')}     List and search all detection rules`)
  console.log(`    ${style('suggestion', 'trend')}     Show score trend across recent scans`)
  console.log(`    ${style('suggestion', 'badge')}     Generate a score badge for README`)
  console.log('')

  console.log(separator())
  console.log('')

  // Quick start
  console.log(`  ${styleBold('info', 'Quick start')}`)
  console.log(`    ${style('muted', '$')} deep-slop scan .`)
  console.log(`    ${style('muted', '$')} deep-slop scan . --json > report.json`)
  console.log(`    ${style('muted', '$')} deep-slop ci --fail-below 80`)
  console.log(`    ${style('muted', '$')} deep-slop fix . --safe`)
  console.log(`    ${style('muted', '$')} deep-slop agent repair --provider claude`)
  console.log('')

  console.log(separator())
  console.log('')
}

