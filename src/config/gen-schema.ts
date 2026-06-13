/**
 * CLI script that generates the JSON Schema for deep-slop configuration
 * and writes it to stdout.
 *
 * Usage:
 *   node dist/config/gen-schema.js > schema/deep-slop.config.schema.json
 */
import { generateJsonSchema } from './json-schema.js'

const schema = generateJsonSchema()
console.log(JSON.stringify(schema, null, 2))

