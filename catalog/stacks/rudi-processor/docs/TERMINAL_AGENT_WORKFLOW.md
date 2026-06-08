# Terminal Agent Activation Workflow
## How Terminal Agents Process RUDI Files

---

## 🤖 When Terminal Agent is Activated

The system activates terminal agent processing when:

1. **PDF files** are detected (Python can't read content)
2. **Images** need analysis (screenshots, photos, diagrams)
3. **Audio/Video** files need understanding
4. **Low confidence** classification (<70%)
5. **Complex documents** requiring semantic understanding

---

## 📋 Terminal Agent Activation Process

### Step 1: Detection & Alert

When watcher is running and detects a file needing terminal agent:

```
============================================================
🆕 Found 1 new file(s)!
🔔 New file detected: contract.pdf
⚡ ACTION REQUIRED: Terminal Agent needed for contract.pdf
   Instructions have been generated.
   Terminal Agent should:
   1. Read the file using Read tool
   2. Process with terminal_agent_processor.py
============================================================
```

### Step 2: Terminal Agent Reads File

Terminal agent uses Read tool to examine content:

```bash
# Terminal agent command:
Read ~/.rudi/workspaces/rudi-processor/inbox/contract.pdf
```

Terminal agent sees the actual content and understands:
- Document type (contract, resume, report, etc.)
- Key parties/entities involved
- Main topics and themes
- Appropriate categorization

### Step 3: Terminal Agent Extracts Information

Based on reading, terminal agent identifies:

```json
{
  "document_type": "service-agreement",
  "parties": ["Acme Corp", "Consulting LLC"],
  "key_dates": ["2025-08-01", "2026-07-31"],
  "topics": ["consulting", "services", "payment", "deliverables"],
  "suggested_category": "Professional/Legal",
  "confidence_reason": "This is a consulting service agreement between two companies"
}
```

### Step 4: Terminal Agent Processes

Terminal agent runs the processor with extracted information:

```bash
python3 terminal_agent_processor.py --file-info '{
  "path": "~/.rudi/workspaces/rudi-processor/inbox/contract.pdf",
  "original_name": "contract.pdf",
  "document_type": "service-agreement",
  "parties": ["Acme Corp", "Consulting LLC"],
  "suggested_category": "Professional/Legal",
  "topics": ["consulting", "services", "payment"],
  "entities": ["Acme Corp", "Consulting LLC", "John Smith"],
  "summary": "12-month consulting service agreement between Acme Corp and Consulting LLC",
  "confidence_reason": "Read the PDF - identified as service agreement with clear parties and terms",
  "key_information": "Contract value: $120,000, Duration: 12 months, Start: Aug 2025"
}'
```

### Step 5: High-Confidence Metadata Generated

Result:
```
✅ Processing with Terminal Agent Intelligence
📄 File: contract.pdf
✨ Suggested: 2025-08-07-professional-legal-acme-consulting-agreement.pdf
📂 Category: Professional/Legal
📊 Confidence: 95%
📝 Reason: Read the PDF - identified as service agreement
```

---

## 🔄 Automation Levels

### Level 1: Manual Terminal Agent
- User manually reads files
- User manually runs terminal_agent_processor.py
- Full control, highest accuracy

### Level 2: Alerted Terminal Agent (Current)
- Watcher detects and alerts
- Terminal agent reads when alerted
- Semi-automated workflow

### Level 3: Scripted Terminal Agent (Future)
- Terminal agent script monitors alerts
- Auto-reads flagged files
- Auto-generates metadata
- Requires API access to Read tool

---

## 💻 Terminal Agent Commands Reference

### Basic Workflow
```bash
# 1. Read the file
Read ~/.rudi/workspaces/rudi-processor/inbox/document.pdf

# 2. Process with extracted info
python3 terminal_agent_processor.py --file-info '{...}'
```

### Common File Types

#### PDFs
```bash
# Read PDF
Read /path/to/document.pdf

# Extract: title, author, type, parties, dates, topics
# Process with comprehensive metadata
```

#### Images
```bash
# Read image
Read /path/to/screenshot.png

# Identify: text in image, application, purpose
# Note if it's documentation, diagram, photo, etc.
```

#### Audio/Video
```bash
# Read media file
Read /path/to/recording.mp4

# Extract: duration, participants, topics discussed
# Note meeting, presentation, tutorial, etc.
```

---

## 🎯 Best Practices for Terminal Agents

### DO:
- ✅ Always READ the file first (don't guess from filename)
- ✅ Extract as much information as possible
- ✅ Provide detailed confidence reasons
- ✅ Include key entities and dates
- ✅ Generate meaningful summaries
- ✅ Suggest accurate categories based on content

### DON'T:
- ❌ Skip reading and guess from filename
- ❌ Provide generic metadata
- ❌ Use low confidence without reason
- ❌ Ignore important details in content
- ❌ Rush through processing

---

## 📊 Terminal Agent vs Python Processing

| Aspect | Terminal Agent | Python Only |
|--------|---------------|-------------|
| PDF Reading | ✅ Full content | ❌ Can't read |
| Image Analysis | ✅ Visual understanding | ❌ No vision |
| Context Understanding | ✅ Semantic | ⚠️ Pattern-based |
| Confidence | 95%+ | 20-70% |
| Speed | Slower (manual) | Fast (automated) |
| Accuracy | Very High | Medium |

---

## 🚀 Quick Start for Terminal Agents

### When you see an alert:

1. **Note the file path**
   ```
   ⚡ ACTION REQUIRED: Terminal Agent needed for ~/.rudi/workspaces/rudi-processor/inbox/document.pdf
   ```

2. **Read the file**
   ```bash
   Read ~/.rudi/workspaces/rudi-processor/inbox/document.pdf
   ```

3. **Analyze content** - Identify:
   - What type of document?
   - Who created it?
   - What's it about?
   - What category fits?

4. **Process with metadata**
   ```bash
   python3 terminal_agent_processor.py --file-info '{
     "path": "...",
     "document_type": "identified_type",
     "suggested_category": "Category/Subcategory",
     ...
   }'
   ```

---

## 🔮 Future Automation

### Planned: Terminal Agent API Mode
```python
# Future: Automated terminal agent
class AutoTerminalAgent:
    def monitor_alerts(self):
        # Watch for files needing agent

    def read_file(self, path):
        # Use Read API

    def extract_metadata(self, content):
        # AI extraction

    def process_automatically(self):
        # Full automation
```

Until then, terminal agents provide the intelligence that pure automation cannot!

---

*Terminal agents make RUDI truly intelligent by combining human-level understanding with systematic processing.*
