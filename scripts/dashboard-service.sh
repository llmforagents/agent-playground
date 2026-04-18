#!/usr/bin/env bash
# Helpers for the llm4agents-dashboard user service.
# Usage: ./scripts/dashboard-service.sh [status|logs|restart|rebuild|stop|start|disable]

set -euo pipefail

SERVICE="llm4agents-dashboard.service"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cmd="${1:-status}"

case "$cmd" in
  status)
    systemctl --user status "$SERVICE" --no-pager
    ;;
  logs)
    journalctl --user -u "$SERVICE" -f --no-pager
    ;;
  start)
    systemctl --user start "$SERVICE"
    ;;
  stop)
    systemctl --user stop "$SERVICE"
    ;;
  restart)
    systemctl --user restart "$SERVICE"
    ;;
  rebuild)
    cd "$PROJECT_DIR"
    npm run build
    systemctl --user restart "$SERVICE"
    echo "Rebuilt and restarted."
    ;;
  disable)
    systemctl --user disable --now "$SERVICE"
    echo "Service disabled and stopped. Re-enable with: systemctl --user enable --now $SERVICE"
    ;;
  *)
    echo "Usage: $0 {status|logs|restart|rebuild|stop|start|disable}" >&2
    exit 1
    ;;
esac
