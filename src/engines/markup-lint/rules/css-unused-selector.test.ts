import { describe, it, expect, afterAll } from 'vitest'
import { detectCssUnusedSelector } from './css-unused-selector.js'
import { makeContext, tempDir, writeFile, cleanup } from '../../test-utils.js'

describe('css-unused-selector', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('reports unused class and id selectors', async () => {
    const cssPath = 'app.css'
    const css = `.unused-class {
  color: red;
}
#unused-id {
  margin: 0;
}`
    writeFile(dir, 'app.css', css)
    const htmlPath = writeFile(dir, 'app.html', `<div class="active">x</div>`)
    const ctx = makeContext(dir)
    ctx.files = [htmlPath]
    const result = await detectCssUnusedSelector(css, css.split('\n').map((text, i) => ({ num: i + 1, text })), cssPath, ctx)
    expect(result).toHaveLength(2)
    const rules = result.map((d) => d.rule)
    expect(rules).toContain('css/unused-selector')
    const messages = result.map((d) => d.message)
    expect(messages).toContain('CSS class .unused-class not found in any HTML/JSX file')
    expect(messages).toContain('CSS id #unused-id not found in any HTML/JSX file')
  })

  it('does not flag selectors that are used in HTML/JSX', async () => {
    const cssPath = 'app.css'
    const css = `.used {
  color: red;
}
#also-used {
  margin: 0;
}`
    const htmlPath = writeFile(dir, 'app.html', `<div class="used" id="also-used">x</div>`)
    const ctx = makeContext(dir)
    ctx.files = [htmlPath]
    const result = await detectCssUnusedSelector(css, css.split('\n').map((text, i) => ({ num: i + 1, text })), cssPath, ctx)
    expect(result).toHaveLength(0)
  })

  it('returns empty when no HTML/JSX files exist', async () => {
    const cssPath = 'app.css'
    const css = `.lonely {
  color: red;
}`
    const ctx = makeContext(dir)
    ctx.files = []
    const result = await detectCssUnusedSelector(css, css.split('\n').map((text, i) => ({ num: i + 1, text })), cssPath, ctx)
    expect(result).toHaveLength(0)
  })
})
