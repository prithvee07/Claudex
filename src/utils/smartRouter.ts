/**
 * SmartRouter — startup-time provider auto-selection for Claudex.
 *
 * When ROUTER_MODE=smart, src/entrypoints/cli.tsx pings every configured
 * provider once at startup, scores them by latency/cost/health, and sets
 * that session's provider env vars (applyRouteDecisionToEnv) to the winner.
 *
 * ponytail: this is session-scoped, not per-request. `route()` and
 * `recordResult()` support re-scoring per message and reacting to live
 * failures, but nothing calls them after startup — env vars are read from
 * mutable global `process.env` throughout the shim, and Claudex can run
 * sub-agents concurrently in-process (src/utils/swarm/), so re-routing
 * mid-session by mutating process.env would let one in-flight request's
 * provider choice leak into another's. `fallbackEnabled`/ROUTER_FALLBACK is
 * likewise stored but unused — no automatic mid-session retry to a
 * different provider. Upgrade path: thread the routed env through
 * AsyncLocalStorage (or explicit params) instead of process.env so each
 * request can carry its own provider choice safely, then call route()/
 * recordResult() per request from claude.ts's withRetry getClient closure.
 *
 * Usage:
 *   const router = new SmartRouter()
 *   const decision = await router.route(messages, 'claude-sonnet') // self-initializes
 *   applyRouteDecisionToEnv(process.env, decision)
 *
 * Environment variables:
 *   ROUTER_MODE=smart          — enable smart routing (default: fixed)
 *   ROUTER_STRATEGY=latency    — or: cost, balanced (default: balanced)
 */

export type RouterStrategy = 'latency' | 'cost' | 'balanced'

export interface ProviderDescriptor {
  name: string
  /** URL used to check health / measure latency */
  pingUrl: string
  /** env var name for the API key (empty string = no key needed) */
  apiKeyEnv: string
  /** estimated cost USD per 1k tokens */
  costPer1kTokens: number
  /** model for sonnet/large requests */
  bigModel: string
  /** model for haiku/small requests */
  smallModel: string
  /** base URL for the OpenAI-compatible endpoint */
  baseUrl: string
  /** set CLAUDE_CODE_USE_GEMINI instead of CLAUDE_CODE_USE_OPENAI */
  useGemini?: boolean
}

export interface ProviderState {
  descriptor: ProviderDescriptor
  latencyMs: number
  healthy: boolean
  requestCount: number
  errorCount: number
  avgLatencyMs: number
}

export interface RouteDecision {
  provider: string
  model: string
  /** env vars to apply before launching the CLI */
  env: Record<string, string>
}

export interface ProviderStatus {
  provider: string
  healthy: boolean
  configured: boolean
  latencyMs: number
  costPer1k: number
  requests: number
  errors: number
  errorRate: string
  score: number | 'N/A'
}

// ── Default provider catalogue ────────────────────────────────────────────────

function buildDefaultDescriptors(): ProviderDescriptor[] {
  const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
  const atomicChatUrl = process.env.ATOMIC_CHAT_BASE_URL ?? 'http://127.0.0.1:1337'
  const nvidiaUrl = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1'

  return [
    {
      name: 'openai',
      pingUrl: 'https://api.openai.com/v1/models',
      apiKeyEnv: 'OPENAI_API_KEY',
      costPer1kTokens: 0.002,
      bigModel: process.env.BIG_MODEL ?? 'gpt-4o',
      smallModel: process.env.SMALL_MODEL ?? 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
    },
    {
      name: 'gemini',
      pingUrl: 'https://generativelanguage.googleapis.com/v1/models',
      apiKeyEnv: 'GEMINI_API_KEY',
      costPer1kTokens: 0.0005,
      bigModel: process.env.BIG_MODEL ?? 'gemini-2.5-pro-preview-03-25',
      smallModel: process.env.SMALL_MODEL ?? 'gemini-2.0-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      useGemini: true,
    },
    {
      name: 'nvidia',
      pingUrl: `${nvidiaUrl}/models`,
      apiKeyEnv: 'NVIDIA_API_KEY',
      costPer1kTokens: 0.0008,
      bigModel: process.env.BIG_MODEL ?? 'moonshotai/kimi-k2-instruct',
      smallModel: process.env.SMALL_MODEL ?? 'meta/llama-3.1-8b-instruct',
      baseUrl: nvidiaUrl,
    },
    {
      name: 'ollama',
      pingUrl: `${ollamaUrl}/api/tags`,
      apiKeyEnv: '',
      costPer1kTokens: 0,
      bigModel: process.env.BIG_MODEL ?? 'llama3.1:8b',
      smallModel: process.env.SMALL_MODEL ?? 'llama3.1:8b',
      baseUrl: `${ollamaUrl}/v1`,
    },
    {
      name: 'atomic-chat',
      pingUrl: `${atomicChatUrl}/v1/models`,
      apiKeyEnv: '',
      costPer1kTokens: 0,
      bigModel: process.env.BIG_MODEL ?? 'llama3.1:8b',
      smallModel: process.env.SMALL_MODEL ?? 'llama3.1:8b',
      baseUrl: `${atomicChatUrl}/v1`,
    },
  ]
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function isConfigured(state: ProviderState): boolean {
  const { descriptor } = state
  if (!descriptor.apiKeyEnv) return true // local provider — no key needed
  return Boolean(process.env[descriptor.apiKeyEnv])
}

function score(state: ProviderState, strategy: RouterStrategy): number {
  if (!state.healthy || !isConfigured(state)) return Infinity

  const errorRate = state.requestCount === 0 ? 0 : state.errorCount / state.requestCount
  const latencyScore = state.avgLatencyMs / 1000
  const costScore = state.descriptor.costPer1kTokens * 100
  const errorPenalty = errorRate * 500

  if (strategy === 'latency') return latencyScore + errorPenalty
  if (strategy === 'cost') return costScore + errorPenalty
  return latencyScore * 0.5 + costScore * 0.5 + errorPenalty
}

// ── SmartRouter ───────────────────────────────────────────────────────────────

export class SmartRouter {
  private states: ProviderState[]
  readonly strategy: RouterStrategy
  readonly fallbackEnabled: boolean
  private initialized = false

  constructor(options?: {
    descriptors?: ProviderDescriptor[]
    strategy?: RouterStrategy
    fallbackEnabled?: boolean
  }) {
    const descriptors = options?.descriptors ?? buildDefaultDescriptors()
    this.states = descriptors.map(d => ({
      descriptor: d,
      latencyMs: 9999,
      healthy: true,
      requestCount: 0,
      errorCount: 0,
      avgLatencyMs: 9999,
    }))
    this.strategy = options?.strategy ?? ((process.env.ROUTER_STRATEGY as RouterStrategy) || 'balanced')
    this.fallbackEnabled = options?.fallbackEnabled ?? (process.env.ROUTER_FALLBACK !== 'false')
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await Promise.allSettled(this.states.map(s => this._pingProvider(s)))
    const available = this.states.filter(s => s.healthy && isConfigured(s))
    if (available.length === 0) {
      console.warn('SmartRouter: no providers available — check your API keys')
    }
    this.initialized = true
  }

  private async _pingProvider(state: ProviderState, isRecoveryCheck = false): Promise<void> {
    if (!isConfigured(state)) {
      state.healthy = false
      return
    }

    const headers: Record<string, string> = {}
    const key = state.descriptor.apiKeyEnv ? process.env[state.descriptor.apiKeyEnv] : undefined
    if (key) headers['Authorization'] = `Bearer ${key}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const start = Date.now()

    try {
      const res = await fetch(state.descriptor.pingUrl, { headers, signal: controller.signal })
      const elapsed = Date.now() - start
      // Preserve 400 reachability checks, but exclude authentication/permission failures.
      if ([200, 400].includes(res.status)) {
        state.healthy = true
        state.latencyMs = elapsed
        // A recovery re-check blends into the EMA built from real request
        // timings instead of overwriting it with one ping. A startup ping
        // (no requests recorded yet) has no EMA to preserve, so set directly.
        state.avgLatencyMs = isRecoveryCheck
          ? 0.3 * elapsed + 0.7 * state.avgLatencyMs
          : elapsed
        if (isRecoveryCheck) {
          // Give the provider a clean error-rate window instead of judging
          // it on the stale count that tripped it unhealthy in the first place.
          state.requestCount = 0
          state.errorCount = 0
        }
      } else {
        state.healthy = false
      }
    } catch {
      state.healthy = false
    } finally {
      clearTimeout(timeout)
    }
  }

  // ── Routing ─────────────────────────────────────────────────────────────────

  async route(
    messages: Array<{ role: string; content: unknown }>,
    claudeModel = 'claude-sonnet',
    excludeProviders: string[] = [],
  ): Promise<RouteDecision> {
    if (!this.initialized) await this.initialize()

    const exclude = new Set(excludeProviders)
    const available = this.states.filter(
      s => s.healthy && isConfigured(s) && !exclude.has(s.descriptor.name),
    )

    if (available.length === 0) {
      throw new Error('SmartRouter: no providers available — check your API keys and provider health')
    }

    const best = available.reduce((a, b) =>
      score(a, this.strategy) <= score(b, this.strategy) ? a : b,
    )

    const isLarge = this._isLargeRequest(messages)
    const isLargeModel = /opus|sonnet|large|big/i.test(claudeModel)
    const model = isLarge || isLargeModel
      ? best.descriptor.bigModel
      : best.descriptor.smallModel

    const env: Record<string, string> = {
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: best.descriptor.baseUrl,
      OPENAI_MODEL: model,
    }

    if (best.descriptor.useGemini) {
      delete env['CLAUDE_CODE_USE_OPENAI']
      env['CLAUDE_CODE_USE_GEMINI'] = '1'
      env['GEMINI_MODEL'] = model
      env['GEMINI_BASE_URL'] = best.descriptor.baseUrl
    }

    const key = best.descriptor.apiKeyEnv ? process.env[best.descriptor.apiKeyEnv] : undefined
    if (key) env['OPENAI_API_KEY'] = key

    return { provider: best.descriptor.name, model, env }
  }

  private _isLargeRequest(messages: Array<{ content: unknown }>): boolean {
    const totalChars = messages.reduce((sum, m) => sum + String(m.content ?? '').length, 0)
    return totalChars > 2000
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  async recordResult(providerName: string, success: boolean, durationMs: number): Promise<void> {
    const state = this.states.find(s => s.descriptor.name === providerName)
    if (!state) return

    state.requestCount++
    if (success) {
      // Exponential moving average (α = 0.3)
      state.avgLatencyMs = 0.3 * durationMs + 0.7 * state.avgLatencyMs
    } else {
      state.errorCount++
      const errorRate = state.errorCount / state.requestCount
      if (state.requestCount >= 3 && errorRate > 0.7) {
        state.healthy = false
        // Re-check after 60 s
        setTimeout(() => this._pingProvider(state, true), 60_000)
      }
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  status(): ProviderStatus[] {
    return this.states.map(s => ({
      provider: s.descriptor.name,
      healthy: s.healthy,
      configured: isConfigured(s),
      latencyMs: Math.round(s.avgLatencyMs * 10) / 10,
      costPer1k: s.descriptor.costPer1kTokens,
      requests: s.requestCount,
      errors: s.errorCount,
      errorRate: `${s.requestCount === 0 ? 0 : Math.round((s.errorCount / s.requestCount) * 100)}%`,
      score: s.healthy && isConfigured(s) ? Math.round(score(s, this.strategy) * 1000) / 1000 : 'N/A',
    }))
  }
}

// Every provider-selection flag route() might set or that a prior saved
// profile might have left behind. Cleared before applying a decision so a
// stale flag from a different provider can't linger alongside the pick.
const PROVIDER_FLAG_ENV_VARS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_NVIDIA',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
] as const

/**
 * Applies a RouteDecision to a process-env-shaped object: clears every known
 * provider-selection flag, then sets the decision's own env vars.
 */
export function applyRouteDecisionToEnv(
  env: NodeJS.ProcessEnv,
  decision: RouteDecision,
): void {
  for (const flag of PROVIDER_FLAG_ENV_VARS) {
    delete env[flag]
  }
  Object.assign(env, decision.env)
}
