# Making RUDI Processor Portable & Dynamic

The system now supports multiple deployment options for maximum flexibility.

## 🎯 Current Improvements

### 1. **Dynamic Configuration System** (`config.py`)
- Centralized configuration management
- Environment variable support
- JSON config file support
- No more hardcoded paths

### 2. **Configuration Priority** (highest to lowest)
1. Command-line arguments
2. Environment variables
3. Config file (`config/rudi-config.json`)
4. Default values

## 🚀 Deployment Options

### Option 1: Environment Variables
```bash
# Set custom paths
export RUDI_BASE_PATH="/Users/jane/Documents"
export RUDI_PATH="/Users/jane/Dropbox/RUDI"
export RUDI_INDEX_PATH="/Users/jane/Dropbox/Index"

# Run the processor
python3 metadata_processor.py
```

### Option 2: Config File
Create `config/custom-config.json`:
```json
{
  "base_path": "/media/usb/portable",
  "rudi_path": "/media/usb/portable/RUDI",
  "index_path": "/media/usb/portable/Index"
}
```

Run with:
```bash
python3 metadata_processor.py --config config/custom-config.json
```

### Option 3: Docker (Fully Portable)
```bash
# Build the image
docker build -t rudi-processor .

# Run with volume mapping
docker run -v /path/to/RUDI:/data/RUDI \
           -v /path/to/Index:/data/Index \
           rudi-processor

# Or use docker-compose
RUDI_DIR=/path/to/RUDI INDEX_DIR=/path/to/Index docker-compose up
```

### Option 4: Python Package Installation
```bash
# Install as package
pip install -e .

# Run from anywhere
rudi-watch
rudi-process /path/to/file.pdf
rudi-audit
```

### Option 5: Portable USB/External Drive
1. Copy entire `rudi-processor` folder to USB
2. Create `.env` file on USB:
   ```
   RUDI_BASE_PATH=.
   ```
3. Run from USB:
   ```bash
   cd /Volumes/USB/rudi-processor
   python3 metadata_processor.py
   ```

## 📝 Updating Existing Code

To use the dynamic config in existing tools:

```python
# Old way (hardcoded)
self.rudi_path = Path("~/.rudi/workspaces/rudi-processor/inbox")

# New way (dynamic)
from config import config
self.rudi_path = config.rudi_path
```

## 🔧 Configuration Methods

### Method 1: Using Config Class
```python
from config import Config

# Load custom config
cfg = Config("path/to/config.json")

# Access paths
rudi_path = cfg.rudi_path
index_path = cfg.index_path
```

### Method 2: Environment Variables
```python
import os
rudi_path = os.environ.get('RUDI_PATH', default_path)
```

### Method 3: Command Line Arguments
```python
import argparse
parser.add_argument('--rudi-path', default=config.rudi_path)
```

## 🌍 Cross-Platform Support

The system now works on:
- **macOS**: `~/.rudi/workspaces/rudi-processor/`
- **Linux**: `/home/name/Documents/`
- **Windows**: `C:\Users\name\Documents\`
- **Cloud**: Google Drive, Dropbox, OneDrive
- **Network**: NAS, shared drives
- **Containers**: Docker, Kubernetes

## 📦 Distribution Options

### Standalone Executable (future)
```bash
# Create standalone app with PyInstaller
pyinstaller --onefile rudi_processor.spec

# Run anywhere
./rudi_processor
```

### Web Service (future)
```python
# Flask/FastAPI wrapper
from flask import Flask
app = Flask(__name__)

@app.route('/process', methods=['POST'])
def process_file():
    # Web API for processing
```

## 🔄 Migration Path

For existing installations:

1. **Keep working as-is** - No changes needed
2. **Add flexibility** - Set environment variables
3. **Go portable** - Use Docker or package install
4. **Scale up** - Deploy to cloud/cluster

## 🎁 Benefits

- **Portable**: Run from USB, cloud, or any location
- **Flexible**: Configure without code changes
- **Scalable**: From laptop to cloud deployment
- **Maintainable**: Single source of configuration
- **Testable**: Easy to test different configs
- **Shareable**: Others can use with their paths

## 🚦 Quick Start for New Location

```bash
# 1. Clone/copy the processor
git clone <repo> /new/location/rudi-processor

# 2. Set your paths
export RUDI_BASE_PATH="/new/location"

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run
python3 metadata_processor.py

# That's it! No code changes needed.
```
