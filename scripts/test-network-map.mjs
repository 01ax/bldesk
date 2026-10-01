// Tests for the Network Map card's footer: the open ports and the addresses must not run into each other.
// node --experimental-strip-types --no-warnings --test scripts/test-network-map.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardFooter as footer } from '../src/renderer/src/lib/mapFooter.ts'

const NODE_W = 196 // networkMap.ts
const cardFooter = (label, pub, priv, width = NODE_W, measure) => footer(label, pub, priv, width, measure)

const PORT_W = 5.45
const ADDR_W = 5.75

test('a short label leaves both addresses on the card', () => {
  assert.deepEqual(cardFooter('22', '203.0.113.20', '10.21.0.100'), { exposure: '22', addresses: '203.0.113.20 · 10.21.0.100' })
})

test('a longer label drops the private address instead of running into it', () => {
  assert.equal(cardFooter('none', '203.0.113.20', '10.21.0.100').addresses, '203.0.113.20')
  const f = cardFooter('80 443 9090 +3', '203.0.113.20', '10.21.0.100')
  assert.equal(f.addresses, '203.0.113.20')
  assert.equal(f.exposure, '80 443 9090 +3')
})

test('whatever the label and addresses, the two halves fit side by side', () => {
  const labels = ['none', 'all', '?', '…', '22', '22 80 443 8080', '22 80 443 8080 +12', '1024-65535 2000-3000 4000-5000 6000-7000']
  const addresses = [[null, null], ['203.0.113.20', null], ['203.0.113.20', '10.21.0.100'], ['198.51.100.255', '10.255.255.255']]
  for (const label of labels) {
    for (const [pub, priv] of addresses) {
      const f = cardFooter(label, pub, priv)
      assert.ok(f.exposure.length * PORT_W + f.addresses.length * ADDR_W <= NODE_W - 24 - 8 + PORT_W, `${label} | ${pub} | ${priv}: ${JSON.stringify(f)}`)
      assert.ok(f.exposure.length > 0)
    }
  }
})

test('a label cut to fit ends with an ellipsis, and one that fits is left alone', () => {
  const f = cardFooter('1024-65535 2000-3000 4000-5000 6000-7000', '203.0.113.20', '10.21.0.100')
  assert.ok(f.exposure.endsWith('…'))
  assert.equal(cardFooter('22', '203.0.113.20', null).exposure, '22')
})

test('measuring with the real font decides, not the estimate', () => {
  // A narrow font (5 px a character) fits both addresses beside "none"; a wide one (7 px) does not.
  const narrow = (text) => text.length * 5
  const wide = (text) => text.length * 7
  assert.equal(cardFooter('none', '203.0.113.20', '10.21.0.100', NODE_W, narrow).addresses, '203.0.113.20 · 10.21.0.100')
  const f = cardFooter('80 443 9090 +3', '203.0.113.20', '10.21.0.100', NODE_W, wide)
  assert.ok(f.exposure.length * 7 + f.addresses.length * 7 <= NODE_W - 24 - 8 + 7)
})
