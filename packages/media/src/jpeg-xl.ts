import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

const run = promisify(execFile)
const containerSignature = Buffer.from('0000000c4a584c200d0a870a', 'hex')
const codestreamSignature = Buffer.from('ff0a', 'hex')

export function isJpegXl(buffer: Buffer): boolean {
  return (
    buffer.subarray(0, 2).equals(codestreamSignature) ||
    buffer.subarray(0, 12).equals(containerSignature)
  )
}

async function runJpegXlTool(
  name: 'djxl' | 'jxlinfo',
  args: string[],
  signal?: AbortSignal,
) {
  const executable =
    (name === 'djxl' ? process.env.DJXL_PATH : process.env.JXLINFO_PATH) || name
  const command = run(executable, args, {
    signal,
    timeout: 30_000,
    maxBuffer: 256 * 1024,
    windowsHide: true,
  })
  const closed = new Promise<void>((resolve) => {
    command.child.once('close', () => resolve())
  })
  try {
    return await command
  } catch (error) {
    await closed
    signal?.throwIfAborted()
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error(`Install the libjxl tools to process JPEG XL (${name})`, {
        cause: error,
      })
    throw new Error(`JPEG XL ${name} failed`, { cause: error })
  }
}

export async function convertJpegXlToJpeg(
  buffer: Buffer,
  maxPixels: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!isJpegXl(buffer)) throw new Error('Invalid JPEG XL signature')

  const dir = await mkdtemp(join(tmpdir(), 'chronoframe-jxl-'))
  try {
    const input = join(dir, 'source.jxl')
    const output = join(dir, 'decoded.png')
    await writeFile(input, buffer, { signal })
    const { stdout } = await runJpegXlTool('jxlinfo', [input], signal)
    const dimensions = /^JPEG XL (image|animation), (\d+)x(\d+),/m.exec(stdout)
    if (!dimensions) throw new Error('Invalid JPEG XL dimensions')
    if (dimensions[1] === 'animation')
      throw new Error('Animated JPEG XL is unsupported')
    if (Number(dimensions[2]) * Number(dimensions[3]) > maxPixels)
      throw new Error('JPEG XL exceeds the configured pixel limit')

    await runJpegXlTool(
      'djxl',
      [input, output, '--bits_per_sample=8', '--num_threads=2'],
      signal,
    )
    const jpeg = await sharp(output, { limitInputPixels: maxPixels })
      .flatten({ background: '#fff' })
      .jpeg({ quality: buffer.length > 10 * 1024 * 1024 ? 80 : 95 })
      .toBuffer()
    signal?.throwIfAborted()
    return jpeg
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
