export interface ParsedScriptTag {
  /** 第三方脚本的自定义配置属性 */
  [key: `data-${string}`]: string | undefined
  /** 外链脚本 URL */
  src?: string
  /** 内联脚本内容 */
  innerHTML?: string
  /** 布尔属性：异步加载 */
  async?: boolean
  /** 布尔属性：延迟执行 */
  defer?: boolean
  /** 脚本类型（如 module / application/ld+json / application/json） */
  type?: string
  /** CORS 模式，true 表示 anonymous */
  crossorigin?: boolean | 'anonymous' | 'use-credentials'
  /** 子资源完整性哈希 */
  integrity?: string
  /** 布尔属性：仅在不支持 module 的浏览器执行 */
  nomodule?: boolean
  /** Referrer 策略 */
  referrerpolicy?: string
  /** CSP nonce */
  nonce?: string
}

/**
 * Scan comments and script elements in source order without removing text.
 * Deleting comments can join surrounding text into new markup. Instead, skip
 * entire comments while preserving comment-like text inside script raw content.
 * HTML script end tags may contain whitespace, a slash, or ignored attributes.
 * As before, quoted attribute values containing `>` are not supported.
 */
const SCRIPT_TAG_RE =
  /<!--[\s\S]*?(?:-->|$)|<script(?=[\t\n\f\r />])([^>]*?)\s*\/>|<script(?=[\t\n\f\r >])([^>]*?)>([\s\S]*?)<\/script(?=[\t\n\f\r />])[^>]*>/gi

/**
 * 属性解析：name(=value)?
 * value 可为双引号、单引号或无引号形式。
 * 布尔属性没有 =value 部分。
 */
const ATTR_RE =
  /([a-zA-Z_:][\w:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/** 已知属性白名单 */
const KNOWN_ATTRS = new Set([
  'src',
  'async',
  'defer',
  'type',
  'crossorigin',
  'integrity',
  'nomodule',
  'referrerpolicy',
  'nonce',
])

/** 布尔属性（出现即为 true） */
const BOOLEAN_ATTRS = new Set(['async', 'defer', 'nomodule'])

/**
 * 将单个属性应用到输出对象上。
 */
function applyAttribute(
  name: string,
  value: string | true,
  out: ParsedScriptTag,
): void {
  const lower = name.toLowerCase()
  if (lower.startsWith('data-') && lower.length > 5) {
    out[lower as `data-${string}`] = value === true ? '' : value
    return
  }
  if (!KNOWN_ATTRS.has(lower)) return

  if (BOOLEAN_ATTRS.has(lower)) {
    ;(out as any)[lower] = true
    return
  }

  if (lower === 'crossorigin') {
    if (
      value === true ||
      value === 'anonymous' ||
      value === 'use-credentials'
    ) {
      out.crossorigin = value
    }
    return
  }

  ;(out as any)[lower] = value
}

/**
 * 解析属性字符串为键值对并应用到输出对象。
 */
function parseAttributes(attrs: string, out: ParsedScriptTag): void {
  ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR_RE.exec(attrs)) !== null) {
    const name = match[1]
    if (!name) continue // 类型守卫，同时避免无效匹配
    const value = match[2] ?? match[3] ?? match[4]
    const attrValue =
      value === undefined
        ? name.toLowerCase().startsWith('data-')
          ? ''
          : 'true'
        : value
    applyAttribute(name, attrValue, out)
  }
}

/**
 * 解析原始 HTML 片段为 <script> 标签描述符数组。
 *
 * 行为：
 *  - 按源码顺序跳过 HTML 注释，不删除或拼接原始文本
 *  - 同时匹配含内容与自闭合两种 <script> 形式
 *  - 解析 src/async/defer/type/crossorigin/integrity/nomodule/referrerpolicy/nonce
 *  - 保留 data-* 自定义属性，属性名转为小写，属性值保持字符串
 *  - 跳过既无 src 又无 innerHTML 的空脚本
 *  - 不过滤 type（application/ld+json、module 等原样保留）
 *  - 永不抛错，输入非法或为空时返回 []
 *
 * @param raw 管理员粘贴的原始 HTML 片段
 * @returns 解析后的 script 标签描述符数组，可直接传给 useHead({ script: [...] })
 *
 * @example
 * parseScriptTags(`<script async src="a.js"></script>`)
 * // => [{ src: 'a.js', async: true }]
 *
 * parseScriptTags(`<script>console.log('hi')</script>`)
 * // => [{ innerHTML: "console.log('hi')" }]
 */
export function parseScriptTags(raw: string): ParsedScriptTag[] {
  if (!raw || typeof raw !== 'string') return []

  const result: ParsedScriptTag[] = []

  // Scan original input; comments are skipped rather than stripped.
  SCRIPT_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SCRIPT_TAG_RE.exec(raw)) !== null) {
    if (match[0].startsWith('<!--')) continue
    // First script branch is self-closing; second contains raw script text.
    const attrs = match[1] ?? match[2] ?? ''
    const content = match[3] ?? ''

    const tag: ParsedScriptTag = {}

    // 3. 解析属性
    parseAttributes(attrs, tag)

    // 4. 填充内容：有 src 则不取 innerHTML，否则取文本内容
    if (!tag.src) {
      const trimmed = content.trim()
      if (trimmed) {
        tag.innerHTML = trimmed
      }
    }

    // 5. 跳过空脚本（既无 src 又无 innerHTML）
    if (!tag.src && !tag.innerHTML) {
      continue
    }

    result.push(tag)
  }

  return result
}
