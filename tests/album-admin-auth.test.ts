import assert from 'node:assert/strict'
import test from 'node:test'

test('album mutations reject non-admin sessions before reading input or accessing the database', async () => {
  let bodyReads = 0
  let dbAccesses = 0
  const globals = {
    eventHandler: (handler: unknown) => handler,
    requireUserSession: async (event: { role: 'guest' | 'user' | 'admin' }) => {
      if (event.role === 'guest') {
        throw Object.assign(new Error('Authentication required'), {
          statusCode: 401,
        })
      }
      return { user: { isAdmin: event.role === 'admin' ? 1 : 0 } }
    },
    createError: (options: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(options.statusMessage), options),
    readValidatedBody: () => {
      bodyReads++
      return { albumIds: [] }
    },
    useDB: () => {
      dbAccesses++
      throw new Error('Unexpected database access')
    },
  }
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  Object.assign(globalThis, globals)
  try {
    const { requireAdminSession } =
      await import('../server/utils/require-admin.ts')
    const { default: reorderAlbums } =
      await import('../server/api/albums/reorder.put.ts')

    await assert.rejects(requireAdminSession({ role: 'guest' } as never), {
      statusCode: 401,
    })
    await assert.rejects(reorderAlbums({ role: 'user' } as never), {
      statusCode: 403,
    })
    assert.equal(bodyReads, 0)
    assert.equal(dbAccesses, 0)
    assert.equal(
      (await requireAdminSession({ role: 'admin' } as never)).user.isAdmin,
      1,
    )
  } finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
