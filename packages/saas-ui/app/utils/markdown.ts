import MarkdownIt from 'markdown-it'
const renderer = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
})
const defaultValidate = renderer.validateLink.bind(renderer)
renderer.validateLink = (url) =>
  defaultValidate(url) &&
  !url.startsWith('//') &&
  (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /^(https?:|mailto:)/i.test(url))
// Legal documents are text: never load tracking pixels or other remote images.
renderer.renderer.rules.image = (tokens, index) =>
  renderer.utils.escapeHtml(tokens[index]?.content ?? '')
renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index],
    href = token?.attrGet('href')
  if (token && href?.startsWith('/') && env?.linkBase) {
    try {
      const url = new URL(href, env.linkBase)
      if (/^https?:$/.test(url.protocol)) {
        token.attrSet('href', url.href)
        token.attrSet('target', '_blank')
        token.attrSet('rel', 'noopener noreferrer')
      }
    } catch {
      /* Invalid preview origins leave the validated relative URL intact. */
    }
  }
  return self.renderToken(tokens, index, options)
}
export function renderMarkdown(markdown: string, linkBase?: string) {
  return renderer.render(markdown, { linkBase })
}
