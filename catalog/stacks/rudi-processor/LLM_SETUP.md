# 🤖 LLM Setup Guide for Stage 2 Processing

This guide will help you configure multiple LLM providers for Stage 2 processing in RUDI.

## 📋 Table of Contents
- [Quick Start](#-quick-start)
- [Provider Setup](#-provider-setup)
- [Configuration](#-configuration)
- [Testing](#-testing)
- [Usage Examples](#-usage-examples)
- [Troubleshooting](#-troubleshooting)

## 🚀 Quick Start

### 1. Install Required Packages
```bash
pip3 install anthropic openai google-generativeai
```

### 2. Set API Keys
```bash
# Add to ~/.zshrc or ~/.bashrc for persistence
export ANTHROPIC_API_KEY='your-anthropic-key'
export OPENAI_API_KEY='your-openai-key'
export GOOGLE_API_KEY='your-google-key'
export DEEPSEEK_API_KEY='your-deepseek-key'
```

### 3. Test Configuration
```bash
python3 examples/test_llm_providers.py
```

### 4. Process Files
```bash
# Process single Stage 1 file
python3 stage2_processor.py /path/to/file.stage1.json

# Batch process all Stage 1 files
python3 stage2_processor.py --batch

# Process with specific provider
python3 stage2_processor.py --provider openai file.stage1.json
```

## 🔑 Provider Setup

### Anthropic (Claude)
1. Visit https://console.anthropic.com/
2. Navigate to API Keys section
3. Create new API key
4. Set environment variable:
   ```bash
   export ANTHROPIC_API_KEY='YOUR_ANTHROPIC_API_KEY'
   ```

**Models Available:**
- `claude-3-5-sonnet` - Most capable, best for complex analysis
- `claude-3-5-haiku` - Fast and efficient, good for quick categorization

### OpenAI (GPT)
1. Visit https://platform.openai.com/api-keys
2. Create new secret key
3. Set environment variable:
   ```bash
   export OPENAI_API_KEY='YOUR_OPENAI_API_KEY'
   ```

**Models Available:**
- `gpt-4o` - Advanced reasoning, best for summaries
- `gpt-4o-mini` - Cost-effective, good for classification

### Google (Gemini)
1. Visit https://makersuite.google.com/app/apikey
2. Create API key
3. Set environment variable:
   ```bash
   export GOOGLE_API_KEY='YOUR_GOOGLE_API_KEY'
   ```

**Models Available:**
- `gemini-2.0-flash` - Latest model, excellent for long documents
- `gemini-1.5-flash` - Fast and reliable

### DeepSeek
1. Visit https://platform.deepseek.com/
2. Generate API key
3. Set environment variable:
   ```bash
   export DEEPSEEK_API_KEY='sk-...'
   ```

**Models Available:**
- `deepseek-chat` - General purpose, good for technical content
- `deepseek-coder` - Specialized for code analysis

## ⚙️ Configuration

### LLM Configuration File
Edit `config/llm-config.json` to customize:

```json
{
  "providers": {
    "anthropic": {
      "enabled": true,
      "default_model": "claude-3-5-haiku",
      "models": {
        "claude-3-5-haiku": {
          "temperature": 0.3,
          "max_tokens": 4096
        }
      }
    }
  },
  "stage2_settings": {
    "primary_provider": "anthropic",
    "fallback_providers": ["openai", "google"],
    "cache_responses": true,
    "cache_ttl_hours": 24
  }
}
```

### Provider Priority
1. **Primary Provider**: First choice for all processing
2. **Fallback Providers**: Used if primary fails
3. **Auto-fallback**: Automatically tries next provider on error

### Caching
- Responses are cached for 24 hours by default
- Cache stored in: `~/.rudi/workspaces/rudi-processor/index/llm_cache/`
- Disable caching: Set `"cache_responses": false`

## 🧪 Testing

### Test Provider Configuration
```bash
# Check which providers are available
python3 stage2_processor.py --list-providers

# Test all providers
python3 examples/test_llm_providers.py
```

### Test with Sample File
```bash
# Process a test file
echo '{"extracted_content": {"full_text": "Test document"}}' > test.stage1.json
python3 stage2_processor.py test.stage1.json
```

## 📚 Usage Examples

### Basic Processing
```bash
# Process single file
python3 stage2_processor.py metadata/stage1/document.stage1.json

# Process directory
python3 stage2_processor.py metadata/stage1/2025-08/

# Batch process with limit
python3 stage2_processor.py --batch --limit 10
```

### Python Integration
```python
from stage2_processor import Stage2Processor

# Initialize processor
processor = Stage2Processor()

# Check available providers
providers = processor.get_available_providers()
print(f"Available: {providers}")

# Process metadata
metadata = {
    'original_name': 'document.pdf',
    'extracted_content': {
        'full_text': 'Document content here...'
    }
}

# Process with automatic provider selection
result = processor.process_metadata(metadata)

# Process with specific provider
result = processor.process_with_provider(metadata, 'openai')
```

## 🔍 Output Structure

Stage 2 enhanced metadata includes:

```json
{
  "original_name": "document.pdf",
  "extracted_content": { ... },
  "llm_enhanced": {
    "provider": "anthropic",
    "timestamp": "2025-08-07T15:30:00",
    "categorization": {
      "category": "technical",
      "subcategory": "ai_research",
      "confidence": 0.92
    },
    "summary": {
      "overview": "Document about AI applications...",
      "key_points": ["Point 1", "Point 2"],
      "purpose": "Research documentation"
    },
    "entities": {
      "people": ["John Doe"],
      "organizations": ["Research Dept"],
      "dates": ["2025-01-15"],
      "locations": [],
      "technical_terms": ["AI", "NLP", "ML"]
    },
    "topics": {
      "primary_topics": ["artificial intelligence", "machine learning"],
      "keywords": ["AI", "ML", "NLP", "computer vision"]
    }
  },
  "processing_status": {
    "python_processed": true,
    "llm_processed": true,
    "stage": "completed",
    "llm_provider": "anthropic"
  }
}
```

## ❗ Troubleshooting

### No Providers Available
```bash
# Check environment variables
env | grep API_KEY

# Source your shell config
source ~/.zshrc  # or ~/.bashrc
```

### Rate Limiting
- Add delays between requests
- Use `--limit` flag for batch processing
- Consider upgrading API tier

### Package Installation Issues
```bash
# Update pip
pip3 install --upgrade pip

# Install with specific versions
pip3 install anthropic==0.39.0
pip3 install openai==1.55.0
pip3 install google-generativeai==0.8.3
```

### API Errors
- Check API key validity
- Verify account has credits/quota
- Check provider status pages
- Review rate limits

## 📊 Cost Optimization

### Tips for Managing Costs
1. **Use appropriate models**: Haiku/Mini for simple tasks
2. **Enable caching**: Avoid reprocessing same content
3. **Set token limits**: Configure max_tokens appropriately
4. **Batch processing**: Process multiple files efficiently
5. **Monitor usage**: Track API usage regularly

### Model Selection Guide
| Task | Recommended Model | Provider |
|------|-------------------|----------|
| Quick categorization | claude-3-5-haiku | Anthropic |
| Complex analysis | claude-3-5-sonnet | Anthropic |
| Cost-effective | gpt-4o-mini | OpenAI |
| Long documents | gemini-2.0-flash | Google |
| Code analysis | deepseek-coder | DeepSeek |

## 🔗 Resources

- [Anthropic Documentation](https://docs.anthropic.com/)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Google AI Documentation](https://ai.google.dev/docs)
- [DeepSeek API Docs](https://platform.deepseek.com/docs)

## 📝 Next Steps

1. Configure at least one provider
2. Test with `examples/test_llm_providers.py`
3. Process a sample file
4. Review enhanced metadata output
5. Adjust prompts in `config/llm-config.json` as needed

---

For more information, see the main [README.md](README.md)
