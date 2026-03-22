#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

notice() { echo "[dev] $*"; }

build_frontend() {
  notice "Building frontend..."
  cd "$FRONTEND_DIR"
  if [ ! -f package.json ]; then
    echo "package.json not found in $FRONTEND_DIR" >&2
    exit 1
  fi
  if [ ! -d node_modules ]; then
    notice "Installing frontend dependencies..."
    if command -v npm >/dev/null 2>&1; then
      npm ci || npm install
    else
      echo "npm is not installed. Please install Node.js/npm." >&2
      exit 1
    fi
  fi
  npm run build

  notice "Copying build to backend/frontend/..."
  mkdir -p "$BACKEND_DIR/frontend"
  rm -rf "$BACKEND_DIR/frontend/dist"
  cp -r "$FRONTEND_DIR/dist" "$BACKEND_DIR/frontend/"
}

ensure_venv() {
  notice "Ensuring Python venv..."
  cd "$BACKEND_DIR"
  if [ ! -d .venv ]; then
    notice "Creating venv at $BACKEND_DIR/.venv"
    if ! command -v python3 >/dev/null 2>&1; then
      echo "python3 is not installed." >&2
      exit 1
    fi
    python3 -m venv .venv
  fi

  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  pip install -r requirements.txt
}

serve_backend() {
  cd "$BACKEND_DIR"
  ensure_venv
  notice "Starting uvicorn at http://localhost:8000 ..."
  exec uvicorn app:app --reload --port 8000
}

deactivate_cmd() {
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    if type deactivate >/dev/null 2>&1; then
      deactivate
      notice "Deactivated current virtualenv."
    else
      notice "No active virtualenv to deactivate."
    fi
  else
    echo "To deactivate the virtualenv in your current shell, run:" >&2
    echo "  source ./dev.sh deactivate" >&2
    exit 1
  fi
}

usage() {
  cat <<EOF
Usage: ./dev.sh [command]

Commands:
  build        Build frontend and copy to backend/frontend/
  serve        Ensure venv and run uvicorn
  start        Build frontend, then run uvicorn
  deactivate   Deactivate venv (requires: source ./dev.sh deactivate)
  help         Show this help
EOF
}

cmd="${1:-help}"
case "$cmd" in
  build) build_frontend ;;
  serve) serve_backend ;;
  start) build_frontend; serve_backend ;;
  deactivate) deactivate_cmd ;;
  help|*) usage ;;
esac
