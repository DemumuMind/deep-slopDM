// This file intentionally contains AI slop patterns for E2E testing.
// Each pattern is designed to trigger a specific deep-slop rule.

import { unusedHelper } from './helpers'
import { unusedHelper as dupHelper } from './helpers'
import { SomeType } from './types'
import * as barrelImport from './barrel'

// Narrative comment: explains what the code does step by step
// First we initialize the configuration object with default values
// Then we validate the inputs to ensure they meet our requirements
// Finally we return the processed result to the caller
function processItems(items: string[]): number {
  // We need to iterate over each item and count valid ones
  let count = 0
  for (const item of items) {
    // Check if the item is valid before counting it
    if (item.length > 0) {
      count++
    }
  }
  return count
}

// Empty catch block - swallowed exception pattern
function loadConfig(): void {
  try {
    const data = JSON.parse('{"key": "value"}')
    console.log('Loaded config:', data)
  } catch {
    // intentionally empty - AI slop pattern
  }
}

// Console.log leftover from debugging
function calculateTotal(values: number[]): number {
  console.log('Calculating total for:', values)
  return values.reduce((sum, v) => sum + v, 0)
}

// as any cast - type safety bypass
function getData(): any {
  const result = fetchData() as any
  return result
}

// Hardcoded config values - should be in config file
const API_URL = 'https://api.example.com/v1'
const API_KEY = 'sk-abc123def456'
const TIMEOUT_MS = 5000

// Another as any for good measure
function transform(input: unknown): string {
  const data = input as any
  return data.value
}

// TODO stub - AI placeholder
// TODO: Implement proper error handling here

// Generic name - data, item, result, info
function processData(data: any): any {
  const item = data.items[0] as any
  return item
}

// Defensive typeof check pattern
function checkValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return String(value)
}

// Duplicate code block - same logic repeated
function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

function validateEmailAgain(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

// Decorative comment
// ==================== HELPER FUNCTIONS ====================

// Trivial comment restating the obvious
// Returns true if the value is true
function isTrue(val: boolean): boolean {
  return val === true
}

function fetchData(): unknown {
  return { value: 'test' }
}
