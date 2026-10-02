// Tests for server tags: names, several tags per server, renaming everywhere (and merging), and tag colours. The
// module has no imports, so Node runs the TypeScript directly: node --test scripts/test-server-tags.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Plain-object copy (own properties only, the `__proto__` key included) so contents can be compared. */
const norm = (x) => (Array.isArray(x) ? x.map(norm) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).map((k) => [k, norm(x[k])])) : x)
const eq = (actual, expected, message) => assert.deepEqual(norm(actual), norm(expected), message)
import { backHandlerCount, handleBack, pushBackHandler } from '../src/renderer/src/lib/backStack.ts'
import {
  CHIP_SURFACES,
  HOLD_DELETE_MS,
  HOLD_MOVE_TOLERANCE_PX,
  HOLD_TICKS_MS,
  MAX_CUSTOM_COLOURS,
  TAG_COLOR_KEYS,
  TAG_PRESET_HEX,
  addCustomColour,
  allTags,
  autoColorNewTags,
  canonicalColor,
  cleanCustomColours,
  cleanTagColors,
  cleanTagMap,
  colorOf,
  hasOwn,
  newColorMap,
  newTagMap,
  completeTagToken,
  contrastRatio,
  customChipStyle,
  expandGroupRefs,
  effectiveGroups,
  hexProblem,
  hexToRgb,
  holdMovedTooFar,
  holdProgress,
  holdTimeline,
  hslToRgb,
  hsvToRgb,
  isGroupRef,
  isTagColorKey,
  isTagColorValue,
  liveTagCounts,
  matchServers,
  matchesTagFilter,
  matchesTagPrefixes,
  normaliseHex,
  normaliseTag,
  parseTagSearch,
  pickAutoColor,
  pruneTagColors,
  removeCustomColour,
  renameTag,
  resolveGroup,
  rgbToHex,
  rgbToHsv,
  tagNameProblem,
  tagServerCount,
  tagSuggestions,
  withTag,
  withTagColor
} from '../src/renderer/src/lib/tags.ts'

test('a tag name keeps letters, numbers, dots, dashes and underscores, lower-cased, without a leading @', () => {
  assert.equal(normaliseTag('  @WordPress '), 'wordpress')
  assert.equal(normaliseTag('my tag/x'), 'mytagx')
  assert.equal(normaliseTag('web_1.a-b'), 'web_1.a-b')
  assert.equal(normaliseTag('@@x'), 'x', 'one leading @ is a prefix, any other @ is dropped like any other character')
})

test('a name with nothing usable is refused with a reason, and a usable one is not', () => {
  assert.equal(tagNameProblem('wordpress'), null)
  assert.match(tagNameProblem('!!!'), /no usable characters/)
  assert.match(tagNameProblem(''), /Type a tag name/)
  assert.match(tagNameProblem('   '), /Type a tag name/)
})

test('a server can carry several tags, kept sorted and without repeats', () => {
  let tags = withTag({}, [1], 'wordpress', true)
  tags = withTag(tags, [1, 2], 'production', true)
  tags = withTag(tags, [1], 'WordPress', true)
  eq(tags, { 1: ['production', 'wordpress'], 2: ['production'] })
  tags = withTag(tags, [1], 'production', false)
  eq(tags, { 1: ['wordpress'], 2: ['production'] })
  tags = withTag(tags, [2], 'production', false)
  eq(tags, { 1: ['wordpress'] }, 'a server with no tags left has no entry')
  assert.equal(withTag(tags, [1], '!!!', true), tags, 'an unusable name changes nothing')
})

test('tags in use are counted per tag, and a count can leave out servers that no longer exist', () => {
  const tags = { 1: ['a', 'b'], 2: ['a'], 9: ['a'] }
  eq(allTags(tags), [{ tag: 'a', count: 3 }, { tag: 'b', count: 1 }])
  assert.equal(tagServerCount(tags, 'a'), 3)
  assert.equal(tagServerCount(tags, 'a', new Set([1, 2])), 2)
  assert.equal(tagServerCount(tags, 'zzz'), 0)
})

test('renaming a tag renames it on every server that has it and leaves the others alone', () => {
  const tags = { 1: ['web', 'x'], 2: ['web'], 3: ['db'] }
  const r = renameTag(tags, {}, 'web', 'frontend')
  eq(r.tags, { 1: ['frontend', 'x'], 2: ['frontend'], 3: ['db'] })
  assert.equal(r.renamed, 2)
  assert.equal(r.merged, false)
  eq(tags, { 1: ['web', 'x'], 2: ['web'], 3: ['db'] }, 'the original is not changed')
})

test('renaming into a name already in use merges them, and a server with both keeps one', () => {
  const tags = { 1: ['old', 'new'], 2: ['old'], 3: ['new'] }
  const r = renameTag(tags, {}, 'old', 'NEW')
  eq(r.tags, { 1: ['new'], 2: ['new'], 3: ['new'] })
  assert.equal(r.renamed, 2)
  assert.equal(r.merged, true)
})

test('renaming to nothing, to an unusable name or to the same name changes nothing', () => {
  const tags = { 1: ['web'] }
  for (const to of ['', '   ', '!!!', 'web', '@Web']) {
    const r = renameTag(tags, { web: 'red' }, 'web', to)
    assert.equal(r.tags, tags, `to "${to}"`)
    eq(r.colors, { web: 'red' })
    assert.equal(r.renamed, 0)
  }
})

test('a colour moves with its tag when it is renamed, and the name it merges into keeps its own colour', () => {
  const tags = { 1: ['a'], 2: ['b'] }
  eq(renameTag(tags, { a: 'red' }, 'a', 'c').colors, { c: 'red' })
  eq(renameTag(tags, { a: 'red', b: 'blue' }, 'a', 'b').colors, { b: 'blue' })
  eq(renameTag(tags, { a: 'red' }, 'a', 'b').colors, { b: 'red' }, 'the target had none, so it takes the old tag\'s')
  eq(renameTag(tags, { x: 'pink' }, 'a', 'c').colors, { x: 'pink' }, 'other colours are untouched')
})

test('colours are palette keys, set and cleared per tag name, and dropped when no server has the tag', () => {
  eq(TAG_COLOR_KEYS, ['slate', 'blue', 'teal', 'green', 'amber', 'red', 'purple', 'pink'])
  assert.equal(isTagColorKey('teal'), true)
  assert.equal(isTagColorKey('#ff0000'), false)
  assert.equal(isTagColorKey(undefined), false)
  let colors = withTagColor({}, 'web', 'green')
  colors = withTagColor(colors, 'db', 'red')
  eq(colors, { web: 'green', db: 'red' })
  eq(withTagColor(colors, 'web', null), { db: 'red' })
  eq(pruneTagColors(colors, { 1: ['web'] }), { web: 'green' })
  eq(pruneTagColors(colors, {}), {})
})

// ---------------------------------------------------------------------------------------------------------------------
// Colours: hex, wheel maths, readable chips
// ---------------------------------------------------------------------------------------------------------------------

test('a hex colour is #rgb or #rrggbb, with or without #, any case, and is stored as lower-case #rrggbb', () => {
  assert.equal(normaliseHex('#1E90FF'), '#1e90ff')
  assert.equal(normaliseHex('1e90ff'), '#1e90ff')
  assert.equal(normaliseHex(' #abc '), '#aabbcc')
  assert.equal(normaliseHex('F0a'), '#ff00aa')
  for (const bad of ['', '#', '#12', '#12345', '#1234567', 'ggg', '#gg0000', 'rgb(1,2,3)']) assert.equal(normaliseHex(bad), null, bad)
  assert.equal(hexProblem('#1e90ff'), null)
  assert.match(hexProblem('#12'), /not a colour/)
  assert.match(hexProblem(''), /3 or 6 hex digits/)
  assert.equal(isTagColorValue('red'), true)
  assert.equal(isTagColorValue('#a1b2c3'), true)
  assert.equal(isTagColorValue('#A1B2C3'), false, 'stored colours are already normalised')
  assert.equal(isTagColorValue('chartreuse'), false)
})

test('the wheel maths: hue, saturation and brightness round-trip through RGB', () => {
  eq(hsvToRgb(0, 1, 1), [255, 0, 0])
  eq(hsvToRgb(120, 1, 1), [0, 255, 0])
  eq(hsvToRgb(240, 1, 1), [0, 0, 255])
  eq(hsvToRgb(75, 0, 1), [255, 255, 255], 'the middle of the wheel is white')
  eq(hsvToRgb(75, 1, 0), [0, 0, 0], 'no brightness is black')
  eq(hsvToRgb(0, 1, 0.5), [128, 0, 0])
  eq(hslToRgb(0, 1, 0.5), [255, 0, 0])
  for (const hex of ['#1e90ff', '#ff69b4', '#123456', '#fedcba', '#808080', '#010203', '#ffff00']) {
    const [h, s2, v] = rgbToHsv(hexToRgb(hex))
    assert.equal(rgbToHex(hsvToRgb(h, s2, v)), hex, hex)
  }
})

test('contrast uses the WCAG relative luminance', () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21)
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1)
  assert.ok(Math.abs(contrastRatio([119, 119, 119], [255, 255, 255]) - 4.48) < 0.02, '#777 on white is the textbook 4.48')
})

const blendOver = (fg, alpha, bg) => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha))
const parseCss = (c) => c.match(/[\d.]+/g).map(Number)

test('a custom colour makes a chip that reads in both themes, for light, dark, saturated and grey colours', () => {
  const spread = ['#ffffff', '#000000', '#ff0000', '#0000ff', '#ffff00', '#00ff00', '#ff00ff', '#00ffff', '#808080', '#777777', '#fefefe', '#010101', '#1e90ff', '#ff69b4', '#f1ca00', '#003366']
  for (const hex of spread) {
    const style = customChipStyle(hex)
    for (const theme of ['light', 'dark']) {
      const st = style[theme]
      assert.ok(st.ratio >= 4.5, `${hex} ${theme} ${st.ratio}`)
      // Recomputed from the CSS that is applied, over each surface the chip can sit on.
      const text = parseCss(st.text).slice(0, 3)
      const bg = parseCss(st.bg)
      for (const surface of CHIP_SURFACES[theme]) {
        const ratio = contrastRatio(text, blendOver(bg.slice(0, 3), bg[3], surface))
        assert.ok(ratio >= 4.5, `${hex} ${theme} on ${surface} = ${ratio}`)
      }
      assert.match(st.bg, /^rgba\(\d+, \d+, \d+, 0\.14\)$/)
      assert.match(st.border, /^rgba\(\d+, \d+, \d+, 0\.4\)$/)
    }
  }
  assert.equal(customChipStyle('nonsense'), null)
})

test('text keeps the colour\'s hue where it can: lighter in the dark theme, darker in the light theme', () => {
  const red = customChipStyle('#ff0000')
  const [rl, gl] = parseCss(red.light.text)
  const [rd, gd] = parseCss(red.dark.text)
  assert.ok(rl < 255 && rl > gl, 'darker red on a light row')
  assert.ok(rd > 200 && gd > 0, 'lighter red on a dark row')
  // A colour that already reads is left alone.
  assert.equal(customChipStyle('#000000').light.text, 'rgb(0, 0, 0)')
  assert.equal(customChipStyle('#ffffff').dark.text, 'rgb(255, 255, 255)')
})

test('when moving the colour cannot reach 4.5, the text falls back to black or white, and says so', () => {
  const grey = { light: [[128, 128, 128]], dark: [[128, 128, 128]] }
  const style = customChipStyle('#888888', grey)
  assert.equal(style.dark.fellBack, true, 'lighter text on mid grey cannot reach it')
  assert.ok(style.dark.ratio >= 4.5)
  assert.match(style.dark.text, /^rgb\((0, 0, 0|255, 255, 255)\)$/)
  assert.equal(customChipStyle('#1e90ff').dark.fellBack, false)
})

// ---------------------------------------------------------------------------------------------------------------------
// The colour a new tag gets
// ---------------------------------------------------------------------------------------------------------------------

test('a new tag gets the first preset, in palette order, that no tag in use has', () => {
  assert.equal(pickAutoColor([]), 'slate')
  assert.equal(pickAutoColor(['slate']), 'blue')
  assert.equal(pickAutoColor(['slate', 'blue', 'teal']), 'green')
  assert.equal(pickAutoColor(['blue', 'teal']), 'slate', 'the first unused one, not the one after the last used')
  assert.equal(pickAutoColor(['slate', '#2563eb']), 'teal', 'a custom colour that is a preset counts as that preset')
  assert.equal(pickAutoColor(['slate', '#abcdef', 'blue']), 'teal', 'other custom colours do not use up a preset')
})

test('with every preset taken, a random hue at fixed saturation and lightness is chosen, not one in use', () => {
  const all = [...TAG_COLOR_KEYS]
  const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }
  const hexOf = (hue) => rgbToHex(hslToRgb(hue, 0.7, 0.5))
  assert.equal(pickAutoColor(all, seq(0.5)), hexOf(180), 'the injected source decides the hue')
  assert.equal(pickAutoColor(all, seq(0.25)), hexOf(90))
  // A hue already in use is skipped.
  assert.equal(pickAutoColor([...all, hexOf(180)], seq(0.5, 0.25)), hexOf(90))
  // A hue too close to a colour in use is passed over for a distant one.
  const near = hexOf(181)
  const picked = pickAutoColor([...all, hexOf(180)], seq(181 / 360, 300 / 360))
  assert.notEqual(picked, near)
  assert.ok(![...all, hexOf(180)].includes(picked))
  assert.match(picked, /^#[0-9a-f]{6}$/)
})

test('only a tag that is new gets a colour; existing tags are never recoloured and none is coloured retroactively', () => {
  // two new tags in one save get different colours, in name order
  eq(autoColorNewTags({ 1: ['a'] }, { 1: ['a', 'b'], 2: ['c'] }, { a: 'slate' }), { a: 'slate', b: 'blue', c: 'teal' })
  // a tag that exists without a colour stays without one
  eq(autoColorNewTags({ 1: ['x'] }, { 1: ['x', 'y'] }, {}), { y: 'slate' })
  // adding a tag that is already in use (even a coloured one) to another server changes nothing
  eq(autoColorNewTags({ 1: ['a'] }, { 1: ['a'], 2: ['a'] }, { a: 'red' }), { a: 'red' })
  eq(autoColorNewTags({ 1: ['a'] }, { 1: ['a'], 2: ['a'] }, {}), {})
  // a new tag that already has a stored colour keeps it
  eq(autoColorNewTags({}, { 1: ['a'] }, { a: '#123456' }), { a: '#123456' })
  // nothing new, nothing to do
  eq(autoColorNewTags({ 1: ['a'] }, { 1: ['a'] }, { a: 'green' }), { a: 'green' })
})

test('a tag removed from its last server frees its colour for the next new tag', () => {
  const colours = autoColorNewTags({ 1: ['a'] }, {}, { a: 'slate' })
  eq(colours, {}, 'the colour goes with the last server')
  eq(autoColorNewTags({}, { 1: ['b'] }, colours), { b: 'slate' }, 'and the next new tag takes it')
  // removed from one of two servers: still in use, colour kept, not given to the next one
  const kept = autoColorNewTags({ 1: ['a'], 2: ['a'] }, { 2: ['a'] }, { a: 'slate' })
  eq(kept, { a: 'slate' })
  eq(autoColorNewTags({ 2: ['a'] }, { 2: ['a', 'b'] }, kept), { a: 'slate', b: 'blue' })
})

test('with all presets in use the next new tag is a custom colour that is not one in use', () => {
  const colours = Object.fromEntries(TAG_COLOR_KEYS.map((k, i) => [`t${i}`, k]))
  const tags = Object.fromEntries(Object.keys(colours).map((t, i) => [i + 1, [t]]))
  const out = autoColorNewTags(tags, { ...tags, 99: ['fresh'] }, colours, () => 0.5)
  assert.match(out.fresh, /^#[0-9a-f]{6}$/)
  assert.ok(!Object.values(colours).map(canonicalColor).includes(out.fresh))
})

test('a colour written to a tag is kept as a preset key or lower-case hex, and a hex that is a preset is that preset', () => {
  eq(withTagColor({}, 'a', '#ABCDEF'), { a: '#abcdef' })
  eq(withTagColor({}, 'a', TAG_PRESET_HEX.red), { a: 'red' })
  eq(withTagColor({ a: '#abcdef' }, 'a', null), {})
  eq(renameTag({ 1: ['a'] }, { a: '#abcdef' }, 'a', 'b').colors, { b: '#abcdef' })
  eq(pruneTagColors({ a: '#abcdef', b: 'red' }, { 1: ['a'] }), { a: '#abcdef' })
})

// ---------------------------------------------------------------------------------------------------------------------
// Saved custom colours: at most eight, nothing dropped silently
// ---------------------------------------------------------------------------------------------------------------------

test('saving a custom colour adds it at the end; a repeat, a preset colour and a bad colour do nothing but say so', () => {
  const r = addCustomColour([], '#1E90FF')
  eq([r.status, r.list], ['added', ['#1e90ff']])
  assert.equal(r.message, 'Saved #1e90ff.')
  assert.equal(addCustomColour(r.list, '1e90ff').status, 'duplicate')
  assert.equal(addCustomColour(r.list, '1e90ff').list, r.list)
  assert.match(addCustomColour(r.list, '#1e90ff').message, /already saved/)
  const preset = addCustomColour(r.list, TAG_PRESET_HEX.blue)
  assert.equal(preset.status, 'preset')
  assert.equal(preset.list, r.list)
  assert.match(preset.message, /blue preset/)
  const bad = addCustomColour(r.list, 'nope')
  assert.equal(bad.status, 'invalid')
  assert.equal(bad.list, r.list)
  assert.match(bad.message, /not a colour/)
  // a new colour takes the first empty place, which is the end of the list: the order is the order they were saved
  eq(addCustomColour(['#111111', '#222222'], '#333333').list, ['#111111', '#222222', '#333333'])
})

const eight = Array.from({ length: MAX_CUSTOM_COLOURS }, (_, i) => rgbToHex([10 + i, 20, 30]))

test('with eight saved, saving asks first and changes nothing; only an explicit overwrite replaces, and it replaces the oldest', () => {
  assert.equal(eight.length, 8)
  const ask = addCustomColour(eight, '#ffeedd')
  assert.equal(ask.status, 'full')
  assert.equal(ask.list, eight, 'nothing is dropped without being asked twice')
  assert.equal(ask.message, 'Saving will overwrite the oldest saved colour. Click Save again to confirm.')
  assert.equal(addCustomColour(eight, '#ffeedd', false).status, 'full')
  const done = addCustomColour(eight, '#ffeedd', true)
  assert.equal(done.status, 'replaced')
  eq(done.list, [...eight.slice(1), '#ffeedd'], 'the first saved goes, the new one is last')
  assert.equal(done.list.length, 8)
  assert.ok(!done.list.includes(eight[0]))
  assert.ok(done.message.includes(eight[0]), 'it says which colour was replaced')
  // the next overwrite takes the next oldest
  eq(addCustomColour(done.list, '#eeddcc', true).list, [...eight.slice(2), '#ffeedd', '#eeddcc'])
  // the input is never changed
  assert.equal(eight.length, 8)
  assert.equal(eight[0], rgbToHex([10, 20, 30]))
})

test('at eight, a repeat, a preset colour and a bad colour still do nothing but say so, even when overwrite is asked for', () => {
  for (const overwrite of [false, true]) {
    const dup = addCustomColour(eight, eight[3].toUpperCase(), overwrite)
    assert.equal(dup.status, 'duplicate')
    assert.equal(dup.list, eight)
    assert.equal(addCustomColour(eight, TAG_PRESET_HEX.red, overwrite).status, 'preset')
    assert.equal(addCustomColour(eight, 'nonsense', overwrite).status, 'invalid')
    assert.equal(addCustomColour(eight, TAG_PRESET_HEX.red, overwrite).list, eight)
  }
})

test('removing a saved colour makes room: the next one goes to the end and nothing is overwritten', () => {
  const room = removeCustomColour(eight, eight[2])
  assert.equal(room.length, 7)
  const next = addCustomColour(room, '#ffeedd')
  assert.equal(next.status, 'added')
  eq(next.list, [...eight.slice(0, 2), ...eight.slice(3), '#ffeedd'])
  assert.equal(removeCustomColour(eight, 'nonsense'), eight)
})

test('a stored list of custom colours is cleaned: only colours, lower-case, no repeats, at most eight', () => {
  eq(cleanCustomColours(['#ABC', '#aabbcc', 'x', 7, null, '#112233']), ['#aabbcc', '#112233'])
  eq(cleanCustomColours('nope'), [])
  assert.equal(cleanCustomColours(Array.from({ length: 12 }, (_, i) => rgbToHex([i * 10, 0, 0]))).length, 8)
})

// ---------------------------------------------------------------------------------------------------------------------
// Searching and filtering by tag
// ---------------------------------------------------------------------------------------------------------------------

test('a search is plain text for servers and @ words for tags, and a word is one or the other', () => {
  eq(parseTagSearch('wp @wordpress'), { plain: 'wp', tagPrefixes: ['wordpress'] })
  eq(parseTagSearch('@Word @prod edge'), { plain: 'edge', tagPrefixes: ['word', 'prod'] })
  eq(parseTagSearch('  web  '), { plain: 'web', tagPrefixes: [] })
  eq(parseTagSearch('@'), { plain: '', tagPrefixes: [''] })
  eq(parseTagSearch('a@b'), { plain: 'a@b', tagPrefixes: [] }, 'an @ inside a word is part of a name')
  eq(parseTagSearch('my server'), { plain: 'my server', tagPrefixes: [] })
})

test('@ words match tags by prefix, all of them must match, and plain text never matches a tag', () => {
  assert.equal(matchesTagPrefixes(['wordpress', 'production'], ['word']), true)
  assert.equal(matchesTagPrefixes(['wordpress', 'production'], ['press']), false, 'a prefix, not a substring')
  assert.equal(matchesTagPrefixes(['wordpress', 'production'], ['word', 'prod']), true)
  assert.equal(matchesTagPrefixes(['wordpress'], ['word', 'prod']), false)
  assert.equal(matchesTagPrefixes(['wordpress'], ['w', 'wo']), true, 'two words may match the same tag')
  assert.equal(matchesTagPrefixes([], ['']), false, 'a lone @ wants a tagged server')
  assert.equal(matchesTagPrefixes(['a'], ['']), true)
  assert.equal(matchesTagPrefixes([], []), true)
})

test('typing @ offers tags in use, completes the last word, and leaves out tags already typed whole', () => {
  const inUse = [{ tag: 'api', count: 3 }, { tag: 'database', count: 2 }, { tag: 'wordpress', count: 5 }, { tag: 'wp', count: 1 }]
  eq(tagSuggestions('@', inUse).map((t) => t.tag), ['api', 'database', 'wordpress', 'wp'])
  eq(tagSuggestions('edge @w', inUse).map((t) => t.tag), ['wordpress', 'wp'])
  eq(tagSuggestions('@wordpress @w', inUse).map((t) => t.tag), ['wp'])
  eq(tagSuggestions('@wp', inUse), [], 'a tag typed in full has nothing left to complete')
  eq(tagSuggestions('wp', inUse), [], 'plain text offers no tags')
  eq(tagSuggestions('@w ', inUse), [], 'a finished word offers nothing')
  assert.equal(completeTagToken('@wo', 'wordpress'), '@wordpress ')
  assert.equal(completeTagToken('edge @', 'api'), 'edge @api ')
  assert.equal(completeTagToken('edge @a @wo', 'wordpress'), 'edge @a @wordpress ')
})

test('the tags in use are those on servers that exist, with their counts, alphabetical whatever the case', () => {
  const tags = { 1: ['b', 'a'], 2: ['a'], 3: ['Zed', 'ant'], 9: ['gone', 'a'], 10: ['gone'] }
  eq(liveTagCounts(tags, new Set([1, 2, 3])), [
    { tag: 'a', count: 2 },
    { tag: 'ant', count: 1 },
    { tag: 'b', count: 1 },
    { tag: 'Zed', count: 1 }
  ])
  eq(liveTagCounts(tags, new Set()), [])
  eq(liveTagCounts({}, new Set([1])), [])
})

test('the palette\'s tag rows: every tag in use that starts with what follows the @, first, in the Servers search\'s order', () => {
  const tags = Object.fromEntries('abcdefghijkl'.split('').map((c, i) => [i + 1, [`${c}tag`, 'wordpress']]))
  tags[20] = ['wp', 'Wordly']
  tags[99] = ['wolf'] // a server that is not in this account
  const live = liveTagCounts(tags, new Set([...Object.keys(tags).map(Number)].filter((id) => id !== 99)))
  const rows = (term) => tagSuggestions(term, live, Infinity).map((t) => t.tag)
  assert.equal(rows('@').length, 15, 'a lone @ lists every tag in use, not only the first eight')
  eq(rows('@').slice(0, 3), ['atag', 'btag', 'ctag'])
  eq(tagSuggestions('@', live).map((t) => t.tag), rows('@').slice(0, 8), 'the Servers search\'s list is the same list, cut short')
  eq(rows('@wo'), ['Wordly', 'wordpress'], 'a prefix, whatever its case, in the same alphabetical order')
  eq(rows('@WO'), ['Wordly', 'wordpress'])
  eq(rows('@w'), ['Wordly', 'wordpress', 'wp'])
  assert.ok(!rows('@w').includes('wolf'), 'a tag with no server in this account has no row')
  eq(rows('@wordpress'), [], 'a tag typed in full has no row of its own')
  eq(rows('@wordp'), ['wordpress'])
  eq(rows('@wordpress @w'), ['Wordly', 'wp'], 'a tag already typed in full is not offered again')
  eq(rows('@nothing'), [])
  eq(rows('wo'), [], 'plain text lists no tags')
  eq(rows('@wo '), [], 'a finished word offers nothing')
  const counts = Object.fromEntries(tagSuggestions('@wo', live, Infinity).map((t) => [t.tag, t.count]))
  eq(counts, { Wordly: 1, wordpress: 12 }, 'each row carries how many servers have the tag')
  // choosing a row completes the word and leaves the earlier ones: the query then lists that tag's servers
  assert.equal(completeTagToken('@wo', 'wordpress'), '@wordpress ')
  assert.equal(completeTagToken('@atag @wo', 'wordpress'), '@atag @wordpress ')
})

test('the tag filter keeps servers with any or all of the ticked tags, and everything when none is ticked', () => {
  const own = ['api', 'production']
  assert.equal(matchesTagFilter(own, [], 'any'), true)
  assert.equal(matchesTagFilter(own, [], 'all'), true)
  assert.equal(matchesTagFilter(own, ['api', 'wordpress'], 'any'), true)
  assert.equal(matchesTagFilter(own, ['api', 'wordpress'], 'all'), false)
  assert.equal(matchesTagFilter(own, ['api', 'production'], 'all'), true)
  assert.equal(matchesTagFilter([], ['api'], 'any'), false)
})

// ---------------------------------------------------------------------------------------------------------------------
// Two namespaces: plain text is a server, @x is a tag
// ---------------------------------------------------------------------------------------------------------------------

const fleet = [
  { id: 1, name: 'web', networks: { v4: [{ ip_address: '203.0.113.1' }] } },
  { id: 2, name: 'api-1' },
  { id: 3, name: 'db-1' },
  { id: 4, name: '@web' },
  { id: 5, name: 'all' },
  { id: 6, name: 'restart' }
]
const fleetTags = { 2: ['web'], 3: ['web', 'all', 'restart'] }
const ids = (matches) => matches.map((m) => m.server.id)
const target = (expression, groups = [], tags = fleetTags) => {
  const { expression: expanded, unknownGroups } = expandGroupRefs(expression, groups, fleet, tags)
  return { expanded, unknownGroups, ids: expanded ? ids(matchServers(fleet, expanded).matches) : [] }
}

test('a target without @ names servers only: a tag called web does not make "web" mean the tagged servers', () => {
  eq(ids(matchServers(fleet, 'web').matches), [1])
  const t = target('web')
  assert.equal(t.expanded, 'web', 'a name is passed through untouched; tags are not looked at')
  eq(t.ids, [1])
  eq(target('web', [], {}).ids, [1], 'with no tags at all the answer is the same')
  eq(target('db-*').ids, [3])
})

test('@x means tags only: it never matches a server named x, nor one named @x', () => {
  const t = target('@web')
  assert.equal(t.expanded, '#2,#3')
  eq(t.ids, [2, 3], 'not server 1 (named web) and not server 4 (named @web)')
  eq(target('web,@web').ids, [1, 2, 3])
  eq(target('@nothing').unknownGroups, ['@nothing'])
  eq(target('@nothing').ids, [], 'an unknown @ word is reported, not read as a name')
})

test('a server whose name starts with @ is addressed by #id, id or IP, and a pattern that reaches matchServers names servers only', () => {
  eq(target('#4').ids, [4])
  eq(target('4').ids, [4])
  eq(ids(matchServers(fleet, '203.0.113.1').matches), [1])
  eq(ids(matchServers(fleet, '@web').matches), [4], 'matchServers never reads tags; this is a name')
})

test('a tag named like a keyword or a special target is an ordinary tag: @all and @restart, and plain all and restart stay servers', () => {
  assert.equal(isGroupRef('@all'), true)
  assert.equal(isGroupRef('@restart'), true)
  eq(target('@all').ids, [3])
  eq(target('all').ids, [5])
  eq(target('@restart').ids, [3])
  eq(target('restart').ids, [6])
  assert.equal(normaliseTag('*'), '', 'a star cannot be a tag name, so no tag can stand for every server')
  assert.equal(isGroupRef('@'), false, 'a lone @ is not a group reference')
})

test('a saved group with the same name as a tag keeps today\'s behaviour: it also includes the tagged servers', () => {
  const group = { id: 'g1', name: 'web', pattern: 'db-*', serverIds: [], createdAt: '' }
  eq(resolveGroup(group, fleet, fleetTags).map((s) => s.id), [2, 3])
  eq(target('@web', [group]).ids, [2, 3], 'db-1 by the pattern, api-1 by the tag')
  const only = target('@web', [{ ...group, pattern: 'api-*' }], { 3: ['web'] })
  eq(only.ids, [2, 3])
  const names = effectiveGroups([group], fleetTags).filter((g) => g.name === 'web')
  assert.equal(names.length, 1, 'the tag does not add a second @web beside the saved group')
  assert.equal(names[0].id, 'g1')
  assert.ok(effectiveGroups([], fleetTags).find((g) => g.name === 'web').id.startsWith('tag_'), 'without a saved group the tag is the group')
})

// ---------------------------------------------------------------------------------------------------------------------
// Android back: the topmost open popover, editor or picker closes first
// ---------------------------------------------------------------------------------------------------------------------

test('back runs the topmost registered handler only, and answers false when nothing is open', () => {
  const log = []
  assert.equal(handleBack(), false, 'nothing open: the app goes back the way it always did')
  const closeEditor = pushBackHandler(() => log.push('editor'))
  const closePicker = pushBackHandler(() => log.push('picker'))
  assert.equal(backHandlerCount(), 2)
  assert.equal(handleBack(), true)
  eq(log, ['picker'], 'the one opened last is closed first, and the editor below it is left alone')
  closePicker()
  assert.equal(handleBack(), true)
  eq(log, ['picker', 'editor'])
  closeEditor()
  assert.equal(handleBack(), false)
  assert.equal(backHandlerCount(), 0)
})

test('a handler that closes itself leaves the next one on top, and unregistering twice or out of order is harmless', () => {
  const log = []
  const offA = pushBackHandler(() => log.push('a'))
  const offB = pushBackHandler(() => log.push('b'))
  const offC = pushBackHandler(() => log.push('c'))
  offB() // closed some other way, not by back
  offB()
  assert.equal(backHandlerCount(), 2)
  handleBack()
  eq(log, ['c'])
  offC()
  handleBack()
  eq(log, ['c', 'a'])
  offA()
  assert.equal(handleBack(), false)
  // the same function registered twice is two entries, each removed once
  const f = () => log.push('f')
  const off1 = pushBackHandler(f)
  const off2 = pushBackHandler(f)
  assert.equal(backHandlerCount(), 2)
  off1()
  assert.equal(backHandlerCount(), 1)
  off2()
  assert.equal(backHandlerCount(), 0)
})

// ---------------------------------------------------------------------------------------------------------------------
// Press and hold to remove a saved colour (the phone layout)
// ---------------------------------------------------------------------------------------------------------------------

test('a hold has three short vibrations at 0.4, 0.8 and 1.2 s and removes the colour with one longer one at 1.6 s', () => {
  eq(holdTimeline(), [
    { at: 400, kind: 'tick', vibrate: 25 },
    { at: 800, kind: 'tick', vibrate: 25 },
    { at: 1200, kind: 'tick', vibrate: 25 },
    { at: 1600, kind: 'delete', vibrate: 200 }
  ])
  eq([...HOLD_TICKS_MS], [400, 800, 1200])
  assert.equal(HOLD_DELETE_MS, 1600)
  const steps = holdTimeline()
  eq(steps.map((st) => st.at), [...steps.map((st) => st.at)].sort((x, y) => x - y), 'in time order')
  assert.equal(steps.filter((st) => st.kind === 'delete').length, 1, 'one removal, last')
  assert.equal(steps[steps.length - 1].kind, 'delete')
  assert.ok(steps[steps.length - 1].vibrate > steps[0].vibrate, 'the removal is the longer one: the vibration API can lengthen a buzz, not strengthen it')
})

test('the ring fills evenly over the hold and never passes full', () => {
  assert.equal(holdProgress(0), 0)
  assert.equal(holdProgress(800), 0.5)
  assert.equal(holdProgress(1600), 1)
  assert.equal(holdProgress(5000), 1)
  assert.equal(holdProgress(-20), 0)
})

test('a finger that moves more than eight pixels is dragging, not holding', () => {
  assert.equal(HOLD_MOVE_TOLERANCE_PX, 8)
  assert.equal(holdMovedTooFar(0, 0), false)
  assert.equal(holdMovedTooFar(8, 0), false)
  assert.equal(holdMovedTooFar(0, -8), false)
  assert.equal(holdMovedTooFar(5, 6), false, '7.8 pixels')
  assert.equal(holdMovedTooFar(6, 6), true, '8.5 pixels')
  assert.equal(holdMovedTooFar(9, 0), true)
  assert.equal(holdMovedTooFar(-3, 9), true)
})

// ---------------------------------------------------------------------------------------------------------------------
// Names that are also members of every object: constructor, __proto__, and the rest
// ---------------------------------------------------------------------------------------------------------------------

const PROTO_NAMES = ['constructor', '__proto__', 'prototype', 'hasownproperty', 'tostring', 'valueof', '__definegetter__']
const untouched = () => {
  assert.equal(Object.getPrototypeOf({}), Object.prototype)
  assert.equal({}.constructor, Object)
  for (const k of ['slate', 'red', 'polluted', 'x']) assert.equal({}[k], undefined, `Object.prototype.${k}`)
}

test('stored tag colours are rebuilt key by key: only a preset or a lower-case #rrggbb for a normalised name comes out', () => {
  const raw = JSON.parse(
    '{"ok":"red","hex":"#a1b2c3","UPPER":"red","upperhex":"#A1B2C3","url":"url(javascript:alert(1))","short":"#abc","junk":"banana","num":5,"nil":null,"arr":["red"],"nested":{"a":"red"},"fn":"constructor","bad name":"red","":"red","__proto__":"slate","constructor":"teal"}'
  )
  const clean = cleanTagColors(raw)
  eq(clean, { ok: 'red', hex: '#a1b2c3', ['__proto__']: 'slate', constructor: 'teal' })
  assert.equal(Object.getPrototypeOf(clean), null, 'no prototype to inherit from or to change')
  assert.equal(clean.__proto__, 'slate', '__proto__ is an ordinary key of it')
  assert.equal(colorOf(clean, 'constructor'), 'teal')
  assert.equal(colorOf(clean, 'toString'), undefined)
  assert.equal(colorOf(clean, 'upper'), undefined)
  untouched()
  for (const bad of [null, undefined, 'red', 7, true, [], ['red'], () => 1]) eq(cleanTagColors(bad), {}, String(bad))
})

test('stored tags are rebuilt key by key: whole-number server ids, lists of normalised names without repeats', () => {
  const raw = JSON.parse(
    '{"12":["web","db","web"],"7":"web","8":[1,null,{"a":1},"Upper","has space","","ok"],"x":["web"],"1.5":["a"],"-3":["a"],"9":{"0":"web"},"__proto__":["web"],"constructor":["web"],"13":["constructor","__proto__"]}'
  )
  const clean = cleanTagMap(raw)
  eq(clean, { 12: ['web', 'db'], 8: ['ok'], 13: ['constructor', '__proto__'] })
  assert.equal(Object.getPrototypeOf(clean), null)
  untouched()
  for (const bad of [null, 'web', 3, [], [['web']], () => 1]) eq(cleanTagMap(bad), {})
})

test('a colour lookup counts only the map\'s own entries, and a value that is not a colour is not one', () => {
  assert.equal(colorOf({}, 'constructor'), undefined, 'an ordinary object inherits constructor; that is not a colour')
  assert.equal(colorOf({}, '__proto__'), undefined)
  assert.equal(colorOf({ constructor: 'red' }, 'constructor'), 'red')
  assert.equal(colorOf(JSON.parse('{"__proto__":"red"}'), '__proto__'), 'red', 'parsed JSON has it as an own key')
  assert.equal(colorOf({ a: 'url(x)' }, 'a'), undefined)
  assert.equal(colorOf({ a: 5 }, 'a'), undefined)
  assert.equal(colorOf(null, 'a'), undefined)
  assert.equal(colorOf(undefined, 'a'), undefined)
  assert.equal(hasOwn({}, 'constructor'), false)
  assert.equal(hasOwn(newColorMap(), 'constructor'), false)
  // what a colour consumer is handed can be anything: it never throws
  for (const v of [() => 1, 5, null, undefined, {}, [], Symbol.iterator.toString()]) {
    assert.equal(normaliseHex(v), null)
    assert.equal(isTagColorKey(v), false)
    assert.equal(isTagColorValue(v), false)
    assert.equal(canonicalColor(v) === '' || canonicalColor(v) === v, true)
  }
  assert.equal(hexProblem(5) !== null, true)
})

for (const name of PROTO_NAMES) {
  test(`a tag named ${name} is an ordinary tag: add, colour, rename, merge, filter, search, target, delete`, () => {
    // add it to two servers
    let tags = withTag(newTagMap(), [1, 2], name, true)
    eq(tags, { 1: [name], 2: [name] })
    assert.deepEqual(allTags(tags), [{ tag: name, count: 2 }])
    assert.equal(tagServerCount(tags, name), 2)
    assert.deepEqual(liveTagCounts(tags, new Set([1, 2, 3])), [{ tag: name, count: 2 }])
    // a new tag gets a colour of its own, and it is the same one after a round trip through storage
    let colors = autoColorNewTags(newTagMap(), tags, newColorMap(), () => 0.5)
    assert.equal(colorOf(colors, name), 'slate')
    assert.equal(Object.getPrototypeOf(colors), null)
    const stored = cleanTagColors(JSON.parse(JSON.stringify(colors)))
    assert.equal(colorOf(stored, name), 'slate', 'it survives being written and read back')
    untouched()
    // a second tag gets the next colour; the first keeps its own
    const both = autoColorNewTags(tags, withTag(tags, [1], 'other', true), colors, () => 0.5)
    assert.equal(colorOf(both, name), 'slate')
    assert.equal(colorOf(both, 'other'), 'blue')
    // choose, change and clear its colour
    colors = withTagColor(colors, name, '#ABCDEF')
    assert.equal(colorOf(colors, name), '#abcdef')
    assert.equal(colorOf(withTagColor(colors, name, 'red'), name), 'red')
    assert.equal(colorOf(withTagColor(colors, name, null), name), undefined)
    untouched()
    // rename away from it and back to it: the colour travels
    const away = renameTag(tags, colors, name, 'plain')
    eq(away.tags, { 1: ['plain'], 2: ['plain'] })
    assert.equal(away.renamed, 2)
    assert.equal(colorOf(away.colors, 'plain'), '#abcdef')
    assert.equal(colorOf(away.colors, name), undefined)
    const back = renameTag(away.tags, away.colors, 'plain', name)
    eq(back.tags, { 1: [name], 2: [name] })
    assert.equal(colorOf(back.colors, name), '#abcdef')
    // merge into it: a server with both keeps one, and its colour stays
    const mergeTags = withTag(withTag(newTagMap(), [1], name, true), [1, 3], 'x', true)
    const merged = renameTag(mergeTags, withTagColor(newColorMap(), name, 'green'), 'x', name)
    assert.equal(merged.merged, true)
    eq(merged.tags, { 1: [name], 3: [name] })
    assert.equal(colorOf(merged.colors, name), 'green')
    // filter by it, any and all
    assert.equal(matchesTagFilter(['x', name], [name], 'any'), true)
    assert.equal(matchesTagFilter(['x', name], [name, 'x'], 'all'), true)
    assert.equal(matchesTagFilter(['x'], [name], 'any'), false)
    // @name search, suggestions, and as a target
    assert.deepEqual(parseTagSearch(`wp @${name}`), { plain: 'wp', tagPrefixes: [name] })
    assert.equal(matchesTagPrefixes([name], [name]), true)
    assert.equal(matchesTagPrefixes(['x'], [name]), false)
    const inUse = liveTagCounts(tags, new Set([1, 2]))
    assert.deepEqual(tagSuggestions(`@${name.slice(0, 2)}`, inUse, Infinity).map((t) => t.tag), name.length > 2 ? [name] : [])
    const fleet = [{ id: 1, name: 'one' }, { id: 2, name: 'two' }, { id: 3, name: name }]
    const target = expandGroupRefs(`@${name}`, [], fleet, tags)
    assert.equal(target.expression, '#1,#2', 'the tagged servers, not the server named like the tag')
    assert.deepEqual(target.unknownGroups, [])
    assert.deepEqual(matchServers(fleet, target.expression).matches.map((m) => m.server.id), [1, 2])
    assert.deepEqual(matchServers(fleet, name).matches.map((m) => m.server.id), [3], 'the plain name is the server')
    assert.equal(effectiveGroups([], tags).find((g) => g.name === name).id, `tag_${name}`)
    // delete it from every server: its colour goes with it, and the next new tag may take the colour
    const none = withTag(tags, [1, 2], name, false)
    eq(none, {})
    const gone = autoColorNewTags(tags, none, colors, () => 0.5)
    assert.equal(colorOf(gone, name), undefined)
    eq(pruneTagColors(colors, none), {})
    eq(pruneTagColors(colors, tags), { [name]: '#abcdef' })
    untouched()
  })
}
