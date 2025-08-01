import type { CheckFunctionParams } from './params'
import { createHooks as hooks } from './hooks'
import { createTemplate } from './template'
import { isRulesValid } from './utils'

export function createHooks<Definition extends PermixDefinition>() {
  return hooks<{
    setup: (state: PermixRules<Definition>) => void
    ready: () => void
    hydrate: () => void
  }>()
}

export type PermixDefinition<T extends Record<string, {
  action: string
  dataType?: unknown
  dataRequired?: boolean
}> = Record<string, {
  action: string
  dataType?: unknown
  dataRequired?: boolean
}>> = T

const permixSymbol = Symbol('permix')

export type PermixStateJSON<Definition extends PermixDefinition = PermixDefinition> = {
  [Key in keyof Definition]: {
    [Action in Definition[Key]['action']]: boolean
  };
}

export type PermixRules<Definition extends PermixDefinition = PermixDefinition> = {
  [Key in keyof Definition]: {
    [Action in Definition[Key]['action']]:
      | boolean
      | (
        Definition[Key]['dataRequired'] extends true
          ? ((data: Definition[Key]['dataType']) => boolean)
          : ((data: Definition[Key]['dataType'] | undefined) => boolean)
      );
  };
}

export function checkWithRules<Definition extends PermixDefinition, K extends keyof Definition>(state: PermixRules<Definition> | null, ...[entity, action, data]: CheckFunctionParams<Definition, K>) {
  if (!state) {
    console.error('[Permix]: Rules wasn\'t provided. Please setup permissions and try again.')
    return false
  }

  if (!state[entity]) {
    console.error(`[Permix]: Incorrect entity name "${String(entity)}". Please check the name of your validation entity.`)
    return false
  }

  const entityObj = state[entity]
  const actions = Array.isArray(action) ? action : [action]

  const actionValues = action === 'all'
    ? Object.values(entityObj)
    : actions.map(a => entityObj[a])

  return actionValues.every((action) => {
    if (typeof action === 'function') {
      return Boolean(action(data))
    }

    return action ?? false
  })
}

/**
 * Interface for the Permix permission manager
 * @example
 * ```ts
 * const permix = createPermix<{
 *   post: {
 *     dataType: { id: string }
 *     action: 'create' | 'read'
 *   }
 * }>()
 * ```
 */
export interface Permix<Definition extends PermixDefinition> {
  /**
   * Check if an action is allowed for an entity using current permissions.
   *
   * @link https://permix.letstri.dev/docs/guide/check
   *
   * @example
   * ```ts
   * // Single action check
   * permix.check('post', 'create') // returns true if allowed
   *
   * // Multiple actions check
   * permix.check('post', ['create', 'read']) // returns true if both actions are allowed
   *
   * // With data
   * permix.check('post', 'read', { id: '123' }) // returns true if allowed exactly with this post
   *
   * // All actions check
   * permix.check('post', 'all') // returns true if ALL actions are allowed
   * ```
   */
  check: <K extends keyof Definition>(...args: CheckFunctionParams<Definition, K>) => boolean

  /**
   * Similar to `check`, but returns a Promise that resolves once `setup` is called.
   * This ensures permissions are ready before checking them.
   *
   * @link https://permix.letstri.dev/docs/guide/check
   *
   * @example
   * ```ts
   * // Wait for permissions to be ready
   * const canCreate = await permix.checkAsync('post', 'create') // Promise<true>
   *
   * // Multiple actions
   * const canCreateAndRead = await permix.checkAsync('post', ['create', 'read'])
   *
   * // Even if you call setup after checking
   * permix.setup({ post: { create: true } })
   * const canCreate = await permix.checkAsync('post', 'create') // Promise<true>
   * ```
   */
  checkAsync: <K extends keyof Definition>(...args: CheckFunctionParams<Definition, K>) => Promise<boolean>

  /**
   * Set up permissions.
   *
   * @link https://permix.letstri.dev/docs/guide/setup
   *
   * @example
   * ```ts
   * // Direct permissions object
   * permix.setup({
   *   post: { create: true, read: false }
   * })
   * ```
   */
  setup: <Rules extends PermixRules<Definition>>(callback: Rules) => void

  /**
   * Register event handler.
   *
   * @link https://permix.letstri.dev/docs/guide/events
   *
   * @returns Function to remove the hook
   *
   * @example
   * ```ts
   * permix.on('setup', () => {
   *   console.log('Permissions were updated')
   * })
   * ```
   */
  hook: ReturnType<typeof createHooks<Definition>>['hook']

  /**
   * Similar to `hook`, but will be called only once.
   *
   * @returns Function to remove the hook
   *
   * @example
   * ```ts
   * permix.hookOnce('setup', () => {
   *   console.log('Permissions were updated')
   * })
   * ```
   */
  hookOnce: ReturnType<typeof createHooks<Definition>>['hookOnce']

  /**
   * Define permissions in different place to setup them later.
   *
   * @link https://permix.letstri.dev/docs/guide/template
   *
   * @example
   * ```ts
   * // Some file where you want to define setup without permix instance
   * import { permix } from './permix'
   *
   * const adminPermissions = permix.template({
   *   post: {
   *     create: true,
   *     read: false
   *   }
   * })
   *
   * // Now you can use setup
   * permix.setup(adminPermissions)
   * ```
   */
  template: <T = void>(...params: Parameters<typeof createTemplate<T, Definition>>) => ReturnType<typeof createTemplate<T, Definition>>

  /**
   * Check if the setup was called.
   *
   * @example
   * ```ts
   * const isReady = permix.isReady()
   * ```
   */
  isReady: () => boolean

  /**
   * Similar to `isReady`, but returns a Promise that resolves once `setup` is called.
   */
  isReadyAsync: () => Promise<boolean>
}

export interface PermixInternal<Definition extends PermixDefinition> extends Permix<Definition> {
  /**
   * @internal
   */
  _: {
    /**
     * Get latest setup state
     *
     * @example
     * ```ts
     * permix.setup({
     *   post: { create: true, delete: post => !post.isPublished }
     * })
     * const permissions = permix._.getRules()
     * // returns { post: { create: true, delete: post => !post.isPublished } }
     * ```
     */
    getRules: () => PermixRules<Definition>

    /**
     * Set state.
     *
     * @example
     * ```ts
     * permix._.setRules({ post: { create: true, delete: post => !post.isPublished } })
     * ```
     */
    setRules: (rules: PermixRules<Definition>) => void

    /**
     * Get current permissions in JSON serializable format.
     *
     * @example
     * ```ts
     * permix.setup({
     *   post: { create: true, delete: post => !post.isPublished }
     * })
     * const permissions = permix.getSerializableState()
     * // returns { post: { create: true, delete: false } }
     * ```
     */
    getSerializableState: () => PermixStateJSON<Definition>

    parseSerializableState: (state: PermixStateJSON<Definition>) => PermixRules<Definition>

    hooks: ReturnType<typeof createHooks<Definition>>

    isSetupCalled: () => boolean

    [permixSymbol]: true
  }
}

/**
 * Create a Permix instance
 *
 * @link https://permix.letstri.dev/docs/guide/instance
 *
 * @example
 * ```ts
 * const permix = createPermix<{
 *   post: {
 *     dataType: { id: string }
 *     action: 'create' | 'read'
 *   },
 *   user: {
 *     dataType: { id: string }
 *     action: 'create' | 'read'
 *   }
 * }>()
 *
 * permix.setup({
 *   post: { create: false },
 *   user: { read: true }
 * })
 *
 * console.log(permix.check('post', 'create')) // false
 * console.log(permix.check('user', 'read')) // true
 * ```
 */
export function createPermix<Definition extends PermixDefinition>(initial?: PermixRules<Definition>): Permix<Definition> {
  let rules: PermixRules<Definition> | null = null
  let isSetupCalled = false
  let isReady = false
  let resolveSetup: () => void

  const hooks = createHooks<Definition>()

  const setupPromise = new Promise((res) => {
    resolveSetup = () => res(undefined)
  })

  hooks.hook('ready', () => {
    if (typeof window !== 'undefined') {
      isReady = true
    }
  })

  hooks.hook('setup', (r) => {
    rules = r
    isSetupCalled = true
    if (!isReady) {
      hooks.callHook('ready')
    }
    resolveSetup()
  })

  if (initial) {
    hooks.callHook('setup', initial)
  }

  const permix = {
    check(...args) {
      return checkWithRules(rules, ...args)
    },
    async checkAsync(...args) {
      await setupPromise

      return checkWithRules(rules, ...args)
    },
    setup(rules) {
      if (!isRulesValid(rules)) {
        throw new Error('[Permix]: Permissions in setup are not valid.')
      }

      hooks.callHook('setup', rules)
    },
    hook: hooks.hook,
    hookOnce: hooks.hookOnce,
    template: createTemplate,
    isReady: () => isReady,
    isReadyAsync: async () => {
      await setupPromise

      return isReady
    },
    _: {
      isSetupCalled: () => isSetupCalled,
      getRules: () => {
        return rules!
      },
      setRules: (r) => {
        rules = r
      },
      getSerializableState: () => {
        const processedSetup = {} as PermixStateJSON<Definition>

        for (const entity in rules) {
          processedSetup[entity] = {} as any
          for (const action in rules[entity]) {
            const value = rules[entity][action]

            processedSetup[entity][action] = typeof value === 'function' ? false : value as boolean
          }
        }

        return processedSetup
      },
      parseSerializableState: (state: PermixStateJSON<Definition>) => {
        const parsedState = {} as PermixRules<Definition>

        for (const entity in state) {
          parsedState[entity] = {} as any

          for (const action in state[entity]) {
            const value = state[entity][action]

            parsedState[entity][action] = value
          }
        }

        return parsedState
      },
      hooks,
      [permixSymbol]: true,
    },
  } satisfies PermixInternal<Definition>

  return permix as Permix<Definition>
}

export function validatePermix<Definition extends PermixDefinition>(permix: Permix<Definition>): asserts permix is PermixInternal<Definition> {
  if (!(permix as PermixInternal<Definition>)._[permixSymbol]) {
    throw new Error('[Permix]: Permix instance is not valid')
  }
}

export function getRules<Definition extends PermixDefinition>(permix: Permix<Definition>): PermixRules<Definition> {
  validatePermix(permix)

  return permix._.getRules()
}
