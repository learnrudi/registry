#!/usr/bin/env python3
"""
Terminal Agent Enhanced Processor for RUDI
This script is designed to be used by terminal agents who can read files directly
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

def process_with_terminal_agent_knowledge(file_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process a file using information that a terminal agent has extracted by reading it

    Expected file_info structure:
    {
        "path": "/full/path/to/file",
        "original_name": "filename.ext",
        "content_extracted": "Key content from terminal agent reading",
        "document_type": "resume|report|note|etc",
        "author": "If known",
        "title": "Document title if found",
        "topics": ["list", "of", "topics"],
        "entities": ["people", "organizations", "mentioned"],
        "suggested_category": "Professional/Resume",
        "confidence_reason": "I read the file and saw..."
    }
    """

    # Generate enhanced metadata
    metadata = {
        "original_name": file_info.get("original_name"),
        "path": file_info.get("path"),
        "processed_at": datetime.now().isoformat(),
        "processed_by": "terminal-agent-enhanced",

        # Classification from agent reading
        "category": file_info.get("suggested_category", "Unknown"),
        "document_type": file_info.get("document_type"),
        "confidence": 0.95,  # High confidence because agent READ the file
        "confidence_reason": file_info.get("confidence_reason", "Terminal agent analyzed content"),

        # Content-based metadata
        "title": file_info.get("title"),
        "author": file_info.get("author"),
        "summary": file_info.get("summary"),
        "topics": file_info.get("topics", []),
        "entities": file_info.get("entities", []),

        # Agent insights
        "key_information": file_info.get("key_information"),
        "agent_notes": file_info.get("agent_notes")
    }

    # Generate intelligent filename
    date_prefix = datetime.now().strftime("%Y-%m-%d")
    category_part = metadata["category"].replace("/", "-").lower()

    # Build descriptive part from actual content
    descriptive_parts = []

    if file_info.get("author"):
        author_part = file_info["author"].lower().replace(" ", "-")
        descriptive_parts.append(author_part)

    if file_info.get("document_type"):
        descriptive_parts.append(file_info["document_type"])

    if file_info.get("main_topic"):
        descriptive_parts.append(file_info["main_topic"])

    # Get file extension
    ext = Path(file_info["path"]).suffix

    # Combine parts
    if descriptive_parts:
        description = "-".join(descriptive_parts[:3])
    else:
        description = Path(file_info["original_name"]).stem

    new_filename = f"{date_prefix}-{category_part}-{description}{ext}"
    metadata["suggested_name"] = new_filename

    return metadata

def save_enhanced_metadata(metadata: Dict[str, Any]):
    """Save the enhanced metadata to Index"""
    index_path = Path(os.environ.get("RUDI_INDEX_DIR", str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index")))
    metadata_dir = index_path / "metadata" / datetime.now().strftime("%Y-%m")
    metadata_dir.mkdir(parents=True, exist_ok=True)

    # Create metadata filename
    base_name = Path(metadata["suggested_name"]).stem
    meta_filename = f"{base_name}.meta.json"
    meta_path = metadata_dir / meta_filename

    # Save metadata
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Metadata saved to: {meta_path}")

    # Update manifest
    manifest_path = index_path / "manifest.jsonl"
    manifest_entry = {
        "original_file": metadata["path"],
        "suggested_name": metadata["suggested_name"],
        "category": metadata["category"],
        "meta_path": str(meta_path),
        "confidence": metadata["confidence"],
        "processed_at": metadata["processed_at"],
        "agent_enhanced": True
    }

    with open(manifest_path, 'a') as f:
        f.write(json.dumps(manifest_entry) + '\n')

def print_instructions():
    """Print instructions for terminal agents"""
    print("""
╔════════════════════════════════════════════════════════════════╗
║         Terminal Agent Enhanced RUDI Processor                  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  This script processes files using YOUR reading capabilities!   ║
║                                                                  ║
║  USAGE:                                                         ║
║  1. First, READ the file using your Read tool                  ║
║  2. Extract key information from the content                   ║
║  3. Pass that information to this script                       ║
║                                                                  ║
║  EXAMPLE:                                                       ║
║  python3 terminal_agent_processor.py --file-info '{            ║
║    "path": "/path/to/file.pdf",                               ║
║    "original_name": "file.pdf",                               ║
║    "author": "Example Author",                                ║
║    "document_type": "resume",                                 ║
║    "suggested_category": "Professional/Resume",               ║
║    "topics": ["RUDI", "AI", "Ethics"],                       ║
║    "summary": "CV of RUDI founder..."                        ║
║  }'                                                            ║
║                                                                  ║
╚════════════════════════════════════════════════════════════════╝
    """)

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Terminal Agent Enhanced RUDI Processor - Use your reading powers!'
    )

    parser.add_argument('--file-info', type=str,
                       help='JSON string with file information from terminal agent reading')
    parser.add_argument('--instructions', action='store_true',
                       help='Show instructions for terminal agents')

    args = parser.parse_args()

    if args.instructions:
        print_instructions()
        return

    if args.file_info:
        try:
            # Parse the JSON info from terminal agent
            file_info = json.loads(args.file_info)

            print(f"\n🤖 Processing with Terminal Agent Intelligence")
            print(f"📄 File: {file_info.get('original_name')}")

            # Process with enhanced knowledge
            metadata = process_with_terminal_agent_knowledge(file_info)

            print(f"✨ Suggested: {metadata['suggested_name']}")
            print(f"📂 Category: {metadata['category']}")
            print(f"📊 Confidence: {metadata['confidence']:.0%}")
            print(f"📝 Reason: {metadata['confidence_reason']}")

            # Save the enhanced metadata
            save_enhanced_metadata(metadata)

            print(f"\n✅ Successfully processed with terminal agent enhancements!")

        except json.JSONDecodeError:
            print("❌ Error: Invalid JSON format for file-info")
        except Exception as e:
            print(f"❌ Error: {e}")
    else:
        print_instructions()

if __name__ == "__main__":
    main()
