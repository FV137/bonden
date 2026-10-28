# Bonden for Hermes installed

Enable it if you did not install with `--enable`:

```bash
hermes plugins enable bonden
```

Restart Hermes or the gateway after enabling.

In shared gateways, restrict `/bonden` to trusted users with Hermes slash-command access controls; runtime mode is process-local.

Commands:

- `/bonden [lite|full|ultra|off]`
- `/bonden-review [target]`
- `/bonden-audit [target]`
- `/bonden-debt`
- `/bonden-gain`
- `/bonden-help`

Bundled skills are available as `bonden:bonden`, `bonden:bonden-review`, `bonden:bonden-audit`, `bonden:bonden-debt`, `bonden:bonden-gain`, and `bonden:bonden-help`.
