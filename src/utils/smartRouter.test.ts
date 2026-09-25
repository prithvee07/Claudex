import { afterEach, expect, spyOn, test } from 'bun:test'
import { applyRouteDecisionToEnv, SmartRouter, type ProviderDescriptor } from './smartRouter.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function provider(name: string, cost: number): ProviderDescriptor {
  return {
    name,
    pingUrl: `https://${name}.example.test/models`,
    apiKeyEnv: '',
    costPer1kTokens: cost,
    bigModel: 'test-large',
    smallModel: 'test-small',
    baseUrl: `https://${name}.example.test/v1`,
  }
}

for (const status of [401, 403]) {
  test(`routes to a healthy alternative when the cheaper provider returns ${status}`, async () => {
    const rejected = provider('rejected', 0)
    const healthy = provider('healthy', 1)
    globalThis.fetch = (async input => new Response(null, {
      status: String(input) === rejected.pingUrl ? status : 200,
    })) as typeof fetch
    const router = new SmartRouter({
      descriptors: [rejected, healthy],
      strategy: 'cost',
    })

    const decision = await router.route([])

    expect(decision.provider).toBe('healthy')
    expect(router.status().find(state => state.provider === 'rejected')).toMatchObject({
      healthy: false,
      score: 'N/A',
    })
  })

  test(`reports no providers available when the only provider returns ${status}`, async () => {
    globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const router = new SmartRouter({ descriptors: [provider('rejected', 0)] })
      await expect(router.route([])).rejects.toThrow('no providers available')
    } finally {
      warning.mockRestore()
    }
  })
}

test('recovery re-check gives a tripped provider a fresh error window', async () => {
  const target = provider('flaky', 0)
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch

  const originalSetTimeout = globalThis.setTimeout
  // Capture the scheduled 60s recovery re-check instead of letting it fire,
  // so the test can inspect the tripped state before triggering it manually.
  let recoveryFn: (() => unknown) | undefined
  globalThis.setTimeout = ((fn: () => unknown) => {
    recoveryFn = fn
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  try {
    const router = new SmartRouter({ descriptors: [target] })
    await router.route([]) // initializes — one healthy ping, 0 requests/errors recorded

    // Trip unhealthy: 3 failed requests at a 100% error rate.
    await router.recordResult('flaky', false, 100)
    await router.recordResult('flaky', false, 100)
    await router.recordResult('flaky', false, 100)

    expect(router.status().find(s => s.provider === 'flaky')).toMatchObject({
      healthy: false,
      requests: 3,
      errors: 3,
    })

    await recoveryFn?.()

    expect(router.status().find(s => s.provider === 'flaky')).toMatchObject({
      healthy: true,
      requests: 0,
      errors: 0,
    })
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test('applyRouteDecisionToEnv clears a conflicting provider flag left by a prior profile', () => {
  const env: NodeJS.ProcessEnv = {
    CLAUDE_CODE_USE_GEMINI: '1',
    GEMINI_API_KEY: 'stale-gemini-key',
    UNRELATED_VAR: 'kept',
  }

  applyRouteDecisionToEnv(env, {
    provider: 'openai',
    model: 'gpt-4o',
    env: {
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_MODEL: 'gpt-4o',
      OPENAI_API_KEY: 'sk-live',
    },
  })

  expect(env.CLAUDE_CODE_USE_GEMINI).toBeUndefined()
  expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1')
  expect(env.OPENAI_API_KEY).toBe('sk-live')
  expect(env.UNRELATED_VAR).toBe('kept')
})

test('applyRouteDecisionToEnv clears a stale model from a prior profile of a different provider', () => {
  // Reproduces a live bug: getUserSpecifiedModelSetting() (model.ts) checks
  // NVIDIA_MODEL before OPENAI_MODEL, so a saved NVIDIA profile's leftover
  // NVIDIA_MODEL survived a route() decision to Ollama — the provider
  // switched correctly (new base URL/key) but the request still asked for
  // NVIDIA's model name, which the new provider didn't have.
  const env: NodeJS.ProcessEnv = {
    CLAUDE_CODE_USE_NVIDIA: '1',
    NVIDIA_API_KEY: 'stale-nvidia-key',
    NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
    NVIDIA_MODEL: 'moonshotai/kimi-k2-instruct',
  }

  applyRouteDecisionToEnv(env, {
    provider: 'ollama',
    model: 'llama3.1:8b',
    env: {
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      OPENAI_MODEL: 'llama3.1:8b',
    },
  })

  expect(env.NVIDIA_MODEL).toBeUndefined()
  expect(env.NVIDIA_API_KEY).toBeUndefined()
  expect(env.NVIDIA_BASE_URL).toBeUndefined()
  expect(env.OPENAI_MODEL).toBe('llama3.1:8b')
})
