# Private-only (not for the Vicinae store)

Installs `/usr/local/bin/vicinae-boost-app` and a `%wheel` NOPASSWD sudoers drop-in.

Do not copy this directory into a store pull request. App-boost can stay a
local helper; the store-facing profile switch uses `sudo tlp` / polkit instead.

```bash
sudo bash power-profiles/private/install-boost-permissions.sh
```
