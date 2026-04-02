export async function getOne<T>(query: {
  get?: () => T | undefined
  execute: () => Promise<T[]>
}): Promise<T | undefined> {
  if (typeof query.get === 'function') {
    return query.get()
  }

  const rows = await query.execute()
  return rows[0]
}

export async function getAll<T>(query: {
  all?: () => T[]
  execute: () => Promise<T[]>
}): Promise<T[]> {
  if (typeof query.all === 'function') {
    return query.all()
  }

  return query.execute()
}

export async function execMutation<T>(
  query: {
    run?: () => T
    execute: () => Promise<T>
  },
): Promise<T> {
  if (typeof query.run === 'function') {
    return query.run()
  }

  return query.execute()
}

