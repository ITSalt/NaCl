# NaCl Analyst Tool

A local web application that wraps Excalidraw and lets a business analyst browse `.excalidraw` board files, edit them in a full-featured canvas, and trigger NaCl skills (regenerate from Neo4j graph / sync back to graph). It replaces the old `excalidraw` and `excalidraw-room` Docker containers with a single integrated tool that understands the NaCl board lifecycle.

## Prerequisites

- **Node.js 20+**
- **Neo4j running** via `docker compose -f graph-infra/docker-compose.yml up -d` (see `graph-infra/`)
- **Claude Code CLI** installed and logged in (`claude` available on `PATH`)

## Development

```bash
cd analyst-tool
npm install
npm run dev
```

This starts:
- Fastify backend on `http://127.0.0.1:3583`
- Vite dev server on `http://127.0.0.1:3582` (proxies `/api` and `/ws` to the backend)

Open `http://localhost:3582` in your browser.

## Production build

```bash
npm run build
npm start
```

`npm start` runs Fastify only; in production it serves `web/dist/` as static files (Wave 1+).

## Other commands

```bash
npm run typecheck   # TypeScript type check (server + web)
npm run lint        # ESLint (server + web)
```

## Production install

### macOS / Linux

```bash
git clone <repo-url> nacl
cd nacl/analyst-tool
npm install
npm run build
npm link
```

`npm link` creates a symlink from your Node.js global bin directory to
`analyst-tool/bin/nacl-analyst-tool.js`. After that, `nacl-analyst-tool` is
available on your PATH from any directory.

> Note: `npm link` uses whatever Node.js version is on your PATH. If you
> manage multiple Node versions with nvm or similar, run `npm link` inside the
> same shell that will launch the tool so the shebang resolves correctly.

To update after `git pull`:

```bash
npm install && npm run build
# npm link is a symlink — no re-linking needed.
```

### Windows

```bat
git clone <repo-url> nacl
cd nacl\analyst-tool
npm install
npm run build
npm install -g .
```

`npm install -g .` copies the files into the global prefix; there is no symlink,
so you must re-run this after every `git pull`:

```bat
git pull
npm install && npm run build && npm install -g .
```

### Usage

```
nacl-analyst-tool             # start on http://127.0.0.1:3582, open browser
nacl-analyst-tool --help      # show all flags
nacl-analyst-tool --port 4000 # custom port
nacl-analyst-tool --no-open   # skip browser auto-open
```

## Note

This tool replaces the `excalidraw` and `excalidraw-room` containers that were previously declared in `graph-infra/docker-compose.yml`. Those containers have been removed. Run the Analyst Tool locally instead — it must be installed and started separately (`npm install && npm run dev`) since it invokes the local `claude` CLI and cannot run inside Docker.
