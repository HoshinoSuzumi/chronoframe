export const MAX_SOCIAL_LINKS = 4

type ParsedSocialLinkUrl = {
  href: string
  protocol: string
  username: string
  password: string
  hostname: string
  origin: string
  pathname: string
}

declare const URL: new (value: string) => ParsedSocialLinkUrl

export type SocialLinkErrorCode = 'shape' | 'limit' | 'invalid' | 'duplicate'

export function isSocialLinkErrorCode(
  value: unknown,
): value is SocialLinkErrorCode {
  return (
    value === 'shape' ||
    value === 'limit' ||
    value === 'invalid' ||
    value === 'duplicate'
  )
}

export class SocialLinkError extends Error {
  readonly code: SocialLinkErrorCode

  constructor(code: SocialLinkErrorCode, message: string) {
    super(message)
    this.name = 'SocialLinkError'
    this.code = code
  }
}

/** Validate HTTPS profile URL syntax without checking host reachability. */
export function parseSocialLink(value: unknown): string {
  return parseSocialLinkUrl(value).href
}

function parseSocialLinkUrl(value: unknown): ParsedSocialLinkUrl {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new SocialLinkError('invalid', 'Enter a valid HTTPS URL')
  }

  let url: ParsedSocialLinkUrl
  try {
    url = new URL(value)
  } catch {
    throw new SocialLinkError('invalid', 'Enter a valid HTTPS URL')
  }

  const labels = url.hostname.split('.')
  const validHostname =
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    ) &&
    /[a-z]/i.test(labels.at(-1) ?? '') &&
    !['local', 'localhost', 'internal', 'invalid'].includes(labels.at(-1) ?? '')

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !validHostname
  ) {
    throw new SocialLinkError('invalid', 'Enter a valid HTTPS URL')
  }
  return url
}

export function socialLinkIdentity(value: unknown): string {
  const url = parseSocialLinkUrl(value)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function parseSocialLinks(value: unknown): string[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'links') ||
    !Array.isArray((value as { links: unknown }).links)
  ) {
    throw new SocialLinkError('shape', 'Invalid social links shape')
  }

  const links = (value as { links: unknown[] }).links
  if (links.length > MAX_SOCIAL_LINKS)
    throw new SocialLinkError(
      'limit',
      `Use at most ${MAX_SOCIAL_LINKS} social links`,
    )

  const seen = new Set<string>()
  return links.map((link) => {
    const identity = socialLinkIdentity(link)
    if (seen.has(identity))
      throw new SocialLinkError('duplicate', 'Duplicate social link')
    seen.add(identity)
    return link as string
  })
}

const platforms = [
  {
    domains: ['instagram.com'],
    label: 'Instagram',
    icon: 'tabler:brand-instagram',
  },
  {
    domains: ['facebook.com', 'fb.com'],
    label: 'Facebook',
    icon: 'tabler:brand-facebook',
  },
  { domains: ['github.com'], label: 'GitHub', icon: 'tabler:brand-github' },
  { domains: ['x.com', 'twitter.com'], label: 'X', icon: 'tabler:brand-x' },
  {
    domains: ['youtube.com', 'youtu.be'],
    label: 'YouTube',
    icon: 'tabler:brand-youtube',
  },
  {
    domains: ['linkedin.com'],
    label: 'LinkedIn',
    icon: 'tabler:brand-linkedin',
  },
  { domains: ['tiktok.com'], label: 'TikTok', icon: 'tabler:brand-tiktok' },
  { domains: ['threads.net'], label: 'Threads', icon: 'tabler:brand-threads' },
  { domains: ['bsky.app'], label: 'Bluesky', icon: 'tabler:brand-bluesky' },
  {
    domains: ['mastodon.social'],
    label: 'Mastodon',
    icon: 'tabler:brand-mastodon',
  },
  {
    domains: ['pinterest.com'],
    label: 'Pinterest',
    icon: 'tabler:brand-pinterest',
  },
  { domains: ['reddit.com'], label: 'Reddit', icon: 'tabler:brand-reddit' },
  { domains: ['twitch.tv'], label: 'Twitch', icon: 'tabler:brand-twitch' },
  { domains: ['flickr.com'], label: 'Flickr', icon: 'tabler:brand-flickr' },
  { domains: ['vimeo.com'], label: 'Vimeo', icon: 'tabler:brand-vimeo' },
  { domains: ['behance.net'], label: 'Behance', icon: 'tabler:brand-behance' },
  {
    domains: ['dribbble.com'],
    label: 'Dribbble',
    icon: 'tabler:brand-dribbble',
  },
  { domains: ['tumblr.com'], label: 'Tumblr', icon: 'tabler:brand-tumblr' },
  {
    domains: ['snapchat.com'],
    label: 'Snapchat',
    icon: 'tabler:brand-snapchat',
  },
  { domains: ['medium.com'], label: 'Medium', icon: 'tabler:brand-medium' },
  { domains: ['weibo.com'], label: 'Weibo', icon: 'tabler:brand-weibo' },
  {
    domains: ['discord.com', 'discord.gg'],
    label: 'Discord',
    icon: 'tabler:brand-discord',
  },
  {
    domains: ['t.me', 'telegram.me'],
    label: 'Telegram',
    icon: 'tabler:brand-telegram',
  },
  {
    domains: ['wa.me', 'whatsapp.com'],
    label: 'WhatsApp',
    icon: 'tabler:brand-whatsapp',
  },
] as const

export function resolveSocialPlatform(value: string): {
  label: string
  icon: string
} {
  let hostname: string
  try {
    hostname = parseSocialLinkUrl(value).hostname
  } catch {
    return { label: 'Link', icon: 'tabler:link' }
  }
  const platform = platforms.find(({ domains }) =>
    domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ),
  )
  return platform
    ? { label: platform.label, icon: platform.icon }
    : { label: hostname.replace(/^www\./, ''), icon: 'tabler:link' }
}
