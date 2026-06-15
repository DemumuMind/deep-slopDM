import { resolve } from 'node:path'
import type { Command } from 'commander'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig } from '../../types/index.js'
import { runScan } from '../../engines/orchestrator.js'
import { detectGitHubRepo, generateBadgeUrl, generateBadgeMarkdown, scoreColor } from '../../badge/index.js'
import { style, styleBold, separator, scoreLabel } from '../../output/theme.js'

export function register(program: Command): void {
  program
    .command('badge')
    .description('Generate a shields.io badge for your deep-slop score')
    .argument('[path]', 'project directory', '.')
    .option('--owner <owner>', 'GitHub owner (auto-detected from git remote)')
    .option('--repo <repo>', 'GitHub repo (auto-detected from git remote)')
    .option('--score <n>', 'Score to display (run scan if omitted)')
    .option('--json', 'Output as JSON for machine use')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      let owner = opts.owner
      let repo = opts.repo

      if (!owner || !repo) {
        const detected = detectGitHubRepo(rootDir)
        if (detected) {
          if (!owner) owner = detected.owner
          if (!repo) repo = detected.repo
        }
      }

      if (!owner || !repo) {
        process.stderr.write('  ⚠ Could not detect GitHub repo. Use --owner and --repo flags.\n')
        process.exit(1)
      }

      let score: number | undefined
      if (opts.score !== undefined) {
        score = parseInt(opts.score, 10)
      } else {
        const languages = await detectLanguages(rootDir)
        const frameworks = await detectFrameworks(rootDir)
        const files = await collectFiles(rootDir, languages, [])
        const config: DeepSlopConfig = { ...DEFAULT_CONFIG }
        const result = await runScan({
          rootDirectory: rootDir,
          languages,
          frameworks,
          files,
          installedTools: {},
          config,
        })
        score = result.score ?? undefined
      }

      const badgeUrl = generateBadgeUrl(owner, repo, score)
      const pageUrl = `https://github.com/${owner}/${repo}`
      const markdown = score !== undefined ? generateBadgeMarkdown(owner, repo, score) : ''
      const color = score !== undefined ? scoreColor(score) : 'lightgrey'

      if (opts.json) {
        console.log(JSON.stringify({
          owner,
          repo,
          score,
          color,
          badgeUrl,
          pageUrl,
          markdown,
        }, null, 2))
      } else {
        console.log('')
        console.log(separator())
        console.log(styleBold('info', '  deep-slop badge'))
        console.log(separator())
        console.log(`  Repo:        ${style('info', `${owner}/${repo}`)}`)
        if (score !== undefined) {
          console.log(`  Score:       ${styleBold(score >= 80 ? 'success' : score >= 50 ? 'warn' : 'danger', String(score))} (${scoreLabel(score)})`)
        }
        console.log(`  Color:       ${color}`)
        console.log(`  Badge URL:   ${style('suggestion', badgeUrl)}`)
        console.log(`  Page URL:    ${style('muted', pageUrl)}`)
        if (markdown) {
          console.log(`  Markdown:    ${markdown}`)
        }
        console.log(separator())
        console.log('')
      }
    })
}
