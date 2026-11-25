const fs = require('fs');
const raw = fs.readFileSync(process.argv[2] || 'build-view.json', 'utf8');
const data = JSON.parse(raw);
process.stdout.write((data.artifacts && data.artifacts.xcodeBuildLogsUrl) ? data.artifacts.xcodeBuildLogsUrl : '');
