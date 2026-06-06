# VibeTask containers (experimental)

Local Podman stack for **frontend**, **hub**, **Postgres**, and **rust-rpxy** (TLS edge via mkcert).

Not wired into CI. Safe to delete this entire folder if you do not want container convenience in the repo.

## Prerequisites

- [Podman](https://podman.io/) 4.1+
- A **compose provider** — `podman compose` is only a wrapper; it does not run compose itself. Install **one** of:
  - **`podman-compose`** (Arch: `sudo pacman -S podman-compose`) — recommended on Podman-only setups
  - **`docker-compose`** v2 plugin — used automatically if present
- [mkcert](https://github.com/FiloSottile/mkcert) — run **`mkcert -install`** once per machine
- **rpxy (default):** none — `compose.yaml` pulls `docker.io/jqtype/rpxy:latest`
- **rpxy (optional, your build):** a local `rust-rpxy` clone or a path to a built `rpxy` binary — set `RPXY_BUILD_CONTEXT` or `RPXY_BINARY` in `.env` (see [rpxy image options](#rpxy-image-options))

If `podman compose up` fails with *"looking up compose provider failed"*, install `podman-compose` or set `PODMAN_COMPOSE_PROVIDER=/usr/bin/podman-compose`.

## Quick start

```bash
cd containers
cp .env.example .env          # edit secrets: openssl rand -hex 32
./scripts/setup.sh            # mkcert, render rpxy.toml, app-hub.env

# Add to /etc/hosts if setup.sh warns:
#   127.0.0.1 vibetask.local

podman compose --profile dev up --build
# open https://vibetask.local:11743
```

Or use the wrapper (re-renders rpxy config before compose):

```bash
./scripts/up.sh --profile dev up --build
```

Production-style images (no source bind mounts):

```bash
podman compose --profile prod up --build
```

## Change ports or domain

Edit **only** the port block in `.env`, then re-run `./scripts/setup.sh`:

```bash
VT_DOMAIN=vibetask.local
RPXY_HTTP_PORT=11780
RPXY_HTTPS_PORT=11743
HUB_HTTP_PORT=11700
HUB_WS_PORT=11701
FRONTEND_PORT=11740
POSTGRES_PORT=11732
```

Derived URLs (`PUBLIC_URL`, `VITE_*`, `BETTER_AUTH_URL`, `VIBETASK_HUB_URL`) are rewritten automatically.

## Host CLI / MCP

The Rust app runs on the host, not in Podman. After setup:

```bash
source containers/app-hub.env
cd app
cargo run -p vibetask-cli -- --config config/functional-live-config.toml agent health
```

`VIBETASK_HUB_URL` points at the same HTTPS URL as the browser (`PUBLIC_URL`). It overrides `hub_url` in TOML configs.

Optional direct HTTP hub access (debugging):

```bash
# in .env
HUB_PUBLISH_TO_HOST=true
./scripts/setup.sh
# then use VIBETASK_HUB_URL_DIRECT from app-hub.env
```

## Architecture

| Service | Host access | Internal |
|---------|-------------|----------|
| rpxy | `https://vibetask.local:11743` | routes `/api`, `/socket.io`, SPA |
| hub | via rpxy only (optional direct) | `${HUB_HTTP_PORT}`, `${HUB_WS_PORT}` |
| frontend | via rpxy only | `${FRONTEND_PORT}` |
| postgres | `127.0.0.1:${POSTGRES_PORT}` | for psql debugging |

## Files

| Path | Purpose |
|------|---------|
| `.env` | Ports, secrets, derived URLs (gitignored) |
| `app-hub.env` | `export VIBETASK_HUB_URL=...` for CLI/MCP (gitignored) |
| `rpxy/rpxy.toml.template` | Source template |
| `rpxy/rpxy.toml` | Rendered by `scripts/render-config.sh` (gitignored) |
| `certs/` | mkcert PEM files (gitignored) |
| `compose.yaml` | `dev` and `prod` profiles |

## rpxy image options

| Approach | How |
|----------|-----|
| **Prebuilt (default)** | `compose.yaml` uses `docker.io/jqtype/rpxy:latest` — no rust-rpxy checkout required |
| **Your local binary** | Point at your clone or install path, then build the override image |

**1. Set paths in `.env`** (pick one):

```bash
# Git clone of https://github.com/junkurihara/rust-rpxy
RPXY_BUILD_CONTEXT=$HOME/src/rust-rpxy

# Or the binary directly (e.g. after cargo build --release)
# RPXY_BINARY=$HOME/src/rust-rpxy/target/release/rpxy
```

**2. Copy binary and swap the rpxy service:**

```bash
./scripts/copy-rpxy-binary.sh
podman compose -f compose.yaml -f compose.rpxy-local.yaml --profile dev up -d --build rpxy
```

To **build rpxy from source** inside Podman instead of using `jqtype/rpxy`, replace the `image:` line on the `rpxy` service in `compose.yaml` with a `build:` block whose `context` is your clone (same path as `RPXY_BUILD_CONTEXT`). Podman may need fully qualified registry names in upstream `docker/Dockerfile-slim` — the prebuilt or local-binary paths avoid that.

## Teardown

```bash
podman compose --profile dev down -v
```

## Troubleshooting

- **Cert warnings:** run `mkcert -install` on the host.
- **502 from rpxy:** hub may still be running migrations; wait ~30s after first boot.
- **Port in use:** `setup.sh` warns; change ports in `.env` and re-run setup.
- **rpxy TLS / permission denied on certs:** re-run `./scripts/setup.sh` (chmods `certs/*.pem` for the container user), then `podman compose --profile dev restart rpxy`.
- **HTTPS fails / unknown_sni:** same as above — TLS was not loaded because cert files were unreadable.
- **rpxy Dockerfile build fails (short-name registry):** use the prebuilt image (default) or the local-binary override above.
