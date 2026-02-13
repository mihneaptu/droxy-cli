# Vendor Binaries

Vendor executables are not committed to git.

## Distribution

- GitHub Releases publish platform archives (for example, `droxy-cli-windows-x64.zip`).
- `install.ps1` and `install.sh` download release assets during installation.
- Runtime startup can auto-download a missing engine binary via update logic.

## Local Development

You may keep a local binary in this directory (for example, `cli-proxy-api-plus.exe`) for development.
These files are ignored by `.gitignore` and should not be committed.
