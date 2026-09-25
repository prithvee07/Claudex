import { afterEach, expect, spyOn, test } from 'bun:test'
import { SmartRouter, type ProviderDescriptor } from './smartRouter.js'

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
