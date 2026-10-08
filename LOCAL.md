# Local development

Requirements: Node 22 and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:8080`. Leave `DATABASE_URL` empty to use local PGLite.
Better Auth stays enabled by default. Use `npm run build` to build and apply
the existing database migrations.
