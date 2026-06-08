#!/usr/bin/env python3
"""
Setup script for RUDI Processor
Makes the system installable and portable
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="rudi-processor",
    version="2.0.0",
    author="RUDI System",
    description="Responsible Use of Digital Intelligence - File Processing System",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    python_requires=">=3.7",
    install_requires=[
        "PyPDF2>=3.0.0",
        "pdfplumber>=0.11.0",
        "python-docx>=1.0.0",
        "openpyxl>=3.1.0",
        "pillow>=10.0.0",
        "pytesseract>=0.3.0",
        "mutagen>=1.47.0",
        "opencv-python-headless>=4.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=22.0.0",
            "flake8>=5.0.0",
        ],
        "ml": [
            "torch>=2.0.0",
            "transformers>=4.30.0",
            "sentence-transformers>=2.2.0",
        ]
    },
    entry_points={
        "console_scripts": [
            "rudi-watch=tools.rudi_watcher:main",
            "rudi-process=metadata_processor:main",
            "rudi-audit=tools.rudi_audit:main",
            "rudi-config=config:main",
        ],
    },
    package_data={
        "": ["config/*.json", "*.md"],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
