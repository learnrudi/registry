# 📚 RUDI Processor Examples

This directory contains example scripts demonstrating various features of the RUDI processor.

## 🚀 Available Examples

### `batch_process_all.py`
Batch processes all files in the RUDI directory.

```bash
python3 batch_process_all.py
```

**Features:**
- Processes all files in `~/.rudi/workspaces/rudi-processor/inbox/`
- Shows progress for each file
- Reports statistics (success rate, text extraction)
- Handles errors gracefully

### `demo_output_modes.py`
Demonstrates different output organization modes.

```bash
python3 demo_output_modes.py
```

**Output Modes:**
- `month` - Organize by month (2025-08)
- `date` - Organize by date (2025-08-07)
- `year` - Organize by year (2025)
- `flat` - No subdirectories

## 💡 Usage Tips

### Setting Output Organization
```bash
# Use environment variable
export RUDI_OUTPUT_ORGANIZATION=date
python3 batch_process_all.py

# Or edit config/rudi-config.json
{
  "output_organization": "date"
}
```

### Custom Paths
```bash
# Process files from different location
export RUDI_PATH="/path/to/your/files"
python3 batch_process_all.py
```

### Check Results
After running, check:
- Metadata files: `~/.rudi/workspaces/rudi-processor/index/metadata/stage1/`
- Logs: `~/.rudi/workspaces/rudi-processor/index/logs/`

## 📊 Example Output

### Batch Processing
```
🚀 BATCH PROCESSING 32 FILES
============================================================
[1/32] Processing: document.pdf
  ✅ Success - Stage: awaiting_llm
  📝 Text extracted: 5234 characters
  💾 Saved to: document.stage1.json

...

📊 BATCH PROCESSING SUMMARY
✅ Successfully processed: 31 files
📝 Text extracted from: 26 files
⚠️  Errors encountered: 1 files
```

### Output Modes Demo
```
🎯 RUDI Output Organization Modes Demo
============================================================
📁 Mode: MONTH
   Description: Organized by month (2025-08)
   ✅ Saved to: .../Index/metadata/stage1/2025-08/

📁 Mode: DATE
   Description: Organized by date (2025-08-07)
   ✅ Saved to: .../Index/metadata/stage1/2025-08-07/
```

## 🔧 Customization

Feel free to modify these examples for your needs:
- Add filtering by file type
- Process specific subdirectories
- Add custom metadata fields
- Integrate with other systems

## 📝 Notes

- Examples use the global configuration from `config.py`
- Environment variables override config file settings
- All examples include error handling and logging
- Results are saved to the configured Index path
