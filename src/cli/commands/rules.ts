import type { Command } from 'commander'
import { getCatalog, findRule, type RuleInfo } from '../../engines/catalog.js'
import { style, styleBold, separator, severityBadge } from '../../output/theme.js'
import { printRuleList } from '../shared.js'

export function register(program: Command): void {
  program
    .command('rules')
    .description('List all available rules, search, or show rule details')
    .argument('[rule-id]', 'Specific rule ID to show details for')
    .option('--search <query>', 'Fuzzy search rules by name or description')
    .action((ruleId: string | undefined, opts: Record<string, any>) => {
      if (ruleId && !opts.search) {
        const catalog = getCatalog()
        const rule = catalog.find((r) => r.id === ruleId)

        if (!rule) {
          const matches = findRule(ruleId)
          console.log(style('danger', `  Rule not found: ${ruleId}`))
          if (matches.length > 0) {
            console.log(style('muted', '  Did you mean one of these?'))
            for (const m of matches.slice(0, 5)) {
              console.log(`    ${style('info', m.id)}  ${m.description}`)
            }
          }
          console.log('')
          process.exit(1)
        }

        const slug = rule.id.replace(/\//g, '-').replace(/[^a-z0-9-]/g, '')
        const docUrl = `https://github.com/DemumuMind/deep-slopDM/wiki/rules#${slug}`

        console.log('')
        console.log(separator())
        console.log(styleBold('info', `  Rule: ${rule.description}`))
        console.log(separator())
        console.log(`  ID:            ${style('suggestion', rule.id)}`)
        console.log(`  Engine:        ${style('info', rule.engine)}`)
        console.log(`  Severity:      ${severityBadge(rule.severity)}`)
        console.log(`  Impact Tier:   ${style('info', rule.impactTier)}`)
        console.log(`  Fixable:       ${rule.fixable ? style('success', 'yes') : style('muted', 'no')}`)
        console.log(`  Help:          ${rule.help}`)
        console.log(`  Docs:          ${style('muted', docUrl)}`)
        console.log(separator())
        console.log('')
        return
      }

      if (opts.search) {
        const matches = findRule(opts.search)
        if (matches.length === 0) {
          console.log(style('muted', `  No rules matching "${opts.search}"`))
          console.log('')
          return
        }
        console.log('')
        console.log(styleBold('info', `  Search results for "${opts.search}" (${matches.length} rules):`))
        console.log('')
        printRuleList(matches)
        console.log('')
        return
      }

      const catalog = getCatalog()
      const byEngine = new Map<string, RuleInfo[]>()
      for (const rule of catalog) {
        const list = byEngine.get(rule.engine) ?? []
        list.push(rule)
        byEngine.set(rule.engine, list)
      }

      console.log('')
      console.log(styleBold('info', `  deep-slop rules (${catalog.length} rules across ${byEngine.size} engines):`))
      console.log('')

      for (const [engine, rules] of byEngine) {
        console.log(`  ${styleBold('info', engine)} ${style('muted', `(${rules.length} rules)`)}`)
        printRuleList(rules, '    ')
        console.log('')
      }
    })
}
