import { zodToJsonSchema } from 'zod-to-json-schema'
import { DeepSlopConfigSchema } from './schema.js'

/**
 * Generate a JSON Schema (draft-07) from the DeepSlopConfigSchema Zod schema.
 * This can be used for editor autocomplete, validation, and documentation.
 */
export function generateJsonSchema(): object {
  return zodToJsonSchema(DeepSlopConfigSchema as any, {
    target: 'draft-07',
    $refStrategy: 'root',
    definitionPath: 'definitions',
  } as any)
}

