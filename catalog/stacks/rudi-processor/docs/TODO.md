# RUDI Processor - TODO & Roadmap

## 🎯 Current Sprint (Week 1)

### Core Functionality
- [x] Basic file processor
- [x] Metadata extraction
- [x] Duplicate detection
- [x] Search functionality
- [x] Documentation (READMEs)
- [x] Development log
- [ ] Test with 20+ diverse files
- [ ] Add PDF text extraction
- [ ] Add error handling for corrupted files

### Testing
- [ ] Process different file types
  - [ ] PDFs
  - [ ] Images (jpg, png)
  - [ ] Code files (.py, .js)
  - [ ] Audio files (.mp3)
  - [ ] Video files (.mp4)
- [ ] Handle edge cases
  - [ ] Empty files
  - [ ] Very large files (>100MB)
  - [ ] Files with special characters
  - [ ] Non-UTF8 encoded files

---

## 📋 Backlog (Prioritized)

### Phase 1: Enhanced Processing (Week 2)
- [ ] **Content Extractors**
  - [ ] PDF text extraction (PyPDF2)
  - [ ] DOCX extraction (python-docx)
  - [ ] Image metadata (EXIF data)
  - [ ] Audio/Video metadata (duration, codec)
  - [ ] Code file analysis (functions, classes)

- [ ] **Improved Metadata**
  - [ ] Word count for text
  - [ ] Language detection
  - [ ] Reading time estimate
  - [ ] Key phrase extraction

### Phase 2: AI Integration (Week 3)
- [ ] **Classification System**
  - [ ] OpenAI/Anthropic integration
  - [ ] Auto-categorization prompts
  - [ ] Confidence scores
  - [ ] Custom taxonomy rules

- [ ] **Semantic Tagging**
  - [ ] Generate tags from content
  - [ ] Extract entities (people, places, topics)
  - [ ] Identify relationships between files
  - [ ] Create summaries

### Phase 3: Embeddings & Search (Week 4)
- [ ] **Vector Embeddings**
  - [ ] Generate embeddings (OpenAI text-embedding-3)
  - [ ] Store in vector DB (Chroma/Supabase)
  - [ ] Batch processing for efficiency
  - [ ] Update embeddings on file changes

- [ ] **Semantic Search**
  - [ ] Natural language queries
  - [ ] Similarity search
  - [ ] Ranked results
  - [ ] Search filters (date, type, size)

### Phase 4: Automation (Week 5)
- [ ] **File Watcher**
  - [ ] Monitor RUDI directory
  - [ ] Auto-process new files
  - [ ] Queue system for batch processing
  - [ ] Processing status notifications

- [ ] **File Organization**
  - [ ] Auto-move to Library folders
  - [ ] Create folder structure based on classification
  - [ ] Maintain source references
  - [ ] Undo/rollback capability

### Phase 5: User Interface (Week 6)
- [ ] **Web Dashboard**
  - [ ] File upload interface
  - [ ] Search interface
  - [ ] Browse by category
  - [ ] Visualization of connections

- [ ] **Custom UIs**
  - [ ] YouTube content manager
  - [ ] Writing workspace
  - [ ] Code snippet library
  - [ ] Research hub

---

## 🚀 Future Vision

### Advanced Features
- [ ] **Multi-modal Search**
  - [ ] Search images by description
  - [ ] Find files by drawing/sketch
  - [ ] Voice search

- [ ] **AI Assistant**
  - [ ] Chat with your documents
  - [ ] Generate reports from multiple files
  - [ ] Answer questions about your content

- [ ] **Collaboration**
  - [ ] Share indexed collections
  - [ ] Collaborative tagging
  - [ ] Version control integration

- [ ] **Cloud Sync**
  - [ ] Backup to cloud storage
  - [ ] Cross-device sync
  - [ ] Web access to index

---

## 🐛 Bugs & Issues

### Known Issues
- [ ] Manifest can have duplicates if processing interrupted
- [ ] Large files (>10MB) slow down processing
- [ ] Special characters in filenames need escaping

### Reported Bugs
- (None yet)

---

## 💡 Ideas Parking Lot

- Voice memo transcription
- OCR for scanned documents
- Automatic backup scheduling
- Integration with Obsidian/Notion
- Email attachment processing
- Browser bookmark importing
- Social media content archiving
- Git repository indexing
- Calendar event extraction
- Contact information parsing

---

## 📊 Success Metrics

### Phase 1 Complete When:
- [ ] 100+ files processed successfully
- [ ] Search returns relevant results 90% of time
- [ ] Processing time <1 second per text file

### Phase 2 Complete When:
- [ ] AI classification accuracy >80%
- [ ] Meaningful tags generated for all content
- [ ] Categories align with user's mental model

### Phase 3 Complete When:
- [ ] Semantic search working
- [ ] Can find files by concept, not just keywords
- [ ] Search time <500ms

---

## 📝 Notes

### Design Principles
1. **Local-first** - User owns their data
2. **Transparent** - User can see/edit all metadata
3. **Non-destructive** - Never modify original files
4. **Incremental** - Each phase adds value
5. **Extensible** - Easy to add new processors

### Technical Decisions
- Python for processing (familiar, good libraries)
- JSON for metadata (human-readable, portable)
- File-based storage (simple, no database needed)
- SHA256 for dedup (reliable, fast enough)
- Manual trigger initially (user control)

---

Last Updated: 2025-08-07
