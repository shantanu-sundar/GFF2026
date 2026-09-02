// Pull the three product renders out of index.html into real files, so Paper
// can take them as paper-asset:// images instead of inline base64.
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Toolkit/Toolkit Section/index.html';
const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(SRC, 'utf8');

for (const key of ['a-relay', 'a-spark', 'a-builders']) {
  const at = html.indexOf('.' + key);
  if (at < 0) { console.log(key, 'rule not found'); continue; }
  const tail = html.slice(at, at + 200000);
  const m = tail.match(/url\("data:image\/([a-z]+);base64,([A-Za-z0-9+/=]+)"\)/);
  if (!m) { console.log(key, 'no data URI in rule'); continue; }
  const buf = Buffer.from(m[2], 'base64');
  const file = path.join(OUT, key + '.' + m[1]);
  fs.writeFileSync(file, buf);
  console.log(key.padEnd(12), m[1], String(buf.length).padStart(7), 'bytes ->', file);
}
