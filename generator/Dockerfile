# =============================================================================
# IMS Program Generator — Python service
#
# This Dockerfile is for Railway / Fly.io deployment of the existing
# Flask-based generator from ims-fresh-repo.zip.
#
# To deploy:
#   1. Copy your existing app.py, generator/, libraries/, requirements.txt
#      into this directory (apps/generator/).
#   2. Push the monorepo to GitHub.
#   3. On Railway, create a new project from the repo.
#   4. Set "Root Directory" to apps/generator/.
#   5. Railway auto-detects this Dockerfile and deploys.
#   6. Copy the public URL into PYTHON_GENERATOR_URL in apps/web/.env.
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# System deps for Pillow / reportlab if needed by plan_pdf.py
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Add gunicorn for production
RUN pip install --no-cache-dir gunicorn

# Copy the rest of the app
COPY . .

# Railway sets PORT dynamically
ENV PORT=8000
EXPOSE 8000

# Run with gunicorn — Flask app named `app` in app.py
# Single worker is fine for IMS volume; the libraries are 2MB+ in memory.
# Increase workers only if response time on /generate exceeds 3s.
CMD gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60 app:app
