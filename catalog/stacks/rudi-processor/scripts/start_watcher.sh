#!/bin/bash
# Start RUDI Watcher in silent/background mode

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
STACK_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
WORKSPACE_DIR="${RUDI_WORKSPACE_DIR:-$HOME/.rudi/workspaces/rudi-processor}"
LOG_DIR="${RUDI_INDEX_DIR:-$WORKSPACE_DIR/index}/logs"
PID_FILE="$LOG_DIR/watcher.pid"

mkdir -p "$LOG_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Watcher already running (PID: $PID)"
        echo "   Stop with: ./stop_watcher.sh"
        exit 1
    fi
fi

# Start watcher in background
echo "🚀 Starting RUDI Watcher in background..."
cd "$STACK_DIR"
nohup python3 "$STACK_DIR/tools/rudi_watcher.py" > "$LOG_DIR/watcher_background.log" 2>&1 &
PID=$!

# Save PID
echo $PID > "$PID_FILE"

echo "✅ Watcher started (PID: $PID)"
echo "   Logs: $LOG_DIR/watcher_background.log"
echo "   Stop with: ./stop_watcher.sh"
