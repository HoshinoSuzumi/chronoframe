import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCloudflareEmailSender,
  platformEmailReady,
} from '../apps/shared/platform/email.ts'

test('Cloudflare Email Sending uses the structured binding without REST credentials', async () => {
  const messages: unknown[] = []
  const binding = {
    async send(message: unknown) {
      messages.push(message)
      return { messageId: 'local-only' }
    },
  }
  assert.equal(
    platformEmailReady(binding, 'login@noreply.chronoframe.art'),
    true,
  )
  assert.equal(
    platformEmailReady(undefined, 'login@noreply.chronoframe.art'),
    false,
  )
  assert.equal(
    platformEmailReady(binding, 'login@example.com\r\nBcc: victim@example.com'),
    false,
  )
  await createCloudflareEmailSender(
    binding,
    'login@noreply.chronoframe.art',
  ).send({ email: 'user@example.com', code: '123456', expiresInMinutes: 10 })
  assert.deepEqual(messages, [
    {
      from: 'login@noreply.chronoframe.art',
      to: 'user@example.com',
      subject: 'Your ChronoFrame sign-in code',
      text: 'Your ChronoFrame sign-in code is 123456. It expires in 10 minutes. If you did not request this code, you can ignore this email.',
    },
  ])
  await assert.rejects(
    createCloudflareEmailSender(
      {
        async send() {
          throw new Error('provider unavailable')
        },
      },
      'login@noreply.chronoframe.art',
    ).send({ email: 'user@example.com', code: '123456', expiresInMinutes: 10 }),
  )
})
