// Build write_html args from an HTML file: node mkjson.js <file> <target> <mode>
const fs = require('fs');
const [file, targetNodeId, mode = 'insert-children'] = process.argv.slice(2);
fs.writeFileSync(process.env.STEP || 'step.json', JSON.stringify({
  html: fs.readFileSync(file, 'utf8').trim(), targetNodeId, mode,
}, null, 1));
console.log('args written for', targetNodeId, mode);
