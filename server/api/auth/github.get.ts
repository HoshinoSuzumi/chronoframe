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
      // 更新现有用户的头像（如果GitHub头像有变化）
      if (user.avatar_url && userFromEmail.avatar !== user.avatar_url) {
        db.update(tables.users)
          .set({ avatar: user.avatar_url })
          .where(eq(tables.users.id, userFromEmail.id))
          .run()
        
        // 更新用户对象
        userFromEmail.avatar = user.avatar_url
      }
      
      await setUserSession(
        event,
        { user: userFromEmail },
        {
          cookie: {
            secure: !useRuntimeConfig().ALLOW_INSECURE_COOKIE,
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
