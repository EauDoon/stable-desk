"""Audit current contents/assets without scanning or changing Git history."""
from pathlib import Path
from zipfile import ZipFile
from datetime import datetime, timezone
import json
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
# Split former identifiers so this guard itself is free of the removed wording.
blocked = {
    'former subject': ('xs' + 'gd').encode(),
    'former issuer': ('straits' + 'x').encode(),
    'personal framing': ('dan' + 'iel' + ' oon').encode(),
}
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
archive_path = root / 'artifacts/stable-desk-static.zip'
if not archive_path.is_file() or not build:
    raise SystemExit('Build and package before running the complete audit.')
with ZipFile(archive_path) as archive:
    members = archive.namelist()
    for member in members:
        scan('ZIP/' + member, member.encode() + b'\n' + archive.read(member))
        if archive.read(member) != (root / 'dist' / member).read_bytes():
            findings.append({'path': 'ZIP/' + member, 'kind': 'stale build member'})
    if set(members) != {str(p.relative_to(root / 'dist')) for p in build}:
        findings.append({'path': 'ZIP', 'kind': 'member set differs from dist'})

screenshots = sorted((root / 'artifacts').glob('*.png'))
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
    'findings': findings, 'gitHistoryScanned': False,
    'historyNote': 'Earlier Git commits retain previous content; no history rewriting or deletion performed.',
}
(root / 'artifacts/content-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if findings:
    raise SystemExit(1)
if not ocr_enabled:
    print('Screenshot OCR unavailable; inspect all screenshots visually.')
