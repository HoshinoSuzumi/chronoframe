import assert from 'node:assert/strict'
import test from 'node:test'

test('album authorization rejects non-admin sessions before reading input or accessing the database', async () => {
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
      await import('../apps/self-hosted/server/utils/require-admin.ts')

    await assert.rejects(requireAdminSession({ role: 'guest' } as never), {
      statusCode: 401,
    })
    await assert.rejects(requireAdminSession({ role: 'user' } as never), {
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

test('all album mutation routes retain the administrator guard before input handling', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const path of [
    'albums/index.post.ts',
    'albums/reorder.put.ts',
    'albums/[albumId]/index.put.ts',
    'albums/[albumId]/index.delete.ts',
    'albums/[albumId]/photos/[photoId].delete.ts',
    'albums/[albumId]/photos/index.post.ts',
    'albums/upload-options.get.ts',
  ]) {
    const source = await readFile(
      new URL('../apps/self-hosted/server/api/' + path, import.meta.url),
      'utf8',
    )
    assert.match(source, /await requireAdminSession\(event\)/, path)
    const guard = source.indexOf('await requireAdminSession(event)')
    for (const read of [
      'await readValidatedBody(',
      'await getValidatedRouterParams(',
    ]) {
      const index = source.indexOf(read)
      if (index !== -1) assert.ok(guard < index, path)
    }
  }
})
