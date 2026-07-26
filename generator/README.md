# IMS Program Generator (Python service)

This is the Python Flask service that takes an Assessment JSON and returns a
full 4-week Program JSON. It's the engine behind the FRC/CARs/strength
programming logic.

## Origin

This directory is initially empty. To populate it:

```bash
# From the root of the monorepo:
unzip ~/Downloads/ims-fresh-repo.zip -d /tmp/ims-fresh
cp -r /tmp/ims-fresh/ims-fresh/{app.py,generator,libraries,requirements.txt,tests} apps/generator/
cp /tmp/ims-fresh/ims-fresh/examples apps/generator/ -r
```

The Dockerfile in this directory is already configured for Railway deployment.

## Why it stays separate from Next.js

The generator is 3,500+ lines of finely tuned Python that pulls from 10 JSON
libraries totaling ~2MB held in memory. Rewriting it in TypeScript would take
months for zero business value.

Keeping it as a microservice means:
- Next.js calls `POST /generate` over HTTP when a trainer hits "Generate Program"
- Python responds in <2 seconds with a Program JSON
- Next.js saves that JSON to Supabase `programs.data`

## Local development

```bash
cd apps/generator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# Server runs on http://localhost:5000
```

To call from Next.js dev:
```bash
# In apps/web/.env.local
PYTHON_GENERATOR_URL=http://localhost:5000
```

## Production deployment (Railway)

1. Push the monorepo to GitHub
2. New Railway project → "Deploy from GitHub repo" → select this repo
3. **Settings → Root Directory:** `apps/generator`
4. **Settings → Build:** auto-detected Dockerfile
5. Click Deploy
6. Copy public URL → set `PYTHON_GENERATOR_URL` in Vercel env vars

Railway hobby tier ($5/mo) is plenty for IMS volume.

## Tests

```bash
pytest tests/
```

The existing test suite covers the strength system, cardio system, and library
adapter. Keep it green when modifying the generator.
