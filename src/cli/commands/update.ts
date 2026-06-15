import { execSync } from 'node:child_process'
import type { Command } from 'commander'
import { APP_VERSION } from '../../version.js'
import { style, styleBold, separator } from '../../output/theme.js'

export function register(program: Command): void {
  program
    .command('update')
    .description('Check for and install deep-slop updates')
    .option('--check', 'Only check, do not install')
    .action(async (opts: Record<string, any>) => {
      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop update'))
      console.log(separator())
      console.log('')
      console.log(`  Current version: ${APP_VERSION}`)

      try {
        const latest = execSync('npm view deep-slop version 2>/dev/null', { encoding: 'utf8' }).trim()
        if (!latest) {
          console.log(style('warn', '  Could not fetch latest version from npm registry'))
          console.log(style('muted', '  Make sure npm is available and you have network access'))
          process.exit(1)
        }

        console.log(`  Latest version:  ${latest}`)

        if (latest === APP_VERSION) {
          console.log(style('suggestion', '  Already up to date!'))
          process.exit(0)
        }

        if (opts.check) {
          console.log(style('warn', `  Update available: ${APP_VERSION} → ${latest}`))
          console.log(style('muted', '  Run `deep-slop update` (without --check) to install'))
          process.exit(0)
        }

        console.log(style('info', `  Updating deep-slop from ${APP_VERSION} to ${latest}...`))

        const isGlobal = execSync('npm list -g deep-slop --depth=0 2>/dev/null', { encoding: 'utf8' }).includes('deep-slop')
        const installCmd = isGlobal
          ? 'npm update -g deep-slop'
          : 'npm install -g deep-slop'

        console.log(style('muted', `  Running: ${installCmd}`))
        execSync(installCmd, { stdio: 'inherit' })

        console.log('')
        console.log(style('suggestion', `  Updated successfully: ${APP_VERSION} → ${latest}`))
        console.log(style('muted', '  Restart your terminal to use the new version'))
      } catch (err: any) {
        if (err.message?.includes('ENOENT')) {
          console.log(style('danger', '  npm is not available. Install Node.js first: https://nodejs.org'))
        } else {
          console.log(style('danger', `  Update failed: ${err.message}`))
          console.log(style('muted', '  Try manually: npm update -g deep-slop'))
        }
        process.exit(1)
      }
    })
}
