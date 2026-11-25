const fs = require('fs');
const zlib = require('zlib');
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('usage: node decompress-log.js <input> <output>');
  process.exit(1);
}
const buf = fs.readFileSync(input);
let out;
try {
  out = zlib.gunzipSync(buf);
} catch (err) {
  try {
    out = zlib.unzipSync(buf);
  } catch (err2) {
    console.error('Unable to decompress as gzip/zip');
    process.exit(2);
  }
}
fs.writeFileSync(output, out);
console.log(output);
