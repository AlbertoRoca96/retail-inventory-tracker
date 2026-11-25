const fs = require('fs');
const https = require('https');
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('usage: node fetch-log.js <url-file> <output-file>');
  process.exit(1);
}
const url = fs.readFileSync(input, 'utf8').trim();
https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error('status', res.statusCode);
    process.exit(2);
  }
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    fs.writeFileSync(output, Buffer.concat(chunks));
    console.log(output);
  });
}).on('error', (err) => {
  console.error(err.stack || String(err));
  process.exit(3);
});
