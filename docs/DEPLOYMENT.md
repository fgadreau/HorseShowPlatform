# Deployment Checklist

## GitHub

The repository remote is:

```bash
https://github.com/fgadreau/HorseShowPlatform.git
```

Commit and push setup changes with:

```bash
git add .
git commit -m "Add Supabase CLI and deployment notes"
git push
```

## Supabase

Apply database migrations:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Required frontend values:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Supabase Auth URL configuration should include local and production URLs:

```text
Site URL:
https://horseshowplatform.com

Additional Redirect URLs:
http://localhost:5173/**
https://horseshowplatform.com/**
https://www.horseshowplatform.com/**
```

If the canonical production domain is `horseshowplatform.app`, use the `.app` URLs instead or add both domains while testing.

## Vercel

Project settings:

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
Install command: npm install
```

Environment variables for Production, Preview and Development:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Add custom domains in Vercel Project Settings > Domains:

```text
horseshowplatform.com
www.horseshowplatform.com
```

If using `horseshowplatform.app`, add:

```text
horseshowplatform.app
www.horseshowplatform.app
```

Vercel will show the exact DNS records to add at the registrar. Apex domains use an A record; subdomains use a CNAME record. After DNS verification, choose one canonical domain and redirect the other variants to it.
