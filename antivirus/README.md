# Antivirus

ClamAV scans (full / quick / path), history, resume, hits, and rkhunter.

## What it does

- Full home scan, quick scan, or a picked path
- Live subtitle (percent, ETA, resume, clean/infected)
- History, resume after interrupt, quarantine/ignore helpers

State lives under `$XDG_STATE_HOME/clamav/` (default `~/.local/state/clamav/`). Path-scan placeholder is `$HOME/Downloads`.

## External tools

- `clamd` / `clamdscan` / `clamscan` / `clamconf`
- Optional: `rkhunter`, Fangfrisch/unofficial signature DBs
- Optional host wrapper: `antivirus/scripts/av-scan` (install to `/usr/local/bin` yourself if you use it)

```bash
sudo install -m 755 scripts/av-scan /usr/local/bin/av-scan
```

## Privilege

Scans run as the current user against paths that user can read. Signature updates and `clamd` are whatever your distro already configured. This extension does not ship sudoers rules.

Package operations that need sudo reuse the **private** Topgrade askpass helpers on this machine (`topgrade/private/`); do not copy those into a store submission.

## Tests

```bash
cd antivirus && npm test
```
