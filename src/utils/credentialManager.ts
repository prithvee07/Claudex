/**
 * Unified Credential Manager for Claudex
 * 
 * Provides a consistent interface for storing and retrieving API credentials
 * across all providers. Credentials are stored in:
 * 1. Global config (encrypted) for persistence
 * 2. Environment variables for current session
 * 3. Profile file for provider-specific settings
 */

import { getGlobalConfig, saveGlobalConfig } from './config.js'
import { loadProfileFile, saveProfileFile, createProfileFile, type ProviderProfile, type ProfileEnv } from './providerProfile.js'

export type ProviderCredentialType = 
  | 'anthropic_api_key'
  | 'openai_api_key'
  | 'gemini_api_key'
  | 'nvidia_api_key'
  | 'codex_api_key'

export interface ProviderCredentials {
  provider: ProviderProfile | 'anthropic' | 'openrouter'
  apiKey?: string
  baseUrl?: string
  model?: string
}

const CREDENTIAL_KEY_MAP: Record<string, string> = {
  'anthropic': 'ANTHROPIC_API_KEY',
  'openai': 'OPENAI_API_KEY',
  'openrouter': 'OPENAI_API_KEY',
  'gemini': 'GEMINI_API_KEY',
  'nvidia': 'NVIDIA_API_KEY',
  'codex': 'CODEX_API_KEY',
  'ollama': 'OPENAI_API_KEY',
}

const PROVIDER_FLAG_MAP: Record<string, string> = {
  'anthropic': '',
  'openai': 'CLAUDE_CODE_USE_OPENAI',
  'openrouter': 'CLAUDE_CODE_USE_OPENAI',
  'gemini': 'CLAUDE_CODE_USE_GEMINI',
  'nvidia': 'CLAUDE_CODE_USE_NVIDIA',
  'codex': 'CLAUDE_CODE_USE_OPENAI',
  'ollama': 'CLAUDE_CODE_USE_OPENAI',
}

// Every env var any provider branch below can set. Cleared before applying
// a newly selected provider's env so a previous provider's flag, key,
// base URL, or model can't linger and get picked up by the shim's `??=`
// fallback logic (which only fills in unset vars, so a stale value wins).
const OTHER_PROVIDER_ENV_VARS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_NVIDIA',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  'GEMINI_MODEL',
  'NVIDIA_API_KEY',
  'NVIDIA_BASE_URL',
  'NVIDIA_MODEL',
  'CODEX_API_KEY',
] as const

/**
 * Store credentials for a provider
 * This saves to both global config and the profile file
 */
export function storeProviderCredentials(credentials: ProviderCredentials): void {
  const { provider, apiKey, baseUrl, model } = credentials
  
  // Save API key to global config for persistence
  if (apiKey) {
    saveGlobalConfig(current => ({
      ...current,
      providerCredentials: {
        ...current.providerCredentials,
        [provider]: {
          apiKey,
          storedAt: new Date().toISOString(),
        }
      }
    }))
  }
  
  // Build profile environment
  const env: ProfileEnv = {}
  
  // Set provider flag
  const providerFlag = PROVIDER_FLAG_MAP[provider]
  if (providerFlag) {
    env[providerFlag as keyof ProfileEnv] = '1'
  }
  
  // Set API key
  const apiKeyField = CREDENTIAL_KEY_MAP[provider]
  if (apiKey && apiKeyField) {
    ;(env as Record<string, string>)[apiKeyField] = apiKey
  }
  
  // Set base URL
  if (baseUrl) {
    if (provider === 'nvidia') {
      env.NVIDIA_BASE_URL = baseUrl
    } else if (provider === 'gemini') {
      env.GEMINI_BASE_URL = baseUrl
    } else {
      env.OPENAI_BASE_URL = baseUrl
    }
  }
  
  // Set model
  if (model) {
    if (provider === 'nvidia') {
      env.NVIDIA_MODEL = model
    } else if (provider === 'gemini') {
      env.GEMINI_MODEL = model
    } else {
      env.OPENAI_MODEL = model
    }
  }
  
  // Clear every other provider's flag/key/base-url/model first — otherwise
  // switching provider mid-session (e.g. OpenAI -> NVIDIA via /provider)
  // leaves the old provider's OPENAI_API_KEY/OPENAI_BASE_URL sitting in
  // process.env, and the shim's `??=` fallback logic (client.ts) treats
  // them as already-set and never overwrites them with the new provider's
  // values — the next request silently goes out with the old provider's
  // credentials and endpoint.
  for (const key of OTHER_PROVIDER_ENV_VARS) {
    delete process.env[key]
  }

  // Also set in current process environment for immediate use
  Object.entries(env).forEach(([key, value]) => {
    if (value) {
      process.env[key] = value
    }
  })
  
  // Map provider to profile type
  let profileType: ProviderProfile
  switch (provider) {
    case 'anthropic':
    case 'openai':
    case 'openrouter':
      profileType = 'openai'
      break
    case 'gemini':
      profileType = 'gemini'
      break
    case 'nvidia':
      profileType = 'nvidia'
      break
    case 'codex':
      profileType = 'codex'
      break
    case 'ollama':
      profileType = 'ollama'
      break
    default:
      profileType = 'openai'
  }
  
  // Save to profile file
  const profileFile = createProfileFile(profileType, env)
  saveProfileFile(profileFile)
}

/**
 * Retrieve stored credentials for a provider
 */
export function getProviderCredentials(provider: string): { apiKey?: string; baseUrl?: string; model?: string } | null {
  const config = getGlobalConfig()
  const stored = config.providerCredentials?.[provider]
  
  if (!stored?.apiKey) {
    return null
  }
  
  // Also check profile file for baseUrl and model
  const profile = loadProfileFile()
  if (profile) {
    return {
      apiKey: stored.apiKey,
      baseUrl: profile.env.NVIDIA_BASE_URL || profile.env.GEMINI_BASE_URL || profile.env.OPENAI_BASE_URL,
      model: profile.env.NVIDIA_MODEL || profile.env.GEMINI_MODEL || profile.env.OPENAI_MODEL,
    }
  }
  
  return { apiKey: stored.apiKey }
}

/**
 * Check if credentials exist for a provider
 */
export function hasProviderCredentials(provider: string): boolean {
  const config = getGlobalConfig()
  return !!config.providerCredentials?.[provider]?.apiKey
}

/**
 * Clear credentials for a provider
 */
export function clearProviderCredentials(provider: string): void {
  saveGlobalConfig(current => {
    const { [provider]: _, ...rest } = current.providerCredentials || {}
    return {
      ...current,
      providerCredentials: rest
    }
  })
}

/**
 * Picks the most recently stored provider's credentials from the
 * accumulated providerCredentials record. Every `/provider` run adds an
 * entry here and none are ever removed, so a user who has configured more
 * than one provider over time has all of them sitting in this record —
 * picking one deterministically (instead of applying every one) avoids two
 * different providers' flags (e.g. CLAUDE_CODE_USE_OPENAI and
 * CLAUDE_CODE_USE_GEMINI) ending up set simultaneously.
 */
export function selectMostRecentCredentials(
  credentials: Record<string, { apiKey: string; storedAt: string }> | undefined,
): [string, { apiKey: string; storedAt: string }] | undefined {
  if (!credentials) return undefined
  return Object.entries(credentials)
    .filter((entry): entry is [string, { apiKey: string; storedAt: string }] => !!entry[1]?.apiKey)
    .sort(([, a], [, b]) => b.storedAt.localeCompare(a.storedAt))[0]
}

/**
 * Apply stored credentials to environment
 * Call this at startup to ensure credentials are loaded
 */
export function applyStoredCredentials(): void {
  const config = getGlobalConfig()
  const mostRecent = selectMostRecentCredentials(config.providerCredentials)

  if (mostRecent) {
    const [provider, creds] = mostRecent
    const apiKeyField = CREDENTIAL_KEY_MAP[provider]
    if (apiKeyField) {
      process.env[apiKeyField] = creds.apiKey
    }

    // Also set provider flag
    const providerFlag = PROVIDER_FLAG_MAP[provider]
    if (providerFlag) {
      process.env[providerFlag] = '1'
    }
  }

  // Also load from profile file if exists
  const profile = loadProfileFile()
  if (profile?.env) {
    Object.entries(profile.env).forEach(([key, value]) => {
      if (value) {
        process.env[key] = value
      }
    })
  }
}
