import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { storageConfigSchema } from '~~/shared/types/storage'
import { useDB, tables, eq } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    z.object({
      admin: z.object({
        email: z.string().email(),
        password: z.string().min(6),
        username: z.string().min(2).default('admin'),
      }),
      site: z.object({
        title: z.string().min(1),
        slogan: z.string().optional(),
        avatarUrl: z.string().optional(),
        author: z.string().optional(),
      }),
      storage: z.object({
        name: z.string().min(1),
        config: storageConfigSchema,
      }),
      map: z.object({
        provider: z.enum(['mapbox', 'maplibre']),
        token: z.string().min(1),
        style: z.string().optional(),
      }),
    }).parse,
  )

  const db = useDB()

  // 1. Handle Admin User
  const existingUser = db.select().from(tables.users).limit(1).get()
  if (existingUser) {
    if (existingUser.email === body.admin.email) {
      await db
        .update(tables.users)
        .set({
          password: await hashPassword(body.admin.password),
          username: body.admin.username,
          isAdmin: 1,
        })
        .where(eq(tables.users.id, existingUser.id))
        .run()
    } else {
      throw createError({
        statusCode: 400,
        message: 'User already exists',
      })
    }
  } else {
    await db
      .insert(tables.users)
      .values({
        email: body.admin.email,
        username: body.admin.username,
        password: await hashPassword(body.admin.password),
        isAdmin: 1,
        createdAt: new Date(),
      })
      .run()
  }

  // 2. Handle Site Settings
  await settingsManager.set('app', 'title', body.site.title)
  if (body.site.slogan)
    await settingsManager.set('app', 'slogan', body.site.slogan)
  if (body.site.avatarUrl)
    await settingsManager.set('app', 'avatarUrl', body.site.avatarUrl)
  if (body.site.author)
    await settingsManager.set('app', 'author', body.site.author)

  // 3. Handle Storage Settings
  // Check if provider already exists to avoid duplicates if re-running?
  // For now, just add it.
  const id = await settingsManager.storage.addProvider({
    name: body.storage.name,
    provider: body.storage.config.provider,
    config: body.storage.config,
  })
  await settingsManager.set('storage', 'provider', id)

  // 4. Handle Map Settings
  await settingsManager.set('map', 'provider', body.map.provider)
  if (body.map.provider === 'mapbox') {
    await settingsManager.set('map', 'mapbox.token', body.map.token)
    if (body.map.style)
      await settingsManager.set('map', 'mapbox.style', body.map.style)
  } else {
    await settingsManager.set('map', 'maplibre.token', body.map.token)
    if (body.map.style)
      await settingsManager.set('map', 'maplibre.style', body.map.style)
  }

  // 5. Mark Complete
  await settingsManager.set('system', 'firstLaunch', false, undefined, true)

  return { success: true }
})
