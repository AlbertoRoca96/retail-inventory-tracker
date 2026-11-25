const fs = require('fs');
const path = process.argv[2] || 'build-view.json';
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);
console.log(data.artifacts?.xcodeBuildLogsUrl || '');
console.log('---ERROR---');
console.log(data.error?.message || '');
