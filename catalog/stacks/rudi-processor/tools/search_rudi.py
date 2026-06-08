#!/usr/bin/env python3
"""
RUDI Search - Query the indexed files
"""

import json
import os
import sys
from pathlib import Path
import argparse
from datetime import datetime

_DEFAULT_INDEX = str(Path.home() / ".rudi" / "workspaces" / "rudi-processor" / "index")

def load_manifest(index_path: str = os.environ.get("RUDI_INDEX_DIR", _DEFAULT_INDEX)):
    """Load all entries from manifest"""
    manifest_path = Path(index_path) / 'manifest.jsonl'
    entries = []

    if not manifest_path.exists():
        print("No manifest found. Process some files first!")
        return entries

    with open(manifest_path, 'r') as f:
        for line in f:
            entries.append(json.loads(line.strip()))

    return entries

def load_metadata(meta_path: str):
    """Load metadata from JSON file"""
    with open(meta_path, 'r') as f:
        return json.load(f)

def search_content(query: str, index_path: str = os.environ.get("RUDI_INDEX_DIR", _DEFAULT_INDEX)):
    """Search through indexed content"""
    query_lower = query.lower()
    manifest = load_manifest(index_path)
    results = []

    for entry in manifest:
        try:
            metadata = load_metadata(entry['meta_path'])

            # Search in various fields
            searchable = [
                metadata.get('title', ''),
                metadata.get('filename', ''),
                metadata.get('content_preview', ''),
            ]

            # Check if query matches any searchable field
            if any(query_lower in field.lower() for field in searchable if field):
                results.append({
                    'file': metadata['filename'],
                    'type': metadata['type'],
                    'size': metadata['size_bytes'],
                    'preview': metadata.get('content_preview', '')[:200],
                    'path': metadata['path'],
                    'processed': metadata['processed_at']
                })
        except Exception as e:
            print(f"Error reading {entry['meta_path']}: {e}")

    return results

def list_all(index_path: str = os.environ.get("RUDI_INDEX_DIR", _DEFAULT_INDEX)):
    """List all indexed files"""
    manifest = load_manifest(index_path)

    print(f"\n📚 Indexed Files ({len(manifest)} total)\n")
    print(f"{'File':<40} {'Type':<10} {'Size':<10} {'Processed'}")
    print("-" * 80)

    for entry in manifest:
        try:
            metadata = load_metadata(entry['meta_path'])
            size_kb = metadata['size_bytes'] / 1024
            processed = datetime.fromisoformat(metadata['processed_at']).strftime('%Y-%m-%d %H:%M')

            print(f"{metadata['filename'][:39]:<40} {metadata['type']:<10} {size_kb:>8.1f}KB  {processed}")
        except:
            pass

def main():
    parser = argparse.ArgumentParser(description='Search RUDI indexed files')
    parser.add_argument('query', nargs='?', help='Search query')
    parser.add_argument('--list', action='store_true', help='List all indexed files')
    parser.add_argument('--stats', action='store_true', help='Show index statistics')

    args = parser.parse_args()

    if args.list:
        list_all()
    elif args.stats:
        manifest = load_manifest()
        print(f"\n📊 Index Statistics")
        print(f"  Total files: {len(manifest)}")

        # Count by type
        types = {}
        for entry in manifest:
            types[entry['type']] = types.get(entry['type'], 0) + 1

        print(f"\n  By type:")
        for type_name, count in types.items():
            print(f"    {type_name}: {count}")
    elif args.query:
        results = search_content(args.query)

        if results:
            print(f"\n🔍 Found {len(results)} matches for '{args.query}':\n")
            for i, result in enumerate(results, 1):
                print(f"{i}. {result['file']} ({result['type']})")
                if result['preview']:
                    preview = result['preview'].replace('\n', ' ')[:150]
                    print(f"   {preview}...")
                print(f"   Path: {result['path']}")
                print()
        else:
            print(f"\n❌ No matches found for '{args.query}'")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
