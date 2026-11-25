const fs = require('fs');
const raw = fs.readFileSync(process.argv[2] || 'build-view.json', 'utf8');
const data = JSON.parse(raw);
const index = Number(process.argv[3] || 0);
const url = Array.isArray(data.logFiles) ? data.logFiles[index] : '';
process.stdout.write(url || '');
