import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Registered only by Nuxt's development configuration, never in a Worker build.
export default defineNitroPlugin(async (app) => {
  const mailbox = String(useRuntimeConfig().cloudLocalMailDirectory)
  await mkdir(mailbox, { recursive: true })
  const EMAIL = {
    async send(message: { to: string; subject: string; text: string }) {
      const messageId = randomUUID()
      await appendFile(
        join(mailbox, 'mail.jsonl'),
        JSON.stringify({
          ...message,
          messageId,
          createdAt: new Date().toISOString(),
        }) + '\n',
      )
      console.info(
        `[Cloud local mail] ${message.to}: ${message.subject}\n${message.text}`,
      )
      return { messageId }
    },
  }
  app.hooks.hook('request', (event) => {
    event.context.cloudflare = {
      ...event.context.cloudflare,
      env: { ...event.context.cloudflare?.env, EMAIL },
    }
  })
})
