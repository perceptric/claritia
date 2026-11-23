# Running Claritia on Fly.io

Five Fly apps, all in Tokyo (`nrt`), next to the Supabase database. The site, `tryclaritia.com`, is a plain HTML site on Hostinger (the `claritia-site` repo).

| App | Config | Machine | Awake | Cost a month (check) |
|---|---|---|---|---|
| `claritia-web` (the app, app.tryclaritia.com) | `fly.toml`, `Dockerfile` | shared-cpu-1x, 512 MB | sleeps when idle, wakes on the next visit | under $3.20, by hours awake |
| `claritia-runner` (runs tests) | `fly.runner.toml`, `worker/Dockerfile` | shared-cpu-1x, 2 GB | sleeps when there's nothing to run | about $0.30 stopped, plus about $0.015 per hour of runs |
| `claritia-relay` (the tunnel) | `fly.relay.toml`, `relay/Dockerfile` | shared-cpu-1x, 256 MB | always on | about $2 |
| `claritia-collect` (website events) | `fly.collect.toml`, `collect/Dockerfile` | shared-cpu-1x, 512 MB | always on | about $3.20 |
| `claritia-intel` (background jobs) | `fly.intel.toml`, `worker-intel/Dockerfile` | shared-cpu-1x, 1 GB | always on | about $5.70 |

Fly bills by the second; Tokyo can cost a little more than US regions.

### How the runner sleeps and wakes

- After 5 minutes with nothing to run (`IDLE_EXIT_MS`), the runner exits and Fly stops the machine. A stopped machine only costs its disk.
- When a run is queued, the database calls `https://claritia-runner.fly.dev/` (pg_net). Fly starts the machine, which takes about 2 to 5 seconds, then the runner takes the run.
- Every minute the database fires due schedules itself (pg_cron), so schedules work while the runner sleeps, and it wakes the runner again if a run has been waiting.
- The wake address lives in the database, in `app_config` (step 4).

## 1. Sign up and install

```bash
brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
fly auth signup            # or: fly auth login. Fly asks for a card.
```

## 2. Make the apps

The deploy workflow makes any app that doesn't exist yet. To make them by hand:

```bash
fly apps create claritia-web
fly apps create claritia-runner
fly apps create claritia-relay
fly apps create claritia-collect
fly apps create claritia-intel
```

## 3. Set the secrets

`SECRETS_KEY` must be the same on every app that has it, or saved secrets can't be opened.

```bash
fly secrets set --app claritia-web \
  SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... \
  SECRETS_KEY=... STRIPE_SECRET_KEY=... RESEND_API_KEY=...

fly secrets set --app claritia-runner \
  SUPABASE_URL=... SUPABASE_SECRET_KEY=... SECRETS_KEY=... ANTHROPIC_API_KEY=...

fly secrets set --app claritia-collect DATABASE_URL=... CLR_ID_SECRET=... IPINFO_TOKEN=...

fly secrets set --app claritia-intel \
  DATABASE_URL=... SECRETS_KEY=... SUPABASE_URL=... SUPABASE_SECRET_KEY=...
```

Each config file's header lists its app's secrets. `DATABASE_URL` is Supabase's pooler in session mode. The sign-in apps for sources (`<PREFIX>_CLIENT_ID` and `_CLIENT_SECRET` on the web app and intel) are in `docs/sources-setup.md`; the GitHub App's are in `docs/github.md`.

## 4. Deploy

```bash
fly deploy --ha=false                                  # the web app
fly deploy --ha=false --config fly.runner.toml
fly deploy --ha=false --config fly.relay.toml
fly deploy --ha=false --config fly.collect.toml
fly deploy --ha=false --config fly.intel.toml
```

`--ha=false` keeps one machine per app; Fly would start two on the first deploy, which doubles the bill. Then tell the database where to wake the runner, in the Supabase SQL editor:

```sql
update app_config set value = 'https://claritia-runner.fly.dev/' where key = 'runner_wake_url';
```

## 5. Point the app's domain at Fly

```bash
fly certs add app.tryclaritia.com --app claritia-web
```

It prints the DNS record to add. In Hostinger → DNS for `tryclaritia.com`, set `app` to a CNAME for `claritia-web.fly.dev`. Leave the `inbox` records for Resend alone. `fly certs show app.tryclaritia.com --app claritia-web` says when the certificate is ready. The Stripe and Resend webhooks use `app.tryclaritia.com`, so they follow it.

## Deploying after this

Every push to `main` runs the checks (`.github/workflows/ci.yml`), then deploys each app whose files the push changed (`.github/workflows/fly-deploy.yml`). A manual run of the workflow deploys all five. To turn it on:

1. Make a token: `fly tokens create org` (one token works for every app).
2. In GitHub → the `claritia` repo → Settings → Secrets and variables → Actions → New repository secret, name it `FLY_API_TOKEN` and paste the token.

Until the secret is there, the workflow runs the checks and skips the deploy.
