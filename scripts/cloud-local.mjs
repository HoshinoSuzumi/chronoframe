import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const cloudApp = fileURLToPath(
  new URL('../apps/cloud/', import.meta.url),
)
export const cloudLocalState = fileURLToPath(
  new URL('../apps/cloud/.wrangler/state/v3', import.meta.url),
)

export async function localCloudPlatform() {
  // Workerd's Windows sandbox needs a writable temporary directory in the project.
  if (process.platform === 'win32') {
    const temporary = join(cloudApp, '.wrangler', 'tmp')
    await mkdir(temporary, { recursive: true })
    process.env.TMP = temporary
    process.env.TEMP = temporary
  }
  const { getPlatformProxy } = await import('wrangler')
  return getPlatformProxy({
    configPath: fileURLToPath(
      new URL('../apps/cloud/wrangler.local.json', import.meta.url),
    ),
    persist: { path: cloudLocalState },
    remoteBindings: false,
    envFiles: [],
  })
}
