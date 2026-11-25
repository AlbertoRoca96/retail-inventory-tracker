"""Offline structural checks for the self-contained Will handoff."""
import html
import json
from pathlib import Path
import re
import subprocess

report = Path(__file__).with_name('will-dashboard-handoff.html')
text = report.read_text(encoding='utf-8')
assert 'width=device-width' in text
assert '@media (max-width:480px)' in text
assert not re.search(r'__(SAMPLE|PREPARED)', text)
assert not re.search(r'rws_live_|sb_secret_|[?&]token=|eyJ[a-zA-Z0-9_-]{30}', text)
samples = re.findall(
    r'<pre id="sample-(?:one|two)"><code>(.*?)</code></pre>', text, re.S
)
rows = [json.loads(html.unescape(sample)) for sample in samples]
assert len(rows) == 2
assert all(
    row['created_by'] == '7293f5f7-9458-4ae4-a1dd-3054d48ca86a'
    for row in rows
)
assert all(not key.endswith('_url') for row in rows for key in row)
ids = set(re.findall(r'id="([^"]+)"', text))
assert all(anchor in ids for anchor in re.findall(r'href="#([^"]+)"', text))
script = re.search(r'<script>(.*?)</script>', text, re.S).group(1)
checked = subprocess.run(
    ['node', '--check'], input=script, text=True, capture_output=True, check=False
)
assert checked.returncode == 0, checked.stderr
print('PASS: responsive metadata/styles, two valid Austin JSON samples,')
print('no credential/signed-token patterns, section anchors, JavaScript syntax.')
