#!/bin/bash
# RUDI Status - Quick check of processing status

echo "📊 RUDI Processing Status"
echo "========================"
echo ""

# Count files in RUDI
WORKSPACE_DIR="${RUDI_WORKSPACE_DIR:-$HOME/.rudi/workspaces/rudi-processor}"
RUDI_BASE="${RUDI_BASE_DIR:-$WORKSPACE_DIR/inbox}"
RUDI_INDEX="${RUDI_INDEX_DIR:-$WORKSPACE_DIR/index}"
RUDI_COUNT=$(ls -1 "$RUDI_BASE" 2>/dev/null | grep -v "^\." | wc -l | tr -d ' ')
echo "📁 Files in RUDI: $RUDI_COUNT"

# Count metadata files
META_COUNT=$(find "$RUDI_INDEX/metadata" -name "*.meta.json" 2>/dev/null | wc -l | tr -d ' ')
echo "📝 Metadata files: $META_COUNT"

# Check manifest entries
if [ -f "$RUDI_INDEX/manifest.jsonl" ]; then
    MANIFEST_COUNT=$(wc -l < "$RUDI_INDEX/manifest.jsonl" | tr -d ' ')
    echo "📜 Manifest entries: $MANIFEST_COUNT"
else
    echo "📜 Manifest: Not found"
fi

echo ""
echo "Run 'python3 tools/rudi_audit.py' for detailed status"
