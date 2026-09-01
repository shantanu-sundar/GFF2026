#!/usr/bin/env python3
"""
Expand the repeated artboards in `Toolkit Section/checkout-frames.html`, and
assemble `Toolkit Section/booth-frames.html` out of the same parts.

Frames 02-05 of the mobile flow are the SAME base checkout screen with one
element lifted out of a dim, plus a callout. Writing that base screen out five
times by hand is how the five copies drift apart, so the file keeps exactly one
copy -- frame 01, between the CO:START / CO:END markers -- and this script
stamps it into the rest between GEN:START / GEN:END.

`booth-frames.html` is the eight-frame loop for the booth: the two screens
authored between BOOTH:START / BOOTH:END (the dark Introducing splash and the
Copper Kettle cart) followed by the same six checkout frames, renumbered B03-B08
and rewired to run as a loop. It is written as a standalone file -- its own head
and the same stylesheet, copied, not linked -- so it imports on its own with
nothing else in it.

It also inlines the photography. `Checkout Screen/OCC + AOV.png` is a 720x1600
2x export; the two mug tiles and the merchant logo are cropped straight out of
it and embedded as data: URIs, so neither file resolves a relative path.

    python scripts/build-checkout-frames.py

Idempotent: re-run it after editing frame 01 (or the two booth screens) and
everything downstream follows. If you edit a GENERATED frame instead, the next
run overwrites you -- edit the source frame.
"""

import base64
import io
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python -m pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "Toolkit Section", "checkout-frames.html")
BOOTH = os.path.join(ROOT, "Toolkit Section", "booth-frames.html")
REF = os.path.join(ROOT, "Checkout Screen", "OCC + AOV.png")

# Crop boxes in the 720x1600 reference, found by scanning for colour
# boundaries rather than by eye -- see the section README.
CROPS = {
    "__MUG_GREEN__": (56, 670, 212, 826),
    "__MUG_TERRA__": (558, 670, 714, 826),
    "__CK_LOGO__": (84, 88, 181, 185),
}


def data_uris():
    """Crop the reference and return {token: data-uri}. JPEG at q86 keeps the
    many copies of each image to ~7KB rather than ~22KB of PNG."""
    src = Image.open(REF).convert("RGB")
    out = {}
    for token, box in CROPS.items():
        buf = io.BytesIO()
        src.crop(box).save(buf, "JPEG", quality=86, optimize=True)
        out[token] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return out


# ---------------------------------------------------------------------------
# The four callouts. `lift` is the box the highlighted element occupies in the
# 360x800 frame, measured off the reference; `sel` is the element in the base
# markup to re-emit there. Every number here is halved from the 2x export.
#
# Each callout carries two identities: `num`/`goto` for the artboard sheet, and
# `bnum`/`bgoto` for the booth loop, where the same screen is frames B04-B07.
# ---------------------------------------------------------------------------
CALLOUTS = [
    dict(
        num="02", bnum="B04", name="Pre-filled Delivery Address",
        heading="Pre-filled Delivery Address",
        body="Pre-fills saved shipping details to eliminate typing and speed up checkout.",
        sel="co-addr", lift=(16, 154, 328),
        note=(80, 322), note_w=272,
        arrow=(48, 296, 30, 66, "M24 62C7 45 3 26 11 5", "M4 15L11 4L19 10"),
        goto="03 Contextual Cross-selling", bgoto="B05 Contextual Cross-selling",
    ),
    dict(
        num="03", bnum="B05", name="Contextual Cross-selling",
        heading="Contextual Cross-selling",
        body="Drives higher basket size with instant, single-click product recommendations.",
        sel="co-cars", lift=(0, 326, 360),
        note=(36, 466), note_w=292,
        arrow=(272, 448, 58, 72, "M6 68C22 57 42 40 51 9", "M40 13L52 4L55 17"),
        goto="04 Instant Coupons & Discount", bgoto="B06 Instant Coupons & Discount",
    ),
    dict(
        num="04", bnum="B06", name="Instant Coupons & Discount",
        heading="Instant Coupons &amp; Discount",
        body="Drives higher conversion with eligible offers and discounts applicable at checkout.",
        sel="co-offs", lift=(0, 470, 360),
        note=(66, 338), note_w=290,
        arrow=(26, 348, 34, 92, "M5 4C0 34 7 63 29 85", "M17 80L30 87L25 74"),
        goto="05 Smart Preferred paymode", bgoto="B07 Smart Preferred paymode",
    ),
    dict(
        num="05", bnum="B07", name="Smart Preferred paymode",
        heading="Smart Preferred paymode",
        body="Auto-selects saved and preferred payment instrument to drive faster payment completion.",
        sel="co-opt", lift=(16, 587, 328),
        note=(36, 438), note_w=292,
        arrow=(272, 452, 58, 104, "M50 4C56 38 44 74 24 97", "M14 86L21 100L34 94"),
        goto="06 Payment Successful", bgoto="B08 Payment Successful",
    ),
]


def between(html, start, end, what):
    i, j = html.find(start), html.find(end)
    if i < 0 or j < 0:
        sys.exit("marker missing for %s (%s / %s)" % (what, start, end))
    return html[i + len(start): j]


def slice_element(base, cls):
    """Pull one top-level element with class `cls` out of the base markup by
    matching div nesting. Cheap, and the markup here is well-formed."""
    m = re.search(r'<div class="%s[^"]*"' % re.escape(cls), base)
    if not m:
        sys.exit("no element with class %r in the base screen" % cls)
    i, depth = m.start(), 0
    for tag in re.finditer(r"<(/?)div\b[^>]*?(/?)>", base[i:]):
        if tag.group(2) == "/":
            continue
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            return base[i: i + tag.end()]
    sys.exit("unbalanced markup around .%s" % cls)


def strip_goto(markup):
    return re.sub(r'\s*data-goto="[^"]*"', "", markup)


def build_base(base, num, name, goto, tag):
    """The plain checkout screen as its own figure. In the booth loop the whole
    frame is the hotspot -- a booth crowd jabs at the screen, it does not hunt
    for the one live element -- so the goto rides on the frame itself."""
    return """
  <!-- ============================ {num} ============================ -->
  <figure class="art">
    <figcaption>{num} · {name} <span>360 × 800</span><em>{tag}</em></figcaption>
    <div class="frame mob" data-frame="{num} {name}" data-goto="{goto}">
      {base}
    </div>
  </figure>
""".format(num=num, name=name, goto=goto, tag=tag, base=strip_goto(base))


def build_callout(base, c, num, goto, tag):
    lx, ly, lw = c["lift"]
    nx, ny = c["note"]
    ax, ay, aw, ah, apath, ahead = c["arrow"]
    lifted = slice_element(base, c["sel"])
    # The base is dimmed in these frames, so nothing in it is tappable. Strip
    # its wiring or the file claims Pay Now hotspots that do not exist.
    return """
  <!-- ============================ {num} ============================ -->
  <figure class="art">
    <figcaption>{num} · {name} <span>360 × 800</span><em>{tag}</em></figcaption>
    <div class="frame mob" data-frame="{num} {name}">
      {base}
      <div class="co-dim"></div>
      <div class="co-lift" style="left:{lx}px;top:{ly}px;width:{lw}px">{lifted}</div>
      <svg class="co-arrow" style="left:{ax}px;top:{ay}px" width="{aw}" height="{ah}" viewBox="0 0 {aw} {ah}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="{apath}"/><path d="{ahead}"/></svg>
      <div class="co-note" style="left:{nx}px;top:{ny}px;width:{nw}px">
        <div class="h">{heading}</div>
        <div class="b">{body}</div>
        <div class="co-next" data-goto="{goto}">Next<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div>
      </div>
    </div>
  </figure>
""".format(base=strip_goto(base), lifted=lifted, lx=lx, ly=ly, lw=lw,
           nx=nx, ny=ny, nw=c["note_w"], ax=ax, ay=ay, aw=aw, ah=ah,
           apath=apath, ahead=ahead, num=num, name=c["name"], tag=tag,
           heading=c["heading"], body=c["body"], goto=goto)


SUCCESS_BODY = """      <div class="co-done">
        <div class="disc"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <div class="t">Payment successful</div>
        <div class="a">₹1,530</div>
        <div class="m">Copper Kettle Co. · Google Pay</div>
        <div class="card">
          <div class="r"><span>Order</span><b>order_CK_88213</b></div>
          <div class="r"><span>Paid with</span><b>Google Pay · UPI</b></div>
          <div class="r"><span>Delivery</span><b>Get it in 24 Hours</b></div>
        </div>
        <div class="sec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Secured by Cashfree Payments</div>
      </div>"""


def build_success(num, tag, goto=None):
    attr = ' data-goto="%s"' % goto if goto else ""
    return """
  <!-- ============================ {num} ============================ -->
  <figure class="art">
    <figcaption>{num} · Payment Successful <span>360 × 800</span><em>{tag}</em></figcaption>
    <div class="frame mob" data-frame="{num} Payment Successful"{attr}>
{body}
    </div>
  </figure>
""".format(num=num, tag=tag, attr=attr, body=SUCCESS_BODY)


BOOTH_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cashfree Checkout — booth loop</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,700&display=swap" rel="stylesheet">
<!-- GENERATED by scripts/build-checkout-frames.py from checkout-frames.html.
     Do not hand-edit: edit that file and re-run. -->
<style>{css}</style>
</head>
<body>

<div class="sheet-head">
  <h1>Cashfree Checkout — booth loop</h1>
  <p>Eight frames, every one <b>360&times;800</b> — Figma's <b>Android Large</b> preset — so they drop straight into the existing prototype alongside the Index / Index L2 frames.</p>
  <p><b>Do not draw a phone around these.</b> Select the frames in Figma, then <b>Prototype &rarr; Device &rarr; Android Large</b>, and Figma renders the phone body itself at Present time. A shell baked into the frame would eat ~40px a side and shrink the actual checkout.</p>
  <p>The loop closes: <code>B08</code> returns to <code>B01</code>, so the booth runs unattended. <code>B03</code> and <code>B08</code> carry their <code>data-goto</code> on the frame itself — the whole frame is the hotspot, because a booth crowd jabs at the screen rather than hunting for the one live element.</p>
</div>

<section class="flow">
  <h2>B01 → B08 · the loop</h2>
  <p class="note">Introducing &rarr; cart &rarr; checkout &rarr; four feature callouts &rarr; paid &rarr; back to the top.</p>
  <div class="rail">
{frames}
  </div>
</section>

</body>
</html>
"""


def main():
    html = open(HTML, encoding="utf-8").read()
    base = between(html, "<!--CO:START-->", "<!--CO:END-->", "base screen").strip()

    # --- the artboard sheet: stamp 02-06 from frame 01 ---
    sheet = "".join(build_callout(base, c, c["num"], c["goto"], "overlay on 01")
                    for c in CALLOUTS) + build_success("06", "end of flow")
    i = html.find("<!--GEN:START-->")
    j = html.find("<!--GEN:END-->")
    if i < 0 or j < 0:
        sys.exit("GEN markers missing")
    html = html[: i + len("<!--GEN:START-->")] + sheet + html[j:]

    # --- the booth loop: the two authored screens + the same six, rewired ---
    pair = between(html, "<!--BOOTH:START-->", "<!--BOOTH:END-->", "booth screens")
    loop = pair
    loop += build_base(base, "B03", "Checkout — Base", "B04 Pre-filled Delivery Address",
                       "whole frame taps")
    loop += "".join(build_callout(base, c, c["bnum"], c["bgoto"], "overlay on B03")
                    for c in CALLOUTS)
    loop += build_success("B08", "loops to B01", goto="B01 Introducing Checkout 360")

    css = between(html, "<style>", "</style>", "stylesheet")
    booth = BOOTH_PAGE.format(css=css, frames=loop)

    uris = data_uris()
    for token, uri in uris.items():
        html = html.replace(token, uri)
        booth = booth.replace(token, uri)

    open(HTML, "w", encoding="utf-8", newline="\n").write(html)
    open(BOOTH, "w", encoding="utf-8", newline="\n").write(booth)
    print("checkout-frames.html  %5.0f KB   %d frames stamped"
          % (len(html) / 1024, len(CALLOUTS) + 1))
    print("booth-frames.html     %5.0f KB   8 frames, B08 -> B01"
          % (len(booth) / 1024))


if __name__ == "__main__":
    main()
