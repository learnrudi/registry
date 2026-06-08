# Scripts

Shell scripts for managing the RUDI processing system.

## Available Scripts

### 🚀 start_watcher.sh
Starts the file watcher in the background.
```bash
./start_watcher.sh
# Output: Watcher started with PID: 12345
```

### 🛑 stop_watcher.sh
Stops the running watcher process.
```bash
./stop_watcher.sh
# Output: Watcher stopped (PID: 12345)
```

### 📊 watcher_status.sh
Shows the current watcher status and recent activity.
```bash
./watcher_status.sh
# Shows: Running/Stopped, PID, recent file detections
```

### 🔍 rudi_status.sh
Overall system status check.
```bash
./rudi_status.sh
# Shows: Watcher status, file counts, processing stats
```

## Making Scripts Executable

If scripts aren't executable, run:
```bash
chmod +x scripts/*.sh
```

## Script Locations

All scripts expect to be run from the rudi-processor directory:
```bash
cd /path/to/rudi-processor
./scripts/start_watcher.sh
```

## PID Management

The watcher PID is stored in:
- `~/.rudi/workspaces/rudi-processor/index/.watcher.pid`

## Logs

Watcher logs are stored in:
- `~/.rudi/workspaces/rudi-processor/index/logs/watcher_background.log`

## Troubleshooting

If watcher won't start:
1. Check if already running: `./scripts/watcher_status.sh`
2. Check PID file: `cat ~/.rudi/workspaces/rudi-processor/index/.watcher.pid`
3. Force stop if needed: `kill $(cat ~/.rudi/workspaces/rudi-processor/index/.watcher.pid)`
4. Remove stale PID: `rm ~/.rudi/workspaces/rudi-processor/index/.watcher.pid`
