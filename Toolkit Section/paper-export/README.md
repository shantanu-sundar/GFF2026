# Booth → Paper

Turns the booth flow into one Paper artboard per screen, as real editable Paper
nodes rather than flat images.

Paper's own tool has no prototyping — 34 MCP tools, none of which create links,
hotspots or interactions — so these are laid out in flow order but are **not**
tap-wired. The tappable version of this flow is the booth itself
(`index.html?booth`), which is what the kiosk runs.

## State

55 screens compiled into `out/`. 14 pushed into Paper before the free tier's
**100 MCP calls/week** ran out. The remainder is one command (below).

Paper file: <https://app.paper.design/file/01M1H107RNAC0SPP4PZBNTDJW8/1-0>

## Resuming

Paper desktop must be running — the MCP server is local, on
`http://127.0.0.1:29979/mcp`, and it is *not* registered as a session MCP
server; `pmcp.js` speaks JSON-RPC to it directly.

```bash
node push.js --all                       # every screen in out/index.json
node push.js 15-relaycart-step-4.html "relayCart step 4"   # or one at a time
```

`push.js` costs 2 MCP calls per screen (create_artboard + write_html), so the
remaining 41 need ~82 of the weekly 100. Pro raises the ceiling to 1M/week.

## Rebuilding from source

```bash
node compile.js --all      # drive the booth, serialize all 55 screens
node compile.js probe      # just the richest screen, for checking a change
node walk.js               # reference PNGs of every state, into screens/
```

## How the compiler works

`serializer.js` runs inside the page and reads **computed** styles, because
Paper's `write_html` only accepts concrete literal CSS — no tokens, no `var()`,
no classes. Three rewrites earn their keep:

- **grid → flex.** Single-column grids become columns. Multi-column ones become
  wrapping rows whose cells keep their measured width, which is what stops the
  2×2 merchant ledger collapsing into one squeezed line.
- **margin → padding on a wrapper.** Paper forbids `margin`. A margin around an
  element is geometrically padding around it inside a shrink-wrapped parent, and
  that *is* expressible. `margin-left:auto` becomes flex alignment instead.
- **inline → its own node.** Paper has no rich text, so a `<span>` that styles
  part of a sentence has to become a separate text node in a wrapping row.

Two things that are not obvious and cost time if rediscovered:

- **Anything that was one line must be pinned to one line.** Paper re-flows text
  against the width it computes, so `createOrder` breaks into `createOrd`/`er`
  unless the node carries `white-space:nowrap` and `flex-shrink:0`. The
  serializer infers this from the source box being a single line-height tall.
- **A scrolling box has to be emitted where the booth actually shows it.** The
  thread is ~1000px of content in a ~600px box, scrolled to the bottom. Emitting
  its full height starts the screen on a message the viewer has already scrolled
  past and pushes the composer off the artboard. It gets a fixed height,
  `overflow:hidden` and `justify-content:flex-end` instead.

Images never travel through the transcript as base64: they are written to
`assets/` and referenced as `paper-asset://` absolute paths, which Paper resolves
locally and then uploads into the file — so the artboards keep working after
this folder goes away.

## Verifying

`get_screenshot` serves a **cached** render and will happily hand back the
previous state after a write, which reads as "the fix didn't work". Trust
`get_tree_summary` / `get_node_info` geometry instead: a single-line label is
14px tall, and the ledger's four rows are 143×30 wrapping 2×2.
