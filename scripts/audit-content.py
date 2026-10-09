"""Audit current contents/assets without scanning or changing Git history.

Guarded terms are never stored in this public repository. They are read from a
local, newline-separated file outside the tree: the path in
STABLE_DESK_AUDIT_TERMS, or by default stable-desk-audit-terms.txt next to the
repository folder. Matching is case-insensitive; blank lines and lines starting
with '#' are ignored. Findings name terms by number only, never by text.

Exit 0: no findings. Exit 1: findings. Exit 2: no local terms file, so the
identifier scan did not run (the structural build and ZIP checks still ran),
the same meaning as check-links' unresolved exit.
"""
from pathlib import Path
from zipfile import ZipFile
from datetime import datetime, timezone
import json
import os
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
terms_path = Path(os.environ.get('STABLE_DESK_AUDIT_TERMS') or root.parent / 'stable-desk-audit-terms.txt')


def load_terms(path):
    if not path.is_file():
        return None
    terms = []
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            terms.append(line.lower().encode('utf-8'))
    return terms


terms = load_terms(terms_path)
blocked = {f'guarded term {number}': term for number, term in enumerate(terms or [], 1)}

findings = []
def scan(name, value):
    lower = value.lower()
    for label, pattern in blocked.items():
        if pattern in lower:
            findings.append({'path': name, 'kind': label})

paths = set()
for args in [('ls-files', '-z'), ('ls-files', '--others', '--exclude-standard', '-z')]:
    for name in subprocess.check_output(['git', *args], cwd=root).decode().split('\0'):
        if name:
            paths.add(root / name)
current = sorted(p for p in paths if p.is_file())
for path in current:
    if path.suffix != '.zip':
        scan(str(path.relative_to(root)), path.read_bytes())
build = sorted(p for p in (root / 'dist').rglob('*') if p.is_file())
for path in build:
    scan(str(path.relative_to(root)), path.read_bytes())
archive_path = root / 'test-results/artifacts/stable-desk-static.zip'
if not archive_path.is_file() or not build:
    raise SystemExit('Build and package before running the complete audit.')
with ZipFile(archive_path) as archive:
    members = archive.namelist()
    for member in members:
        scan('ZIP/' + member, member.encode() + b'\n' + archive.read(member))
        if archive.read(member) != (root / 'dist' / member).read_bytes():
            findings.append({'path': 'ZIP/' + member, 'kind': 'stale build member'})
    if set(members) != {p.relative_to(root / 'dist').as_posix() for p in build}:
        findings.append({'path': 'ZIP', 'kind': 'member set differs from dist'})

screenshots = sorted((root / 'test-results').rglob('*.png'))
ocr_enabled = bool(shutil.which('tesseract'))
if ocr_enabled:
    for path in screenshots:
        text = subprocess.check_output(['tesseract', str(path), 'stdout', '--psm', '11'], stderr=subprocess.DEVNULL)
        scan('OCR/' + path.name, text)
report = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'method': 'Case-insensitive bytes in current tracked/new files, dist and unpacked ZIP; screenshot OCR when available.',
    'currentFiles': len(current), 'buildFiles': len(build), 'zipMembers': len(members),
    'screenshots': len(screenshots), 'screenshotOCREnabled': ocr_enabled,
    'identifierScan': 'not run (no local terms file)' if terms is None else f'ran with {len(terms)} local terms',
    'findings': findings, 'gitHistoryScanned': False,
    'historyNote': 'Earlier Git commits retain previous content; no history rewriting or deletion performed.',
}
(root / 'test-results/artifacts/content-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if not ocr_enabled:
    print('Screenshot OCR unavailable; inspect all screenshots visually.')
if findings:
    raise SystemExit(1)
if terms is None:
    print('Identifier scan not run: provide the local terms file (STABLE_DESK_AUDIT_TERMS) outside the repository.')
    raise SystemExit(2)
