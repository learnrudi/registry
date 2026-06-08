#!/usr/bin/env python3
"""
RUDI Watcher - Monitors RUDI dropzone for new files
Triggers intelligent processing when files are added
"""

import os
import sys
import time
import json
import subprocess
from pathlib import Path
from datetime import datetime
import logging

class RUDIWatcher:
    """
    Watches RUDI directory and triggers processing
    """

    def __init__(self):
        # Override with RUDI_BASE_DIR / RUDI_INDEX_DIR env vars
        self.rudi_path = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
        _index = Path(os.environ.get("RUDI_INDEX_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))
        self.state_file = _index / ".watcher_state.json"
        self.known_files = self.load_state()
        self.setup_logging()

    def setup_logging(self):
        """Setup logging"""
        log_dir = Path(os.environ.get("RUDI_INDEX_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))) / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(message)s',
            handlers=[
                logging.FileHandler(log_dir / f'watcher_{datetime.now().strftime("%Y%m%d")}.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def load_state(self) -> set:
        """Load known files from state"""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    data = json.load(f)
                    return set(data.get('known_files', []))
            except:
                pass
        return set()

    def save_state(self):
        """Save current state"""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, 'w') as f:
            json.dump({
                'known_files': list(self.known_files),
                'last_check': datetime.now().isoformat()
            }, f)

    def get_current_files(self) -> set:
        """Get current files in RUDI"""
        files = set()
        for f in self.rudi_path.iterdir():
            if f.is_file() and not f.name.startswith('.'):
                # Store filename and modification time
                files.add(f"{f.name}:{f.stat().st_mtime}")
        return files

    def detect_new_files(self) -> list:
        """Detect new or modified files"""
        current = self.get_current_files()

        # Find new or modified files
        new_files = []
        for file_info in current:
            if file_info not in self.known_files:
                filename = file_info.split(':')[0]
                new_files.append(self.rudi_path / filename)

        # Update known files
        self.known_files = current
        self.save_state()

        return new_files

    def trigger_processing(self, file_path: Path):
        """
        Trigger intelligent processing for a file
        Determines whether to use terminal agent or Python tools
        """
        self.logger.info(f"🔔 New file detected: {file_path.name}")

        # Run the orchestrator to determine strategy.
        stack_dir = Path(os.environ.get("RUDI_STACK_DIR", Path(__file__).resolve().parents[1]))
        tool_bin_dir = Path(os.environ.get("RUDI_TOOL_BIN_DIR", stack_dir / "tools"))
        result = subprocess.run(
            [sys.executable,
             str(tool_bin_dir / "rudi_orchestrator.py"),
             str(file_path),
             "--terminal-agent"],
            capture_output=True,
            text=True,
            cwd=str(stack_dir)
        )

        if "needs Terminal Agent" in result.stdout:
            self.logger.info(f"  🤖 Needs Terminal Agent processing")
            print(f"\n⚡ ACTION REQUIRED: Terminal Agent needed for {file_path.name}")
            print("  Instructions have been generated.")
            print("  Terminal Agent should:")
            print("  1. Read the file using Read tool")
            print("  2. Process with terminal_agent_processor.py")
        else:
            # Try Python processing
            self.logger.info(f"  🐍 Processing with Python tools")
            subprocess.run(
                [sys.executable,
                 str(tool_bin_dir / "rudi_intelligent.py"),
                 str(file_path)],
                cwd=str(stack_dir)
            )

    def watch(self, interval: int = 5):
        """
        Main watch loop
        """
        print(f"\n🔍 RUDI WATCHER ACTIVE")
        print(f"📁 Monitoring: {self.rudi_path}")
        print(f"⏱️  Check interval: {interval} seconds")
        print(f"Press Ctrl+C to stop\n")

        self.logger.info("Watcher started")

        try:
            while True:
                # Check for new files
                new_files = self.detect_new_files()

                if new_files:
                    print(f"\n{'='*60}")
                    print(f"🆕 Found {len(new_files)} new file(s)!")

                    for file_path in new_files:
                        self.trigger_processing(file_path)

                    print(f"{'='*60}\n")

                # Wait before next check
                time.sleep(interval)

        except KeyboardInterrupt:
            print("\n\n👋 Watcher stopped")
            self.logger.info("Watcher stopped by user")
        except Exception as e:
            self.logger.error(f"Watcher error: {e}")
            print(f"\n❌ Error: {e}")


def main():
    """
    Main entry point for watcher
    """
    import argparse

    parser = argparse.ArgumentParser(
        description='RUDI Watcher - Monitor dropzone for new files'
    )

    parser.add_argument('--interval', type=int, default=5,
                       help='Check interval in seconds (default: 5)')
    parser.add_argument('--once', action='store_true',
                       help='Check once and exit')

    args = parser.parse_args()

    watcher = RUDIWatcher()

    if args.once:
        # Single check
        new_files = watcher.detect_new_files()
        if new_files:
            print(f"Found {len(new_files)} new file(s):")
            for f in new_files:
                print(f"  - {f.name}")
                watcher.trigger_processing(f)
        else:
            print("No new files found")
    else:
        # Continuous watching
        watcher.watch(interval=args.interval)


if __name__ == "__main__":
    main()
