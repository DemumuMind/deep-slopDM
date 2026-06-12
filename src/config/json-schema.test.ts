import { describe, it, expect } from 'vitest'
import { generateJsonSchema } from './json-schema.js'

describe('json-schema', () => {
  describe('generateJsonSchema', () => {
    it('returns an object without throwing', () => {
      expect(() => generateJsonSchema()).not.toThrow()
      const schema = generateJsonSchema()
      expect(schema).toBeDefined()
      expect(typeof schema).toBe('object')
    })

    it('serializes to valid JSON', () => {
      const schema = generateJsonSchema()
      const json = JSON.stringify(schema)
      expect(() => JSON.parse(json)).not.toThrow()
    })
  })
})
