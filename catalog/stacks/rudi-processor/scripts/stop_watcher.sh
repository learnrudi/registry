#!/bin/bash
# Stop RUDI Watcher

WORKSPACE_DIR="${RUDI_WORKSPACE_DIR:-$HOME/.rudi/workspaces/rudi-processor}"
LOG_DIR="${RUDI_INDEX_DIR:-$WORKSPACE_DIR/index}/logs"
PID_FILE="$LOG_DIR/watcher.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "❌ No watcher PID file found"
    echo "   Watcher may not be running"
    exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p $PID > /dev/null 2>&1; then
    echo "🛑 Stopping RUDI Watcher (PID: $PID)..."
    kill $PID
    rm "$PID_FILE"
    echo "✅ Watcher stopped"
else
    echo "⚠️  Watcher not running (stale PID file)"
    rm "$PID_FILE"
fi
