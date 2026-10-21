import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export async function generateContributors(commits, getCommit, warn) {
  const authors = new Map()
  for (const commit of commits) {
    if (!commit.name || commit.name.includes('[bot]')) continue
    const key = commit.email.toLowerCase()
    const author = authors.get(key) || { name: commit.name, commits: [] }
    author.commits.push(commit.sha)
    authors.set(key, author)
  }

  const contributors = new Map()
  for (const [email, author] of authors) {
    let login
    // GitHub noreply addresses contain the account name even for unlinked commits.
    const noreply = email.match(
      /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/,
    )
    if (noreply) login = noreply[1]
    for (const sha of author.commits) {
      if (login) break
      const commit = await getCommit(sha)
      // The committer can be GitHub's merge bot or a different developer.
      login = commit.author?.login
    }
    if (login?.endsWith('[bot]')) continue
    if (!login) warn(`No GitHub account linked to commits by ${author.name}`)
    const key = login ? `github:${login.toLowerCase()}` : `email:${email}`
    if (!contributors.has(key)) {
      contributors.set(key, `- ${author.name}${login ? ` (@${login})` : ''}`)
    }
  }
  return contributors.size
    ? `\n\n### ❤️ Contributors\n\n${[...contributors.values()].join('\n')}\n`
    : ''
}

async function main() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo)
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required')
  const range = process.argv[2] || 'HEAD'
  const log = execFileSync(
    'git',
    ['log', '--no-merges', '--format=%H%x00%an%x00%ae', range],
    { encoding: 'utf8' },
  ).trim()
  const commits = log
    ? log.split('\n').map((line) => {
        const [sha, name, email] = line.trim().split('\0')
        return { sha, name, email }
      })
    : []
  const markdown = await generateContributors(
    commits,
    async (sha) => {
      const response = await fetch(
        `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}/commits/${sha}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      )
      if (!response.ok)
        throw new Error(
          `GitHub commit lookup failed (${response.status}) for ${sha}`,
        )
      return response.json()
    },
    (message) => console.error(message),
  )
  process.stdout.write(markdown)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
