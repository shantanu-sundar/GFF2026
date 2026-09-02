// Push compiled screens into Paper, one artboard each.
//
//   node push.js <file.html> "<name>"     -- one screen (replaces same-named)
//   node push.js --all                    -- every screen in out/index.json
//
// Paper places artboards itself, so the flow order comes from creating them in
// order. Screens are written root-first with the root given a real 360x800 box,
// because .screen sizes off its parent in the booth and has nothing to size off
// here.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const PMCP = path.join(HERE, 'pmcp.js');
const STEP = path.join(HERE, '.push-step.json');

function call(tool, args) {
  fs.writeFileSync(STEP, JSON.stringify(args));
  const out = execFileSync(process.execPath, [PMCP, 'call', tool, '@' + STEP],
                           { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out;
}

function pushScreen(file, name) {
  let html = fs.readFileSync(path.join(HERE, 'out', file), 'utf8');
  // The compiled root is .screen, which had no intrinsic size in the booth.
  html = html.replace(/^<div layer-name="([^"]*)" style="/,
                      '<div layer-name="$1" style="width:100%; height:100%; ');

  const ab = JSON.parse(call('create_artboard', {
    name, styles: {
      width: '360px', height: '800px', backgroundColor: '#ffffff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
  })).id;

  const res = call('write_html', { html, targetNodeId: ab, mode: 'insert-children' });
  const n = (res.match(/"id"/g) || []).length;
  console.log(name.padEnd(26), ab.padEnd(8), n + ' nodes');
  return ab;
}

const arg = process.argv[2];
if (arg === '--all') {
  const index = JSON.parse(fs.readFileSync(path.join(HERE, 'out', 'index.json'), 'utf8'));
  const made = [];
  for (const s of index) made.push({ ...s, artboard: pushScreen(s.file, s.name) });
  fs.writeFileSync(path.join(HERE, 'out', 'pushed.json'), JSON.stringify(made, null, 1));
  console.log('\n' + made.length + ' artboards');
} else {
  pushScreen(arg, process.argv[3] || arg.replace(/\.html$/, ''));
}
