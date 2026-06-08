#!/usr/bin/env python3
"""
PDF Extractor - Extracts text and metadata from PDF files
"""

from .base_extractor import BaseExtractor
from typing import Dict, Any

# Try to import PDF libraries
try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False


class PDFExtractor(BaseExtractor):
    """Extract content from PDF files"""

    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text and metadata from PDF"""

        if not (HAS_PYPDF2 or HAS_PDFPLUMBER):
            metadata['processing_status']['errors'].append("No PDF library available (install PyPDF2 or pdfplumber)")
            metadata['extracted_content']['full_text'] = None
            return metadata

        try:
            if HAS_PDFPLUMBER:
                # Prefer pdfplumber for better text extraction
                import pdfplumber

                full_text = []
                with pdfplumber.open(file_path) as pdf:
                    metadata['extracted_content']['page_count'] = len(pdf.pages)

                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            full_text.append(text)

                        # Check for images on first page
                        if page.page_number == 1:
                            images = page.images
                            metadata['extracted_content']['has_images'] = len(images) > 0 if images else False

                    # Get metadata if available
                    if pdf.metadata:
                        metadata['extracted_content']['pdf_metadata'] = {
                            'title': pdf.metadata.get('Title'),
                            'author': pdf.metadata.get('Author'),
                            'subject': pdf.metadata.get('Subject'),
                            'creator': pdf.metadata.get('Creator'),
                            'producer': pdf.metadata.get('Producer'),
                            'creation_date': str(pdf.metadata.get('CreationDate')) if pdf.metadata.get('CreationDate') else None
                        }

                metadata['extracted_content']['full_text'] = '\n\n'.join(full_text)

            elif HAS_PYPDF2:
                # Fallback to PyPDF2
                import PyPDF2

                full_text = []
                with open(file_path, 'rb') as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    metadata['extracted_content']['page_count'] = len(pdf_reader.pages)

                    for page in pdf_reader.pages:
                        text = page.extract_text()
                        if text:
                            full_text.append(text)

                    # Get metadata
                    if pdf_reader.metadata:
                        metadata['extracted_content']['pdf_metadata'] = {
                            'title': pdf_reader.metadata.get('/Title'),
                            'author': pdf_reader.metadata.get('/Author'),
                            'subject': pdf_reader.metadata.get('/Subject'),
                            'creator': pdf_reader.metadata.get('/Creator'),
                            'producer': pdf_reader.metadata.get('/Producer')
                        }

                metadata['extracted_content']['full_text'] = '\n\n'.join(full_text)

            # Calculate text statistics
            if metadata['extracted_content']['full_text']:
                text = metadata['extracted_content']['full_text']
                metadata['extracted_content']['word_count'] = len(text.split())
                metadata['extracted_content']['char_count'] = len(text)

        except Exception as e:
            metadata['processing_status']['errors'].append(f"PDF extraction error: {str(e)}")
            metadata['extracted_content']['full_text'] = None

        return metadata
