#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/todo.pid"
LOG_FILE="$RUNTIME_DIR/todo.log"
CLI_DIR="${HOME}/.local/bin"
CLI_PATH="$CLI_DIR/todo"

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

prepare_runtime() {
  build_frontend
  ensure_venv
}

is_running() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  if [ -z "$pid" ]; then
    return 1
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  rm -f "$PID_FILE"
  return 1
}

start_background() {
  mkdir -p "$RUNTIME_DIR"

  if is_running; then
    notice "Background server already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  prepare_runtime
  launch_background
}

launch_background() {
  notice "Starting background server at http://localhost:8000 ..."
  cd "$BACKEND_DIR"
  nohup "$BACKEND_DIR/.venv/bin/uvicorn" app:app --host 127.0.0.1 --port 8000 >>"$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  notice "Started (pid $(cat "$PID_FILE")). Logs: $LOG_FILE"
}

stop_background() {
  if ! is_running; then
    notice "Background server is not running."
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  notice "Stopping background server (pid $pid) ..."
  kill "$pid"

  for _ in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      notice "Stopped."
      return 0
    fi
    sleep 0.25
  done

  notice "Process did not exit in time; forcing stop."
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

restart_background() {
  if is_running; then
    prepare_runtime
    stop_background
    launch_background
  else
    start_background
  fi
}

status_background() {
  if is_running; then
    notice "Background server is running (pid $(cat "$PID_FILE")) at http://localhost:8000"
  else
    notice "Background server is stopped."
  fi
}

logs_background() {
  mkdir -p "$RUNTIME_DIR"
  touch "$LOG_FILE"
  tail -f "$LOG_FILE"
}

install_cli() {
  mkdir -p "$CLI_DIR"
  cat > "$CLI_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$ROOT_DIR"

cmd="\${1:-help}"
case "\$cmd" in
  start) exec "\$ROOT_DIR/dev.sh" bg-start ;;
  stop) exec "\$ROOT_DIR/dev.sh" bg-stop ;;
  restart) exec "\$ROOT_DIR/dev.sh" bg-restart ;;
  status) exec "\$ROOT_DIR/dev.sh" bg-status ;;
  logs) exec "\$ROOT_DIR/dev.sh" bg-logs ;;
  build|serve|help) exec "\$ROOT_DIR/dev.sh" "\$@" ;;
  *)
    echo "Usage: todo {start|stop|restart|status|logs|build|serve|help}" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$CLI_PATH"

  notice "Installed todo CLI at $CLI_PATH"
  case ":$PATH:" in
    *":$CLI_DIR:"*) ;;
    *)
      notice "$CLI_DIR is not on PATH. Add this to your shell profile:"
      echo "export PATH=\"$CLI_DIR:\$PATH\""
      ;;
  esac
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
  bg-start     Build frontend, then run uvicorn in the background
  bg-stop      Stop the background server
  bg-restart   Restart the background server
  bg-status    Show background server status
  bg-logs      Tail the background server log
  install-cli  Install the 'todo' command in ~/.local/bin
  deactivate   Deactivate venv (requires: source ./dev.sh deactivate)
  help         Show this help
EOF
}

cmd="${1:-help}"
case "$cmd" in
  build) build_frontend ;;
  serve) serve_backend ;;
  start) build_frontend; serve_backend ;;
  bg-start) start_background ;;
  bg-stop) stop_background ;;
  bg-restart) restart_background ;;
  bg-status) status_background ;;
  bg-logs) logs_background ;;
  install-cli) install_cli ;;
  deactivate) deactivate_cmd ;;
  help|*) usage ;;
esac
