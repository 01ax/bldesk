import { parse } from 'yaml'
import { helpHeadings } from './helpMarkdown'

export interface HelpPage {
  slug: string; title: string; summary: string; keywords: string[]; body: string
  headings: Array<{ id: string; text: string; level: number }>
}
export interface HelpHit { page: HelpPage; score: number; heading?: string }

// @help is a Vite alias to docs/help, allowed by renderer server.fs.allow.
// Raw imports are bundled for desktop/Android, with no runtime filesystem reads.
const documents = import.meta.glob<string>('@help/*.md', { query: '?raw', import: 'default', eager: true })
export const HELP_PAGES: HelpPage[] = Object.entries(documents).map(([path, raw]) => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
  if (!front) throw new Error(`Help front matter missing: ${path}`)
  const meta = parse(front[1])
  if (typeof meta?.title !== 'string' || typeof meta?.summary !== 'string' || !Array.isArray(meta?.keywords) || !meta.keywords.every((k: unknown) => typeof k === 'string')) throw new Error(`Invalid help front matter: ${path}`)
  const body = front[2].trim()
  return { slug: path.split('/').pop()!.replace(/\.md$/, ''), title: meta.title, summary: meta.summary, keywords: meta.keywords, body, headings: helpHeadings(body) }
}).sort((a, b) => a.title.localeCompare(b.title))

// Question words carry no signal; "how do I add an IP address" should rank
// on "add", "ip" and "address", not on every page that contains "how".
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'what', 'where', 'why', 'with', 'you', 'your'])

export function searchHelp(query: string): HelpHit[] {
  const all = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const meaningful = all.filter(w => !STOP_WORDS.has(w))
  const words = meaningful.length ? meaningful : all
  if (!words.length) return []
  return HELP_PAGES.map(page => {
    const title = page.title.toLowerCase(), keywords = page.keywords.join(' ').toLowerCase()
    const heading = page.headings.find(h => words.every(w => h.text.toLowerCase().includes(w)))
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 12 : 0) + (keywords.includes(word) ? 8 : 0) + (page.headings.some(h => h.text.toLowerCase().includes(word)) ? 5 : 0) + (page.summary.toLowerCase().includes(word) ? 3 : 0) + (page.body.toLowerCase().includes(word) ? 1 : 0), 0)
    return { page, score, heading: heading?.id }
  }).filter(hit => hit.score > 0 && (words.length < 2 || hit.score > words.length)).sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))
}
