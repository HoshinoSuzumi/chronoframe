/** Preserve a registered node key and optional Access settings when setup is rerun. */
export function processorEnvironment(portal, suppliedKey, existing = '') {
  const stored =
    /^CHRONOFRAME_PROCESSOR_KEY=(.*)$/m.exec(existing)?.[1].trim() ?? ''
  const unquote = (value) =>
    /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value
  const key = unquote(suppliedKey?.trim() || stored)
  if (key && !/^pn_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(key))
    throw new Error('Invalid processing node connection key')
  const extra = existing
    .split(/\r?\n/)
    .filter((line) => !/^CHRONOFRAME_(PORTAL_ORIGIN|PROCESSOR_KEY)=/.test(line))
    .join('\n')
    .trim()
  return `CHRONOFRAME_PORTAL_ORIGIN=${portal}\nCHRONOFRAME_PROCESSOR_KEY=${key}\n${extra ? extra + '\n' : ''}`
}
