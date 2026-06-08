#!/usr/bin/env python3
"""
RUDI Orchestrator - Intelligent file processing orchestration
Coordinates between terminal agent capabilities and specialized tools
"""

import os
import sys
import json
import time
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List
import logging

class RUDIOrchestrator:
    """
    Orchestrates intelligent file processing using the best tool for each job
    """

    def __init__(self):
        # Override with RUDI_BASE_DIR, RUDI_INDEX_DIR, RUDI_STACK_DIR, or RUDI_TOOL_BIN_DIR env vars
        self.rudi_path = Path(os.environ.get("RUDI_BASE_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox"))
        self.index_path = Path(os.environ.get("RUDI_INDEX_DIR", Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index"))
        self.stack_path = Path(os.environ.get("RUDI_STACK_DIR", Path(__file__).resolve().parents[1]))
        self.tool_bin_path = Path(os.environ.get("RUDI_TOOL_BIN_DIR", self.stack_path / "tools"))
        self.setup_logging()

    def setup_logging(self):
        """Setup logging"""
        log_dir = self.index_path / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_dir / f'orchestrator_{datetime.now().strftime("%Y%m%d")}.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def get_file_hash(self, file_path: str) -> str:
        """Quick hash check for deduplication"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def is_already_processed(self, file_hash: str) -> bool:
        """Check if file was already processed"""
        manifest_path = self.index_path / 'manifest.jsonl'
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        if entry.get('hash') == file_hash:
                            return True
                    except:
                        continue
        return False

    def determine_processing_strategy(self, file_path: Path) -> str:
        """
        Determine the best processing strategy for a file
        Returns: 'terminal_agent', 'python_tool', 'hybrid'
        """
        ext = file_path.suffix.lower()
        size_mb = file_path.stat().st_size / (1024 * 1024)

        # Decision tree for processing strategy
        strategies = {
            '.pdf': 'terminal_agent' if size_mb < 10 else 'hybrid',
            '.png': 'terminal_agent',
            '.jpg': 'terminal_agent',
            '.jpeg': 'terminal_agent',
            '.txt': 'python_tool' if size_mb < 1 else 'terminal_agent',
            '.md': 'python_tool',
            '.json': 'python_tool',
            '.csv': 'python_tool' if size_mb < 5 else 'terminal_agent',
            '.docx': 'hybrid',  # Terminal agent reads, python extracts if needed
            '.mp3': 'terminal_agent',  # Terminal agent for audio
            '.mp4': 'terminal_agent',  # Terminal agent for video
        }

        return strategies.get(ext, 'python_tool')

    def create_terminal_agent_instructions(self, file_path: Path) -> Dict[str, Any]:
        """
        Create specific instructions for terminal agent processing
        """
        ext = file_path.suffix.lower()

        instructions = {
            "file_path": str(file_path),
            "task": "read_and_analyze",
            "requirements": []
        }

        if ext == '.pdf':
            instructions["requirements"] = [
                "Read the PDF content",
                "Extract: title, author, document type, main topics",
                "Determine if it's a resume, report, agreement, research paper, etc.",
                "Identify key entities (people, organizations, projects)",
                "Generate a meaningful filename based on content"
            ]
        elif ext in ['.jpg', '.jpeg', '.png']:
            instructions["requirements"] = [
                "Analyze the image content",
                "Extract any visible text (OCR)",
                "Identify: screenshot, photo, diagram, document scan",
                "Describe what the image contains",
                "Suggest appropriate category"
            ]
        elif ext in ['.mp3', '.mp4']:
            instructions["requirements"] = [
                "Check for transcripts or captions",
                "Identify: meeting, presentation, tutorial, personal",
                "Extract duration and quality info",
                "Note participants if identifiable"
            ]

        return instructions

    def process_with_terminal_agent(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """
        Process file using terminal agent capabilities
        This would be called by the terminal agent itself
        """
        self.logger.info(f"Terminal agent processing: {file_path}")

        # Terminal agent would:
        # 1. Read the file directly
        # 2. Extract information
        # 3. Return structured data

        # This is a placeholder - in reality, the terminal agent
        # would use its Read tool and return the analysis
        return {
            "status": "needs_terminal_agent",
            "instructions": self.create_terminal_agent_instructions(file_path)
        }

    def process_with_python_tools(self, file_path: Path) -> Dict[str, Any]:
        """
        Process file using Python tools
        """
        self.logger.info(f"Python tool processing: {file_path}")

        # Use the intelligent processor - set working directory
        try:
            result = subprocess.run(
                [sys.executable, str(self.tool_bin_path / "rudi_intelligent.py"), str(file_path)],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(self.stack_path)
            )

            if result.returncode == 0:
                return {"status": "processed", "output": result.stdout}
            else:
                return {"status": "error", "error": result.stderr}

        except Exception as e:
            self.logger.error(f"Python processing failed: {e}")
            return {"status": "error", "error": str(e)}

    def process_hybrid(self, file_path: Path) -> Dict[str, Any]:
        """
        Hybrid processing - terminal agent reads, Python tools process
        """
        self.logger.info(f"Hybrid processing: {file_path}")

        # Step 1: Terminal agent reads and understands
        agent_analysis = self.process_with_terminal_agent(file_path)

        # Step 2: Python tools process with agent's insights
        # This would combine both capabilities

        return {
            "status": "needs_hybrid_processing",
            "agent_part": agent_analysis,
            "next_step": "python_processing_with_context"
        }

    def orchestrate_file(self, file_path: Path) -> Dict[str, Any]:
        """
        Main orchestration logic for a single file
        """
        self.logger.info(f"\n{'='*60}")
        self.logger.info(f"🎼 ORCHESTRATING: {file_path.name}")

        # Step 1: Quick checks
        if not file_path.exists():
            return {"status": "error", "message": "File not found"}

        # Step 2: Check for duplicates
        file_hash = self.get_file_hash(str(file_path))
        if self.is_already_processed(file_hash):
            self.logger.info(f"⏭️  Already processed (hash: {file_hash[:16]}...)")
            return {"status": "duplicate", "hash": file_hash}

        # Step 3: Determine strategy
        strategy = self.determine_processing_strategy(file_path)
        self.logger.info(f"📊 Strategy: {strategy}")

        # Step 4: Execute strategy
        if strategy == 'terminal_agent':
            result = self.process_with_terminal_agent(file_path)
        elif strategy == 'python_tool':
            result = self.process_with_python_tools(file_path)
        else:  # hybrid
            result = self.process_hybrid(file_path)

        result['file'] = file_path.name
        result['strategy'] = strategy
        result['hash'] = file_hash

        return result

    def orchestrate_directory(self, directory: Path = None) -> List[Dict[str, Any]]:
        """
        Orchestrate processing for all files in directory
        """
        if directory is None:
            directory = self.rudi_path

        results = []
        files = [f for f in directory.iterdir() if f.is_file() and not f.name.startswith('.')]

        self.logger.info(f"\n🎭 RUDI ORCHESTRATOR")
        self.logger.info(f"📁 Processing {len(files)} files from {directory}")

        for file_path in files:
            result = self.orchestrate_file(file_path)
            results.append(result)

            # Show progress
            if result['status'] == 'duplicate':
                print(f"  ⏭️  {file_path.name} (duplicate)")
            elif result['status'] == 'needs_terminal_agent':
                print(f"  🤖 {file_path.name} → Terminal Agent needed")
            elif result['status'] == 'processed':
                print(f"  ✅ {file_path.name} → Processed")
            elif result['status'] == 'needs_hybrid_processing':
                print(f"  🔄 {file_path.name} → Hybrid processing needed")
            else:
                print(f"  ❌ {file_path.name} → Error")

        return results


def main():
    """
    Main entry point for orchestration
    """
    import argparse

    parser = argparse.ArgumentParser(
        description='RUDI Orchestrator - Intelligent file processing coordination'
    )

    parser.add_argument('path', nargs='?',
                       default=os.environ.get("RUDI_BASE_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox")),
                       help='File or directory to process')
    parser.add_argument('--watch', action='store_true',
                       help='Watch directory for changes')
    parser.add_argument('--terminal-agent', action='store_true',
                       help='Run in terminal agent mode')

    args = parser.parse_args()

    orchestrator = RUDIOrchestrator()

    if args.watch:
        print("🔍 Watching RUDI for changes...")
        print("(File watcher not implemented yet - use manual mode)")

    elif args.terminal_agent:
        # Terminal agent mode - show what needs agent processing
        path = Path(args.path)

        if path.is_file():
            result = orchestrator.orchestrate_file(path)

            if result.get('status') == 'needs_terminal_agent':
                print("\n📋 TERMINAL AGENT INSTRUCTIONS:")
                print(json.dumps(result['instructions'], indent=2))
                print("\n💡 Terminal Agent should:")
                print("1. Use Read tool on this file")
                print("2. Extract the required information")
                print("3. Call terminal_agent_processor.py with the data")
        else:
            results = orchestrator.orchestrate_directory(path)

            needs_agent = [r for r in results if r.get('status') == 'needs_terminal_agent']
            if needs_agent:
                print(f"\n🤖 {len(needs_agent)} files need Terminal Agent processing:")
                for r in needs_agent:
                    print(f"  - {r['file']}")
    else:
        # Normal orchestration
        path = Path(args.path)

        if path.is_file():
            result = orchestrator.orchestrate_file(path)
            print(f"\nResult: {result['status']}")
        else:
            results = orchestrator.orchestrate_directory(path)

            # Summary
            print(f"\n{'='*60}")
            print("📊 ORCHESTRATION SUMMARY:")

            status_counts = {}
            for r in results:
                status = r.get('status', 'unknown')
                status_counts[status] = status_counts.get(status, 0) + 1

            for status, count in status_counts.items():
                if status == 'duplicate':
                    print(f"  ⏭️  Duplicates: {count}")
                elif status == 'processed':
                    print(f"  ✅ Processed: {count}")
                elif status == 'needs_terminal_agent':
                    print(f"  🤖 Need Terminal Agent: {count}")
                elif status == 'needs_hybrid_processing':
                    print(f"  🔄 Need Hybrid: {count}")
                else:
                    print(f"  ❓ {status}: {count}")


if __name__ == "__main__":
    main()
