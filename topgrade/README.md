# Topgrade

Run [Topgrade](https://github.com/topgrade-rs/topgrade) in the background, track steps live, and retry failed steps.

## What it does

- Starts a systemd --user unit that runs Topgrade
- Live tracker + recent-run history
- **Retry Failed** maps failure labels to `--only` / shell retries and skips steps listed in `topgrade.toml` `disable`

## External tools

- `topgrade` on `PATH`
- `systemctl --user`
- Optional: `~/.config/topgrade.toml`

Install the user runner once (no root):

```bash
bash scripts/install-runner.sh
```

That copies `bin/vicinae-topgrade-run` to `~/.local/bin` and a user unit to `~/.config/systemd/user/`.

## Privilege

Topgrade itself may call `sudo` for system updates. This repo's GUI sudo askpass helpers live in `private/` and are **not** for a store copy — they are installed locally by `install-runner.sh` for this machine. A store submission should omit `private/` and document that the user authenticates however their sudo/polkit setup already works.

## Tests

```bash
cd topgrade && npm test
```
