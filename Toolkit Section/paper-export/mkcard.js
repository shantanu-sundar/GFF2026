// Build one booth product card as Paper-ready HTML.
//
// The glyphs are lifted straight out of index.html rather than retyped, so the
// Paper artboard carries the same marks the booth does -- including Relay's
// real gradient logo, which is the one product here with a logo rather than a
// drawn glyph.
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Toolkit/Toolkit Section/index.html';
const ASSETS = path.join(__dirname, 'assets').replace(/\\/g, '/');
const html = fs.readFileSync(SRC, 'utf8');

// Pull the inline <svg> that sits inside a given card's .hlock.
function glyph(cardId) {
  const at = html.indexOf('id="' + cardId + '"');
  if (at < 0) throw new Error('card not found: ' + cardId);
  const chunk = html.slice(at, at + 12000);
  const s = chunk.indexOf('<svg');
  const e = chunk.indexOf('</svg>', s);
  if (s < 0 || e < 0) throw new Error('no svg in ' + cardId);
  return chunk.slice(s, e + 6);
}

const CARDS = {
  relay: {
    layer: 'Relay', cardId: 'card-relay', art: 'a-relay.webp',
    // Relay's mark is two thin strokes on a wide footprint, so the booth runs it
    // past its 27px box. Offsets instead of the original negative margins, which
    // Paper asks us not to use.
    svgStyle: 'position:absolute; left:-6%; top:-9%; width:118%; height:118%;',
    name: 'Relay', thin: null,
  },
  spark: {
    layer: 'Spark', cardId: 'card-spark', art: 'a-spark.webp',
    svgStyle: 'width:100%; height:100%; display:block;',
    name: 'Spark', thin: null,
  },
  builders: {
    layer: 'Cashfree For Builders', cardId: 'card-builders', art: 'a-builders.webp',
    svgStyle: 'width:100%; height:100%; display:block;',
    name: 'Cashfree ', thin: 'For Builders',
  },
};

const key = process.argv[2];
const c = CARDS[key];
if (!c) throw new Error('unknown card: ' + key);

const svg = glyph(c.cardId)
  .replace(/\sclass="[^"]*"/g, '')
  .replace(/<svg /, '<svg style="' + c.svgStyle + '" ');

// The render is 664x774; at the card's 168px content height that is 144px wide.
const art =
  '<img layer-name="' + c.layer + ' render" src="paper-asset://' + ASSETS + '/' + c.art + '" ' +
  'style="position:absolute; right:0; bottom:0; height:100%; width:144px; ' +
  'object-fit:contain; object-position:right bottom;" />';

const label = c.thin
  ? '<div style="font-family:\'DM Sans\'; font-size:22px; font-weight:800; letter-spacing:-0.035em; line-height:1.14; color:#ffffff;">' + c.name +
    '<span style="font-weight:400; color:rgba(255,255,255,0.92);">' + c.thin + '</span></div>'
  : '<div style="font-family:\'DM Sans\'; font-size:22px; font-weight:800; letter-spacing:-0.035em; line-height:1.14; color:#ffffff;">' + c.name + '</div>';

const out = `<div layer-name="${c.layer}" style="position:relative; overflow:hidden; width:100%; min-height:168px; border:1px solid rgba(255,255,255,0.07); border-radius:21px; background:#000000; padding:15px 16px 14px; display:flex; flex-direction:column; justify-content:flex-start;">
  ${art}
  <div layer-name="Lockup" style="position:relative; display:flex; align-items:flex-start; gap:11px; max-width:58%;">
    <div layer-name="Mark" style="position:relative; width:27px; height:27px; flex-shrink:0; color:#ffffff;">${svg}</div>
    ${label}
  </div>
</div>`;

const file = path.join(__dirname, 'card-' + key + '.html');
fs.writeFileSync(file, out);
console.log('wrote', file, '(' + out.length + ' chars, svg ' + svg.length + ')');
