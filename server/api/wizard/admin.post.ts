import { z } from 'zod'

export default eventHandler(async (event) => {
  const db = useDB()
  const { email, password, username } = await readValidatedBody(
    event,
    z.object({
      email: z.email(),
      password: z.string().min(6),
      username: z.string().min(2).default('admin'),
    }).parse,
  )

  // Check if any user exists
  const existingUser = db.select().from(tables.users).limit(1).get()
  if (existingUser) {
    // If users exist, we might want to update the admin or throw error
    // For wizard, let's assume we are setting up the first user.
    // If a user exists, maybe we just update the password if it's the same email?
    // Or throw error.
    // Let's throw error for now to be safe, or maybe just allow updating the first user if it matches.
    if (existingUser.email === email) {
      // Update existing
      await db
        .update(tables.users)
        .set({
          password: await hashPassword(password),
          username,
          isAdmin: 1,
        })
        .where(eq(tables.users.id, existingUser.id))
        .run()
      return { success: true }
    }

    throw createError({
      statusCode: 400,
      message: 'User already exists',
    })
  }

  await db
    .insert(tables.users)
    .values({
      email,
      username,
      password: await hashPassword(password),
      isAdmin: 1,
      createdAt: new Date(),
    })
    .run()

  return { success: true }
})
