import { describe, it, expect } from 'vitest'
import { detectHtmlSafety } from './html-safety.js'

describe('html-safety', () => {
  describe('detectHtmlSafety', () => {
    it('detects innerHTML assignment', () => {
      const diags = detectHtmlSafety('src/app.ts', [
        { num: 5, text: 'el.innerHTML = userInput' },
      ])
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].rule).toBe('security-deep/unsafe-html')
      expect(diags[0].severity).toBe('error')
    })

    it('detects dangerouslySetInnerHTML in JSX', () => {
      const diags = detectHtmlSafety('src/Component.tsx', [
        { num: 10, text: '<div dangerouslySetInnerHTML={{ __html: raw }} />' },
      ])
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].rule).toBe('security-deep/xss-risk')
    })

    it('detects v-html in Vue files', () => {
      const diags = detectHtmlSafety('src/App.vue', [
        { num: 3, text: '<div v-html="rawContent"></div>' },
      ])
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].detail?.fileContext).toBe('vue')
    })

    it('detects document.write', () => {
      const diags = detectHtmlSafety('src/legacy.js', [
        { num: 1, text: 'document.write(htmlContent)' },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('detects innerHTML with template literal interpolation', () => {
      const diags = detectHtmlSafety('src/app.ts', [
        { num: 7, text: 'el.innerHTML = `<div>${userInput}</div>`' },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('detects insertAdjacentHTML', () => {
      const diags = detectHtmlSafety('src/app.ts', [
        { num: 12, text: 'el.insertAdjacentHTML("beforeend", html)' },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('skips comment lines', () => {
      const diags = detectHtmlSafety('src/app.ts', [
        { num: 1, text: '// el.innerHTML = userInput' },
        { num: 2, text: '/* document.write(stuff) */' },
      ])
      expect(diags).toHaveLength(0)
    })

    it('returns empty for empty lines array', () => {
      expect(detectHtmlSafety('src/app.ts', [])).toHaveLength(0)
    })

    it('sets jsx fileContext for .tsx files', () => {
      const diags = detectHtmlSafety('src/Comp.tsx', [
        { num: 1, text: 'el.innerHTML = data' },
      ])
      expect(diags[0].detail?.fileContext).toBe('jsx')
    })

    it('sets generic fileContext for regular .ts files', () => {
      const diags = detectHtmlSafety('src/app.ts', [
        { num: 1, text: 'el.innerHTML = data' },
      ])
      expect(diags[0].detail?.fileContext).toBe('generic')
    })
  })
})
