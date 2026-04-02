import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { z } from 'zod'

const bootstrapDbConfigSchema = z.discriminatedUnion('adapter', [
  z.object({
    adapter: z.literal('sqlite'),
    sqlite: z
      .object({
        path: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    adapter: z.literal('postgres'),
    postgres: z.object({
      url: z.string().min(1),
    }),
  }),
])

export type BootstrapDbConfig = z.infer<typeof bootstrapDbConfigSchema>
export type DatabaseAdapter = BootstrapDbConfig['adapter']

const DEFAULT_SQLITE_PATH = 'data/app.sqlite3'
const BOOTSTRAP_DB_CONFIG_PATH = resolve(process.cwd(), 'data/bootstrap-db.json')

function normalizeSqlitePath(filePath?: string) {
  const normalized = filePath?.trim() || DEFAULT_SQLITE_PATH
  return isAbsolute(normalized) ? normalized : resolve(process.cwd(), normalized)
}

function normalizeConfig(config: BootstrapDbConfig): BootstrapDbConfig {
  if (config.adapter === 'sqlite') {
    return {
      adapter: 'sqlite',
      sqlite: {
        path: normalizeSqlitePath(config.sqlite?.path),
      },
    }
  }

  return {
    adapter: 'postgres',
    postgres: {
      url: config.postgres.url.trim(),
    },
  }
}

export async function readBootstrapDbConfig(): Promise<BootstrapDbConfig | null> {
  try {
    const raw = await readFile(BOOTSTRAP_DB_CONFIG_PATH, 'utf-8')
    return normalizeConfig(bootstrapDbConfigSchema.parse(JSON.parse(raw)))
  } catch {
    return null
  }
}

export async function writeBootstrapDbConfig(
  input: BootstrapDbConfig,
): Promise<BootstrapDbConfig> {
  const config = normalizeConfig(bootstrapDbConfigSchema.parse(input))

  await mkdir(dirname(BOOTSTRAP_DB_CONFIG_PATH), { recursive: true })
  await writeFile(BOOTSTRAP_DB_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')

  return config
}

export async function ensureBootstrapDbConfig(): Promise<BootstrapDbConfig> {
  const existing = await readBootstrapDbConfig()
  if (existing) {
    return existing
  }

  return {
    adapter: 'sqlite',
    sqlite: {
      path: DEFAULT_SQLITE_PATH,
    },
  }
}

export function readBootstrapDbConfigSync(): BootstrapDbConfig | null {
  try {
    const raw = readFileSync(BOOTSTRAP_DB_CONFIG_PATH, 'utf-8')
    return normalizeConfig(bootstrapDbConfigSchema.parse(JSON.parse(raw)))
  } catch {
    return null
  }
}

export function hasBootstrapDbConfigSync(): boolean {
  return readBootstrapDbConfigSync() !== null
}

export function writeBootstrapDbConfigSync(
  input: BootstrapDbConfig,
): BootstrapDbConfig {
  const config = normalizeConfig(bootstrapDbConfigSchema.parse(input))
  if (!existsSync(dirname(BOOTSTRAP_DB_CONFIG_PATH))) {
    mkdirSync(dirname(BOOTSTRAP_DB_CONFIG_PATH), { recursive: true })
  }
  writeFileSync(BOOTSTRAP_DB_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  return config
}

export function ensureBootstrapDbConfigSync(): BootstrapDbConfig {
  const existing = readBootstrapDbConfigSync()
  if (existing) {
    return existing
  }

  return {
    adapter: 'sqlite',
    sqlite: {
      path: DEFAULT_SQLITE_PATH,
    },
  }
}
