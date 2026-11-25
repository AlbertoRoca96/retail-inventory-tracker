"""Offline document and calculator checks; does not claim browser/device QA."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess


class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.anchors = []
        self.external_scripts = []
        self.viewport = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if 'id' in values:
            self.ids.append(values['id'])
        if tag == 'a' and values.get('href', '').startswith('#'):
            self.anchors.append(values['href'][1:])
        if tag == 'script' and 'src' in values:
            self.external_scripts.append(values['src'])
        if tag == 'meta' and values.get('name') == 'viewport':
            self.viewport = 'width=device-width' in values.get('content', '')


def main():
    report = Path(__file__).with_name('rws-integration-and-photo-report.html')
    text = report.read_text(encoding='utf-8')
    parser = ReportParser()
    parser.feed(text)
    assert parser.viewport
    assert len(parser.ids) == len(set(parser.ids)), 'Duplicate element IDs'
    assert all(anchor in parser.ids for anchor in parser.anchors)
    assert not parser.external_scripts
    assert '@media(max-width:650px)' in text
    assert not re.search(r'__[A-Z_0-9]+__', text), 'Unfilled template token'
    assert not re.search(
        r'rws_live_|sb_secret_|[?&]token=|eyJ[a-zA-Z0-9_-]{30}', text
    ), 'Possible credential in report'
    script = re.search(r'<script>(.*?)</script>', text, re.S).group(1)
    syntax = subprocess.run(
        ['node', '--check'], input=script, text=True, capture_output=True,
        check=False,
    )
    assert syntax.returncode == 0, syntax.stderr
    harness = r'''
const vm = require('node:vm');
const assert = require('node:assert/strict');
const inputs = {
  reports: '100', 'photos-per-report': '6', 'photo-mb': '2.35',
  retention: '12', downloads: '2', 'existing-gb': '0'
};
const nodes = {};
for (const [id,value] of Object.entries(inputs)) nodes[id] = {value};
nodes['cost-results'] = {innerHTML:''};
nodes['copy-reply'] = {addEventListener(){}};
const document = {
  getElementById(id){return nodes[id];}, querySelectorAll(){return [];}
};
const sandbox = {document, navigator:{}};
vm.createContext(sandbox);
vm.runInContext(SCRIPT, sandbox);
assert.match(nodes['cost-results'].innerHTML, /1\.41 GB new originals/);
assert.match(nodes['cost-results'].innerHTML, /16\.92 GB retained originals/);
assert.match(nodes['cost-results'].innerHTML, /2\.82 GB estimated photo/);
nodes.reports.value='500';
nodes['photos-per-report'].value='20';
sandbox.estimate();
assert.match(nodes['cost-results'].innerHTML, /282 GB retained originals/);
assert.match(nodes['cost-results'].innerHTML, /\$3\.88 storage overage/);
assert.match(nodes['cost-results'].innerHTML, /\$0\.00 uncached egress/);
nodes['photo-mb'].value='not-a-number';
sandbox.estimate();
assert.doesNotMatch(nodes['cost-results'].innerHTML, /NaN|Infinity/);
console.log('PASS: calculator examples and invalid-input handling');
'''.replace('SCRIPT', json.dumps(script))
    result = subprocess.run(
        ['node'], input=harness, text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    print(result.stdout.strip())
    print('PASS: responsive metadata/styles, anchors, unique IDs, no template')
    print('tokens/external scripts/credential patterns, and JavaScript syntax.')
    print('Browser rendering and physical-phone interaction are not tested here.')


if __name__ == '__main__':
    main()
