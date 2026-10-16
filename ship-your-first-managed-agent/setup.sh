#!/usr/bin/env bash
# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
#
# One command to get ready: virtualenv, packages, your API key, the log
# fixture, then the dashboard. Safe to run again.
#
#   ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
  echo "Python 3.10 or newer is required (found: $("$PY" --version 2>&1 || echo none))."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "→ creating .venv"
  "$PY" -m venv .venv
fi
echo "→ installing packages"
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt

if [ ! -f .env ] || ! grep -q '^ANTHROPIC_API_KEY=sk-' .env || grep -q '^ANTHROPIC_API_KEY=sk-ant-\.\.\.$' .env; then
  key="${ANTHROPIC_API_KEY:-}"
  if [ -z "$key" ]; then
    read -r -s -p "→ paste your Anthropic API key (input is hidden): " key
    echo
  fi
  (umask 077; printf 'ANTHROPIC_API_KEY=%s\n' "$key" > .env)
  echo "→ saved the key to .env"
fi

if [ ! -f data/app.log ]; then
  .venv/bin/python data/generate_log.py
fi

cat <<'NEXT'

Ready. Two things left:

  1. Open a second terminal in this folder and run:   claude
     then type:                                       get the agent online

  2. This terminal now starts the dashboard at http://localhost:8501
     (Ctrl+C stops it; ./setup.sh starts it again.)

NEXT
exec .venv/bin/python -m streamlit run app.py
