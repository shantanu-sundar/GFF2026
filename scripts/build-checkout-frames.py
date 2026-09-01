#!/usr/bin/env python3
"""
Expand the repeated artboards in `Toolkit Section/checkout-frames.html`.

Frames 02-05 of the mobile flow are the SAME base checkout screen with one
element lifted out of a dim, plus a callout. Writing that base screen out five
times by hand is how the five copies drift apart, so the file keeps exactly one
copy -- frame 01, between the CO:START / CO:END markers -- and this script
stamps it into the rest between GEN:START / GEN:END.

It also inlines the photography. `Checkout Screen/OCC + AOV.png` is a 720x1600
2x export; the two mug tiles and the merchant logo are cropped straight out of
it and embedded as data: URIs, so the artboard file resolves no relative paths
and a Figma importer never has to fetch anything.

    python scripts/build-checkout-frames.py

Idempotent: re-run it after editing frame 01 and 02-06 follow. If you edit a
generated frame instead, the next run overwrites you -- edit frame 01.
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
    five copies of each image to ~7KB rather than ~22KB of PNG."""
    src = Image.open(REF).convert("RGB")
    out = {}
    for token, box in CROPS.items():
        buf = io.BytesIO()
        src.crop(box).save(buf, "JPEG", quality=86, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        out[token] = "data:image/jpeg;base64," + b64
    return out


# ---------------------------------------------------------------------------
# The four callouts. `lift` is the box the highlighted element occupies in the
# 360x800 frame, measured off the reference; `sel` is the element in the base
# markup to re-emit there. Every number here is halved from the 2x export.
# ---------------------------------------------------------------------------
CALLOUTS = [
    dict(
        num="02", name="Pre-filled Delivery Address",
        heading="Pre-filled Delivery Address",
        body="Pre-fills saved shipping details to eliminate typing and speed up checkout.",
        sel="co-addr", lift=(16, 154, 328),
        note=(80, 322), note_w=272,
        arrow=(48, 296, 30, 66,
               "M24 62C7 45 3 26 11 5", "M4 15L11 4L19 10"),
        goto="03 Contextual Cross-selling",
    ),
    dict(
        num="03", name="Contextual Cross-selling",
        heading="Contextual Cross-selling",
        body="Drives higher basket size with instant, single-click product recommendations.",
        sel="co-cars", lift=(0, 326, 360),
        note=(36, 466), note_w=292,
        arrow=(272, 448, 58, 72,
               "M6 68C22 57 42 40 51 9", "M40 13L52 4L55 17"),
        goto="04 Instant Coupons & Discount",
    ),
    dict(
        num="04", name="Instant Coupons & Discount",
        heading="Instant Coupons &amp; Discount",
        body="Drives higher conversion with eligible offers and discounts applicable at checkout.",
        sel="co-offs", lift=(0, 470, 360),
        note=(66, 338), note_w=290,
        arrow=(26, 348, 34, 92,
               "M5 4C0 34 7 63 29 85", "M17 80L30 87L25 74"),
        goto="05 Smart Preferred paymode",
    ),
    dict(
        num="05", name="Smart Preferred paymode",
        heading="Smart Preferred paymode",
        body="Auto-selects saved and preferred payment instrument to drive faster payment completion.",
        sel="co-opt", lift=(16, 587, 328),
        note=(36, 438), note_w=292,
        arrow=(272, 452, 58, 104,
               "M50 4C56 38 44 74 24 97", "M14 86L21 100L34 94"),
        goto="06 Payment Successful",
    ),
]


def extract(html, start, end, what):
    i = html.find(start)
    j = html.find(end)
    if i < 0 or j < 0:
        sys.exit("marker missing for %s (%s / %s)" % (what, start, end))
    return html[i + len(start): j], i, j


def slice_element(base, cls):
    """Pull one top-level element with class `cls` out of the base markup by
    matching div nesting. Cheap, and the markup here is well-formed."""
    m = re.search(r'<div class="%s[^"]*"' % re.escape(cls), base)
    if not m:
        sys.exit("no element with class %r in the base screen" % cls)
    i = m.start()
    depth = 0
    for tag in re.finditer(r"<(/?)div\b[^>]*?(/?)>", base[i:]):
        if tag.group(2) == "/":
            continue
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            return base[i: i + tag.end()]
    sys.exit("unbalanced markup around .%s" % cls)


def build_callout(base, c):
    lx, ly, lw = c["lift"]
    nx, ny = c["note"]
    ax, ay, aw, ah, apath, ahead = c["arrow"]
    lifted = slice_element(base, c["sel"])
    # The base is dimmed in these frames, so nothing in it is tappable. Strip
    # its wiring or the file claims four Pay Now hotspots that do not exist.
    base = re.sub(r'\s*data-goto="[^"]*"', "", base)
    return """
  <!-- ============================ {num} ============================ -->
  <figure class="art">
    <figcaption>{num} · {name} <span>360 × 800</span><em>overlay on 01</em></figcaption>
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
""".format(base=base, lifted=lifted, lx=lx, ly=ly, lw=lw,
           nx=nx, ny=ny, nw=c["note_w"], ax=ax, ay=ay, aw=aw, ah=ah,
           apath=apath, ahead=ahead, num=c["num"], name=c["name"],
           heading=c["heading"], body=c["body"], goto=c["goto"])


SUCCESS = """
  <!-- ============================ 06 ============================ -->
  <figure class="art">
    <figcaption>06 · Payment Successful <span>360 × 800</span><em>end of flow</em></figcaption>
    <div class="frame mob" data-frame="06 Payment Successful">
      <div class="co-done">
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
      </div>
    </div>
  </figure>
"""


def main():
    html = open(HTML, encoding="utf-8").read()
    base, _, _ = extract(html, "<!--CO:START-->", "<!--CO:END-->", "base screen")
    base = base.strip()

    frames = "".join(build_callout(base, c) for c in CALLOUTS) + SUCCESS

    i = html.find("<!--GEN:START-->")
    j = html.find("<!--GEN:END-->")
    if i < 0 or j < 0:
        sys.exit("GEN markers missing")
    html = html[: i + len("<!--GEN:START-->")] + frames + html[j:]

    for token, uri in data_uris().items():
        html = html.replace(token, uri)

    open(HTML, "w", encoding="utf-8", newline="\n").write(html)
    print("wrote %s (%.0f KB), %d generated frames"
          % (os.path.relpath(HTML, ROOT), len(html) / 1024, len(CALLOUTS) + 1))


if __name__ == "__main__":
    main()
