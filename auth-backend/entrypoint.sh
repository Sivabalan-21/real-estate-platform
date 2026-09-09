#!/bin/sh
set -e

required_vars="DATABASE_URL SECRET_KEY"
missing=""

for var in $required_vars; do
  eval "value=\$$var"
  if [ -z "$value" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "=================================================================="
  echo "ERROR: Missing required environment variable(s):$missing"
  echo "Copy .env.example to .env at the repo root and fill these in,"
  echo "then run 'docker compose up' again."
  echo "=================================================================="
  exit 1
fi

echo "Running Alembic migrations..."
alembic upgrade head

exec "$@"