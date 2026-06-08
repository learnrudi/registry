#!/usr/bin/env python3
"""
Demo script showing different output organization modes
"""

import os
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from metadata_processor import MetadataProcessor

def demo_output_modes():
    """Demonstrate different output organization modes"""

    # Test file
    # Override with RUDI_BASE_DIR env var or edit path for your setup
    test_file = os.environ.get("RUDI_TEST_FILE", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "inbox" / "test-file.md"))
    if not Path(test_file).exists():
        print("Please ensure test-file.md exists in RUDI directory")
        return

    modes = {
        "month": "Organized by month (2025-08)",
        "date": "Organized by date (2025-08-07)",
        "year": "Organized by year (2025)",
        "flat": "No subdirectories"
    }

    print("🎯 RUDI Output Organization Modes Demo")
    print("=" * 60)

    for mode, description in modes.items():
        print(f"\n📁 Mode: {mode.upper()}")
        print(f"   Description: {description}")

        # Set environment variable
        os.environ['RUDI_OUTPUT_ORGANIZATION'] = mode

        # Reload config module to pick up new env var
        import importlib
        import config
        importlib.reload(config)

        # Create processor with new config
        processor = MetadataProcessor()

        # Process file
        metadata = processor.process_file(test_file)

        # Save with the current mode
        output_path = processor.save_metadata(metadata)

        # Show where it was saved
        _home_drive = Path.home() / ".rudi" / "workspaces" / "rudi-processor"
        try:
            relative_path = Path(output_path).relative_to(_home_drive)
        except ValueError:
            relative_path = Path(output_path)
        print(f"   ✅ Saved to: .../{relative_path}")

        # Clean up the test file
        Path(output_path).unlink()

    print("\n" + "=" * 60)
    print("💡 To use a specific mode, set environment variable:")
    print("   export RUDI_OUTPUT_ORGANIZATION=date")
    print("\nOr update config/rudi-config.json:")
    print('   "output_organization": "date"')

    # Reset to default
    del os.environ['RUDI_OUTPUT_ORGANIZATION']

if __name__ == "__main__":
    demo_output_modes()
