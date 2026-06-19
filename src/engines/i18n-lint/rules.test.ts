import { describe, it, expect } from 'vitest'
import {
  detectHardcodedStringJsx,
  detectHardcodedStringProps,
  detectLocaleMismatch,
  detectMissingTranslationKeys,
  detectUntranslatedLocale,
} from './rules.js'
import type { LocaleData } from './helpers.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('i18n-lint rules', () => {
  describe('detectHardcodedStringJsx', () => {
    it('flags hardcoded JSX text', () => {
      const content = '<div>Hello World</div>'
      const result = detectHardcodedStringJsx(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('i18n-lint/hardcoded-string-jsx')
      expect(result[0].message).toContain('Hello World')
    })

    it('skips technical single words and whitespace', () => {
      const content = `<div>OK</div>
<span> </span>
<p>api</p>`
      const result = detectHardcodedStringJsx(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(0)
    })

    it('does not flag dynamic expressions', () => {
      const content = '<div>{t("greeting")}</div>'
      const result = detectHardcodedStringJsx(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(0)
    })
  })

  describe('detectHardcodedStringProps', () => {
    it('flags hardcoded placeholder prop', () => {
      const content = '<input placeholder="Enter your name" />'
      const result = detectHardcodedStringProps(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('i18n-lint/hardcoded-string-props')
      expect(result[0].message).toContain('placeholder')
    })

    it('flags hardcoded title prop', () => {
      const content = '<button title="Submit the form">Send</button>'
      const result = detectHardcodedStringProps(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].message).toContain('title')
    })

    it('skips empty or technical alt values', () => {
      const content = '<img alt="spacer" src="x.png" />'
      const result = detectHardcodedStringProps(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(0)
    })
  })

  describe('detectMissingTranslationKeys', () => {
    it('reports keys missing from all locales', () => {
      const content = "t('missing.key')"
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['other']), filePath: '/tmp/en.json' },
      ]
      const result = detectMissingTranslationKeys(content, lines(content), 'page.tsx', locales)
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('i18n-lint/missing-translation-key')
      expect(result[0].message).toContain('not found in any locale file')
    })

    it('reports keys missing from some locales', () => {
      const content = "t('partial.key')"
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['partial.key']), filePath: '/tmp/en.json' },
        { locale: 'fr', keys: new Set(['other']), filePath: '/tmp/fr.json' },
      ]
      const result = detectMissingTranslationKeys(content, lines(content), 'page.tsx', locales)
      expect(result).toHaveLength(1)
      expect(result[0].message).toContain('fr')
    })

    it('returns empty when all locales contain the key', () => {
      const content = "t('found.key')"
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['found.key']), filePath: '/tmp/en.json' },
        { locale: 'fr', keys: new Set(['found.key']), filePath: '/tmp/fr.json' },
      ]
      const result = detectMissingTranslationKeys(content, lines(content), 'page.tsx', locales)
      expect(result).toHaveLength(0)
    })

    it('returns empty when no locales are provided', () => {
      const content = "t('any.key')"
      const result = detectMissingTranslationKeys(content, lines(content), 'page.tsx', [])
      expect(result).toHaveLength(0)
    })
  })

  describe('detectLocaleMismatch', () => {
    it('flags direct import of locale JSON', () => {
      const content = "import messages from './ru.json'"
      const result = detectLocaleMismatch(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('i18n-lint/locale-mismatch')
      expect(result[0].message).toContain('ru.json')
    })

    it('flags hardcoded locale prop', () => {
      const content = '<DatePicker locale="ru" />'
      const result = detectLocaleMismatch(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].message).toContain('locale="ru"')
    })

    it('skips i18n config lines for locale prop', () => {
      const content = 'i18n.use(initReactI18next).init({ locale: "en" })'
      const result = detectLocaleMismatch(content, lines(content), 'i18n.ts')
      expect(result).toHaveLength(0)
    })

    it('flags require of locale file', () => {
      const content = "const msgs = require('./de.json')"
      const result = detectLocaleMismatch(content, lines(content), 'page.tsx')
      expect(result).toHaveLength(1)
      expect(result[0].message).toContain('de.json')
    })
  })

  describe('detectUntranslatedLocale', () => {
    it('reports keys missing from other locales', () => {
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['hello', 'world']), filePath: '/tmp/en.json' },
        { locale: 'fr', keys: new Set(['hello']), filePath: '/tmp/fr.json' },
      ]
      const result = detectUntranslatedLocale(locales, '/tmp')
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('i18n-lint/untranslated-locale')
      expect(result[0].message).toContain('world')
    })

    it('returns empty when locales are identical', () => {
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['hello', 'world']), filePath: '/tmp/en.json' },
        { locale: 'fr', keys: new Set(['hello', 'world']), filePath: '/tmp/fr.json' },
      ]
      const result = detectUntranslatedLocale(locales, '/tmp')
      expect(result).toHaveLength(0)
    })

    it('returns empty with fewer than two locales', () => {
      const locales: LocaleData[] = [
        { locale: 'en', keys: new Set(['hello']), filePath: '/tmp/en.json' },
      ]
      const result = detectUntranslatedLocale(locales, '/tmp')
      expect(result).toHaveLength(0)
    })
  })
})
