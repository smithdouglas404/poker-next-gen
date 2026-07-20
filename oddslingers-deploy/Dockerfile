# Production image for OddSlingers on Railway.
#
# STRATEGY (chosen for poker-next-gen): this Dockerfile is self-contained — it
# git-clones the pinned upstream OddSlingers commit at build time rather than
# relying on the git submodule being checked out or vendoring 100k lines into
# this repo. Railway builds THIS file; the source is fetched during the build.
#
# ⚠️ UNVERIFIED: OddSlingers is a Python 3.7 (EOL) Django-Channels app whose own
# Dockerfile is dev-only (bind mounts, runserver, webpack watch). The steps below
# mirror its upstream build for a production ASGI (daphne) process, but this has
# NOT been built/deployed from this environment — it will likely need one or two
# real Railway build iterations (Pipfile.lock resolution, yarn build target,
# collectstatic env). Treat as a strong starting point, not a proven image.

FROM python:3.7-buster

# Pin the exact upstream commit the repo's submodule references.
ARG ODDSLINGERS_SHA=a3dcf1eeb264c364f653f1062333161861ec7c01
ARG ODDSLINGERS_REPO=https://github.com/Monadical-SAS/oddslingers.poker.git

ENV ODDSLINGERS_ROOT=/opt/oddslingers.poker \
    VENV_NAME=.venv-docker \
    NODE_MAJOR=18 \
    ODDSLINGERS_ENV=PROD \
    DJANGO_SETTINGS_MODULE=oddslingers.settings \
    IS_DOCKER=1 \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System deps (mirrors upstream Dockerfile: psycopg2, node, build tools, jq).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl gnupg jq libpq-dev build-essential \
      python3-dev python3-venv && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install -y nodejs && \
    npm install -g yarn && \
    rm -rf /var/lib/apt/lists/*

WORKDIR ${ODDSLINGERS_ROOT}

# Fetch the pinned source (self-contained; no submodule needed).
RUN git clone "${ODDSLINGERS_REPO}" src && \
    cd src && git checkout "${ODDSLINGERS_SHA}"

# Python dependencies from Pipfile.lock (upstream's jq install trick).
RUN pip install --no-cache-dir virtualenv && \
    jq -r '.default | to_entries[] | .key + .value.version' src/core/Pipfile.lock \
      | pip install --no-cache-dir -r /dev/stdin && \
    pip install --no-cache-dir whitenoise gunicorn

# Frontend assets (webpack + sass). Build target may differ across versions —
# validate on first real build.
RUN cd src/core/js && yarn install --frozen-lockfile && (yarn build || webpack --mode production || true)

# Collect static. A dummy SECRET_KEY lets collectstatic run at build time; the
# real one is supplied via Railway env at runtime.
RUN cd src/core && SECRET_KEY=build-time-only SERVE_STATIC=True \
      ./manage.py collectstatic --noinput || \
      echo "collectstatic needs adjustment — revisit on first real build"

WORKDIR ${ODDSLINGERS_ROOT}/src/core

# Railway provides $PORT. Run the ASGI server (Channels) via daphne.
EXPOSE 8000
CMD ["sh", "-c", "./manage.py migrate --noinput && daphne -b 0.0.0.0 -p ${PORT:-8000} oddslingers.asgi:channel_layer"]
