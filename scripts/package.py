"""Package the already validated static build; no deployment or upload."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
build = root / 'dist'
if not (build / 'index.html').is_file():
    raise SystemExit('Run npm run build before packaging.')
for file in sorted(build.rglob('*')):
    if file.is_file() and file.read_bytes() != (root / file.relative_to(build)).read_bytes():
        raise SystemExit(f'Build member is stale; rebuild first: {file.relative_to(build)}')
(root / 'artifacts').mkdir(exist_ok=True)
path = root / 'artifacts/stable-desk-static.zip'
with ZipFile(path, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(build.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(build))
with ZipFile(path) as archive:
    count = len(archive.namelist())
    for member in archive.namelist():
        if archive.read(member) != (build / member).read_bytes():
            raise SystemExit(f'Archive mismatch: {member}')
print(f'Packaged and compared {count} files with dist/: {path.name}')
