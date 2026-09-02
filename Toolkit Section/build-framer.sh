#!/usr/bin/env bash
#
# Regenerate index-framer.html from index.html.
#
# index-framer.html is index.html plus an appended "Framer embed layer" -- it is
# GENERATED, never hand-edited. Edit index.html (or the layer at the bottom of
# this script), then re-run:   bash build-framer.sh
#
set -euo pipefail
cd "$(dirname "$0")"
SRC=index.html
OUT=index-framer.html
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

LAYER=$(mktemp); trap 'rm -f "$LAYER"' EXIT
sed -n '/^#LAYER$/,$p' "$0" | tail -n +2 | sed 's/$/\r/' > "$LAYER"

BODY=$(grep -n '</body>' "$SRC" | tail -1 | cut -d: -f1)
head -n "$((BODY - 1))" "$SRC" >  "$OUT"
cat "$LAYER"                   >> "$OUT"
tail -n "+$BODY" "$SRC"        >> "$OUT"

echo "$OUT: $(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines (spliced at $SRC:$BODY)"
exit 0

#LAYER

<!-- =====================================================================
     FRAMER EMBED LAYER

     Everything above this comment is a byte-identical copy of index.html.
     This block is appended, never merged, so the demo above stays the one
     source of truth: re-copy index.html and re-append this to regenerate.

     Booth mode already strips the page down to a bare 360x800 device
     (see the booth CSS around line 3511). What it cannot do inside an
     <iframe> is discover that it should be ON, or cope with a frame that
     is not exactly 360x800. That is what this layer is for.
     ===================================================================== -->
<style>
/* The iframe IS the device. No page around it, no scrollbars, no bounce. */
html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
body.booth { background: #0a0a0c; }

/* An embed is a touch surface, not a document: no text selection, no
   long-press callout, no blue tap flash, no dragging the artwork out. */
body.booth, body.booth * {
  -webkit-user-select: none; -moz-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
body.booth { touch-action: manipulation; }   /* kills the 300ms double-tap zoom */
body.booth img, body.booth svg { -webkit-user-drag: none; user-drag: none; }

/* Scale-to-fit is applied as `zoom` in script, not `transform`. See note 2. */
</style>
<script>
(function () {
  'use strict';

  var STAGE_W = 360, STAGE_H = 800;   /* the booth stage, fixed by design */
  var scale = 1;

  /* 1 -- Booth mode is forced.
   *
   * The original picks booth by viewport (<= 420px) or a ?booth query string.
   * Neither survives an embed: Framer sizes the <iframe> to whatever the frame
   * is, and a query on the PAGE url never reaches the iframe document. So the
   * class is asserted directly rather than inferred.
   *
   * applyBooth() is also bound to resize and would toggle booth back OFF above
   * 420px. Listeners fire in registration order and ours is registered later,
   * so it runs after applyBooth() on every resize and re-asserts. */
  function forceBooth() { document.body.classList.add('booth'); }

  /* 2 -- Scale to fit, with `zoom` rather than `transform`.
   *
   * The stage is a fixed 360x800. Booth centres it and clips the overflow,
   * which is correct for a real 360px kiosk panel and wrong for a Framer frame
   * of arbitrary size, where clipping would eat the demo.
   *
   * `transform: scale()` is the reflex here and it is WRONG for this page --
   * verified, not assumed. Under a transform the phone's box reports as scaled
   * (getBoundingClientRect returns 630x1400 at 1.75) while the demo panels
   * still paint at 360x800, so the account card and the composer fall outside
   * the painted area and are clipped away. `zoom` participates in layout
   * instead of being a paint-time effect, so the panels lay out against the
   * scaled box and the whole screen survives.
   *
   * Browser floor: zoom is Chrome/Edge/Safari-always and Firefox 126+. Framer's
   * canvas, preview and published sites are Chromium/WebKit, so this is safe
   * there; on an ancient Firefox the demo simply renders unscaled at 360x800. */
  function fit() {
    var phone = document.querySelector('.phone');
    if (!phone) return;
    scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    phone.style.zoom = scale;
  }

  function sync() { forceBooth(); fit(); }
  sync();
  window.addEventListener('resize', sync);

  /* 3 -- Correct the tap ripple under scale.
   *
   * The ripple handler measures `e.clientX - rect.left` -- viewport pixels off
   * a ZOOMED rect -- then writes it as an inline `left` inside the phone's own
   * unzoomed coordinate space, where it is multiplied by the zoom again, so the
   * dot lands 1/scale away from the finger.
   * Rather than fork that handler, catch the node as it is appended and divide
   * it back. At scale 1 the arithmetic is a no-op.
   *
   * The guided tour does the same kind of rect arithmetic, but booth mode hides
   * .demo-copy and with it the tour button, so it is unreachable here. */
  var screenNode = document.querySelector('.screen');
  if (screenNode && window.MutationObserver) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1 || !n.classList || !n.classList.contains('ripple')) return;
          n.style.left = (parseFloat(n.style.left) / scale) + 'px';
          n.style.top  = (parseFloat(n.style.top)  / scale) + 'px';
        });
      });
    }).observe(screenNode, { childList: true });
  }

  /* 4 -- An embedded demo should not offer the browser's document affordances. */
  document.addEventListener('contextmenu',  function (e) { e.preventDefault(); });
  document.addEventListener('dragstart',    function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
})();
</script>
