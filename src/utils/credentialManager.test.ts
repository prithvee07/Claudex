import { afterEach, expect, test } from 'bun:test'
import { selectMostRecentCredentials, storeProviderCredentials } from './credentialManager.js'

const ENV_KEYS_TO_RESTORE = [
  'NODE_ENV',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_NVIDIA',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'NVIDIA_API_KEY',
] as const
const originalEnv: Record<string, string | undefined> = {}
for (const key of ENV_KEYS_TO_RESTORE) originalEnv[key] = process.env[key]

afterEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

test('selectMostRecentCredentials picks the latest storedAt entry', () => {
  const result = selectMostRecentCredentials({
    openai: { apiKey: 'sk-old', storedAt: '2026-01-01T00:00:00.000Z' },
    gemini: { apiKey: 'gem-new', storedAt: '2026-06-01T00:00:00.000Z' },
  })

  expect(result?.[0]).toBe('gemini')
  expect(result?.[1].apiKey).toBe('gem-new')
})

test('selectMostRecentCredentials returns undefined for no credentials', () => {
  expect(selectMostRecentCredentials(undefined)).toBeUndefined()
  expect(selectMostRecentCredentials({})).toBeUndefined()
})

test('selectMostRecentCredentials skips entries with no apiKey', () => {
  const result = selectMostRecentCredentials({
    openai: { apiKey: '', storedAt: '2026-06-01T00:00:00.000Z' },
    gemini: { apiKey: 'gem-key', storedAt: '2026-01-01T00:00:00.000Z' },
  } as Record<string, { apiKey: string; storedAt: string }>)

  expect(result?.[0]).toBe('gemini')
})

test('storeProviderCredentials clears the previous provider env when switching', () => {
  process.env.NODE_ENV = 'test'
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_API_KEY = 'sk-old'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'

  storeProviderCredentials({ provider: 'nvidia', apiKey: 'nvapi-new' })

  expect(process.env.CLAUDE_CODE_USE_OPENAI).toBeUndefined()
  expect(process.env.OPENAI_API_KEY).toBeUndefined()
  expect(process.env.OPENAI_BASE_URL).toBeUndefined()
  expect(process.env.CLAUDE_CODE_USE_NVIDIA).toBe('1')
  expect(process.env.NVIDIA_API_KEY).toBe('nvapi-new')
})
