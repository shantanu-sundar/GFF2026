// The DOM -> Paper compiler, as a string evaluated inside the page.
//
// Paper's write_html only accepts concrete literal CSS, and forbids margin,
// display:grid, display:inline and tables. Computed styles give us the literal
// values for free; the rest is three rewrites:
//
//   grid   -> flex. Every grid in this UI is single-column, so it is just a
//             column (or a centring box) wearing a different name.
//   margin -> padding on a wrapper. A margin around E is geometrically the same
//             as padding around E inside a shrink-wrapped parent, and that IS
//             expressible. `auto` margins become flex alignment instead.
//   inline -> its own node. Paper has no rich text, so a <span> that styles part
//             of a sentence has to become a separate text node in a wrapping row.
//
// Images are emitted as __ASSET:<n>__ placeholders and resolved to files by the
// caller, so no base64 travels through the transcript.
module.exports = `(() => {
  const root = document.querySelector('.screen');
  const assets = [];
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const px = v => (!v || v === '0px' || v === 'normal' || v === 'auto') ? null : v;
  const isZero = v => !v || v === '0px' || v === 'none' || v === 'normal';

  // Colours that paint nothing.
  const blank = c => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';

  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5 && !el.children.length) return false;
    return true;
  }

  // Does this element hold text directly (not only through element children)?
  function ownText(el) {
    return [...el.childNodes]
      .filter(n => n.nodeType === 3 && n.textContent.trim())
      .map(n => n.textContent.replace(/\\s+/g, ' '))
      .join('');
  }

  function styleFor(el, s, r, gridParent) {
    const out = [];
    const put = (k, v) => { if (v != null && v !== '') out.push(k + ':' + v); };

    // ---- layout ----
    let display = s.display;
    if (display.includes('grid')) display = 'flex';
    else if (display === 'inline') display = 'flex';
    else if (display === 'inline-block' || display === 'inline-flex') display = 'flex';
    else if (display === 'block') display = 'flex';
    put('display', display);

    if (display === 'flex') {
      // A grid stays visually a column unless its own flow was a row.
      let dir = s.flexDirection;
      if (s.display.includes('grid')) {
        const cols = (s.gridTemplateColumns || '').split(' ').filter(Boolean).length;
        dir = cols > 1 ? 'row' : 'column';
      } else if (s.display === 'block') {
        dir = 'column';
      } else if (s.display === 'inline') {
        dir = 'row';
      }
      put('flex-direction', dir);
      if (s.alignItems && s.alignItems !== 'normal') put('align-items', s.alignItems);
      if (s.justifyContent && s.justifyContent !== 'normal') put('justify-content', s.justifyContent);
      if (s.flexWrap && s.flexWrap !== 'nowrap') put('flex-wrap', s.flexWrap);
      // A 2-up grid is a wrapping row, not a single row: without the wrap all
      // four ledger cells try to share one line and every label truncates.
      if (s.display.includes('grid') && dir === 'row') put('flex-wrap', 'wrap');
      const gap = s.display.includes('grid')
        ? (px(s.rowGap) || px(s.columnGap))
        : px(s.gap && s.gap.split(' ')[0]);
      if (gap) put('gap', gap);
    }

    // ---- position ----
    if (s.position === 'absolute' || s.position === 'fixed') {
      put('position', 'absolute');
      const pr = el.offsetParent ? el.offsetParent.getBoundingClientRect() : r;
      put('left', Math.round(r.left - pr.left) + 'px');
      put('top', Math.round(r.top - pr.top) + 'px');
      put('width', Math.round(r.width) + 'px');
      put('height', Math.round(r.height) + 'px');
      if (s.zIndex && s.zIndex !== 'auto') put('z-index', s.zIndex);
    } else {
      // Fixed sizes only where the author set one; otherwise let content size it.
      if (s.width !== 'auto' && el.style.width || /px/.test(s.flexBasis)) {}
      const wSet = s.flexGrow !== '0' || s.flexShrink !== '1' || s.flexBasis !== 'auto';
      if (wSet) put('flex', s.flexGrow + ' ' + s.flexShrink + ' ' + s.flexBasis);
      if (s.alignSelf && s.alignSelf !== 'auto') put('align-self', s.alignSelf);
    }

    if (gridParent && s.position !== 'absolute') {
      put('width', Math.round(r.width) + 'px');
      put('flex', '0 0 auto');
    }

    // Explicit box sizes for leaf-ish boxes that would otherwise collapse.
    const leafBox = !el.children.length && !ownText(el);
    if (leafBox) {
      put('width', Math.round(r.width) + 'px');
      put('height', Math.round(r.height) + 'px');
      put('flex-shrink', '0');
    }
    if (!isZero(s.minHeight)) put('min-height', s.minHeight);
    if (s.maxWidth !== 'none' && /px/.test(s.maxWidth)) put('max-width', s.maxWidth);

    // ---- spacing (padding only; margins are absorbed by a wrapper) ----
    const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    if (pad.some(v => v !== '0px')) put('padding', pad.join(' '));

    // ---- paint ----
    if (!blank(s.backgroundColor)) put('background-color', s.backgroundColor);
    if (s.backgroundImage && s.backgroundImage !== 'none') {
      const m = s.backgroundImage.match(/url\\("?(data:[^")]+)"?\\)/);
      if (m) {
        assets.push(m[1]);
        put('background-image', 'url(__ASSET:' + (assets.length - 1) + '__)');
        put('background-size', s.backgroundSize);
        put('background-position', s.backgroundPosition);
        put('background-repeat', s.backgroundRepeat);
      } else if (/gradient/.test(s.backgroundImage)) {
        put('background-image', s.backgroundImage);
      }
    }
    if (parseFloat(s.borderTopWidth) > 0 && !blank(s.borderTopColor)) {
      const uniform = s.borderTopWidth === s.borderBottomWidth &&
                      s.borderTopWidth === s.borderLeftWidth &&
                      s.borderTopWidth === s.borderRightWidth &&
                      s.borderTopColor === s.borderBottomColor;
      if (uniform) put('border', s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor);
      else put('border-top', s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor);
    } else if (parseFloat(s.borderBottomWidth) > 0 && !blank(s.borderBottomColor)) {
      put('border-bottom', s.borderBottomWidth + ' ' + s.borderBottomStyle + ' ' + s.borderBottomColor);
    }
    if (!isZero(s.borderRadius)) put('border-radius', s.borderRadius);
    if (s.boxShadow && s.boxShadow !== 'none') put('box-shadow', s.boxShadow);
    if (s.overflow === 'hidden' || s.overflow === 'clip') put('overflow', 'hidden');
    const scrolls = /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    if (scrolls) {
      put('height', Math.round(r.height) + 'px');
      put('flex', '0 0 ' + Math.round(r.height) + 'px');
      put('overflow', 'hidden');
      put('justify-content', 'flex-end');
    }
    const op = parseFloat(s.opacity);
    if (op < 1) put('opacity', String(op));

    // ---- type (only where it differs from the parent) ----
    const t = ownText(el);
    if (t) {
      put('font-family', s.fontFamily.split(',')[0].replace(/["']/g, ''));
      put('font-size', s.fontSize);
      put('font-weight', s.fontWeight);
      put('color', s.color);
      if (s.letterSpacing !== 'normal') put('letter-spacing', s.letterSpacing);
      if (s.lineHeight !== 'normal') put('line-height', s.lineHeight);
      if (s.textTransform !== 'none') put('text-transform', s.textTransform);
      if (s.textAlign !== 'start' && s.textAlign !== 'left') put('text-align', s.textAlign);
      if (/pre/.test(s.whiteSpace)) put('white-space', s.whiteSpace);
      else if (s.whiteSpace === 'nowrap') put('white-space', 'nowrap');
      else {
        const lh = parseFloat(s.lineHeight) || (parseFloat(s.fontSize) * 1.3);
        if (r.height <= lh * 1.35) { put('white-space', 'nowrap'); put('flex-shrink', '0'); }
      }
      if (s.textOverflow === 'ellipsis') { put('overflow', 'hidden'); put('text-overflow', 'ellipsis'); }
    }
    return out.join('; ');
  }

  function walk(el, depth, gridParent) {
    if (depth > 22 || !visible(el)) return '';
    const tag = el.tagName.toLowerCase();

    // SVG survives as-is: Paper understands it, and redrawing it would be worse.
    if (tag === 'svg') {
      const r = el.getBoundingClientRect();
      const clone = el.cloneNode(true);
      clone.removeAttribute('class');
      clone.setAttribute('style', 'width:' + Math.round(r.width) + 'px; height:' +
                                  Math.round(r.height) + 'px; display:block;');
      return clone.outerHTML;
    }
    if (tag === 'img') {
      const r = el.getBoundingClientRect();
      assets.push(el.src);
      return '<img src="__ASSET:' + (assets.length - 1) + '__" style="width:' +
             Math.round(r.width) + 'px; height:' + Math.round(r.height) + 'px; object-fit:contain;" />';
    }

    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const style = styleFor(el, s, r, gridParent);
    const name = (el.className && typeof el.className === 'string')
      ? el.className.split(' ').filter(Boolean).slice(0, 2).join(' ') : tag;

    // Children: element children plus this element's own text runs, in order.
    let inner = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const txt = node.textContent.replace(/\\s+/g, ' ');
        if (!txt.trim()) continue;
        // A bare text run inside a box that also has element children has to
        // become its own node, or Paper would drop it into rich text.
        inner += el.children.length
          ? '<div style="font-family:' + s.fontFamily.split(',')[0].replace(/["']/g, '') +
            '; font-size:' + s.fontSize + '; font-weight:' + s.fontWeight +
            '; color:' + s.color + '; line-height:' + s.lineHeight +
            '; white-space:nowrap; flex-shrink:0;">' + esc(txt) + '</div>'
          : esc(txt);
      } else if (node.nodeType === 1) {
        inner += walk(node, depth + 1, s.display.includes('grid'));
      }
    }

    const open = '<div layer-name="' + esc(name || tag) + '" style="' + style + '">';
    const self = open + inner + '</div>';

    // Absorb this element's margins into a padded wrapper.
    const m = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft];
    const hasAuto = m.some(v => v === 'auto');
    const hasPx = m.some(v => v !== '0px' && v !== 'auto' && Math.abs(parseFloat(v)) > 0.5);
    if (s.position === 'absolute' || s.position === 'fixed' || (!hasAuto && !hasPx)) return self;

    const wrapStyle = ['display:flex'];
    if (hasPx) wrapStyle.push('padding:' + m.map(v => v === 'auto' ? '0px' : v).join(' '));
    // margin-left:auto in a row is "push me to the end" -- say that in flex.
    if (m[3] === 'auto' && m[1] !== 'auto') wrapStyle.push('margin-left-auto');
    return '<div layer-name="sp" style="' + wrapStyle.filter(x => x !== 'margin-left-auto').join('; ') +
           (m[3] === 'auto' ? '; flex:1; justify-content:flex-end' : '') + '">' + self + '</div>';
  }

  const html = walk(root, 0, false);
  return JSON.stringify({ html, assets });
})()`;
