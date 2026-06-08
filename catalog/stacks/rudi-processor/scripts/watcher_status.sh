#!/bin/bash
# Check RUDI Watcher status

WORKSPACE_DIR="${RUDI_WORKSPACE_DIR:-$HOME/.rudi/workspaces/rudi-processor}"
LOG_DIR="${RUDI_INDEX_DIR:-$WORKSPACE_DIR/index}/logs"
PID_FILE="$LOG_DIR/watcher.pid"

echo "🔍 RUDI Watcher Status"
echo "====================="

if [ ! -f "$PID_FILE" ]; then
    echo "Status: ❌ Not running"
    echo "Start with: ./start_watcher.sh"
else
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "Status: ✅ Running"
        echo "PID: $PID"

        # Show recent activity
        LOG_FILE="$LOG_DIR/watcher_background.log"
        if [ -f "$LOG_FILE" ]; then
            echo ""
            echo "Recent activity:"
            tail -5 "$LOG_FILE" | sed 's/^/  /'
        fi
    else
        echo "Status: ⚠️  Stopped (stale PID)"
        rm "$PID_FILE"
    fi
fi
