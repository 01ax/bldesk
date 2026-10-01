// What a Network Map server card's footer says. No imports, so Node can test it on its own (scripts/test-network-map.mjs).

/** Which of the footer's two texts is being measured: the open ports (bold, 9px) or the addresses (9.5px). */
export type FooterRole = 'port' | 'address'
/** Width in pixels of `text` as the card draws it. */
export type MeasureFooter = (text: string, role: FooterRole) => number

/**
 * A guess for where nothing can be measured: the glyph advance of the widest monospace font the card can fall back to
 * (Menlo, 0.602 em), so the guess is never short.
 */
export const estimateFooter: MeasureFooter = (text, role) => text.length * (role === 'port' ? 5.45 : 5.75)

/** Space kept clear at each side of a card's footer, and between its two halves. */
const FOOTER_PAD = 12
const FOOTER_GAP = 8

/**
 * What a server card's footer says, so that its two halves cannot run into each other: the open ports at the left, the
 * addresses at the right. The private address is left off when both addresses do not fit beside the ports, and a port
 * list that is still too long for the card is cut with an ellipsis (the full label stays in the server's details). Both
 * sides are measured, because the card is a fixed width and a label such as "80 443 9090 +3" took the whole of it.
 */
export function cardFooter(
  exposure: string,
  publicIp: string | null | undefined,
  privateIp: string | null | undefined,
  width: number,
  measure: MeasureFooter = estimateFooter
): { exposure: string; addresses: string } {
  const pub = publicIp ?? '—'
  const room = width - FOOTER_PAD * 2 - FOOTER_GAP
  const both = privateIp ? `${pub} · ${privateIp}` : pub
  const addresses = measure(exposure, 'port') + measure(both, 'address') <= room ? both : pub
  const left = room - measure(addresses, 'address')
  let label = exposure
  while (label.length > 1 && measure(label, 'port') > left) {
    label = label.endsWith('…') ? `${label.slice(0, -2)}…` : `${label.slice(0, -1)}…`
  }
  return { exposure: label, addresses }
}
