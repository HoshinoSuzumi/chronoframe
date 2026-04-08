const _accessDeniedError = createError({
  statusCode: 403,
  statusMessage:
    'Access denied. Please contact the administrator to activate your account.',
})

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    const db = useDB()
    const userFromEmail = db
      .select()
      .from(tables.users)
      .where(eq(tables.users.email, user.email || ''))
      .get()

    logger.chrono.info(
      'GitHub OAuth login:',
      user.email,
      userFromEmail ? 'Existing user' : 'New user',
    )

    if (!userFromEmail) {
      // create a new user without admin permission
      db.insert(tables.users)
        .values({
          username: user.name || '',
          email: user.email || '',
          avatar: user.avatar_url || null,
          createdAt: new Date(),
        })
        .returning()
        .get()
      // then reject login
      throw _accessDeniedError
    } else if (userFromEmail.isAdmin === 0) {
      throw _accessDeniedError
    } else {
      await setUserSession(
        event,
        { user: userFromEmail },
        {
          cookie: {
            // secure: !useRuntimeConfig().allowInsecureCookie,
            secure: false,
          },
        },
      )
    }
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    logger.chrono.warn('GitHub OAuth login failed', error)
    throw createError({
      statusCode: 401,
      statusMessage: `Authentication failed: ${error.message || 'Unknown error'}`,
    })
  },
})
