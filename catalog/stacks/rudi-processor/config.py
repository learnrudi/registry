#!/usr/bin/env python3
"""
Central configuration for RUDI processor
Makes the system portable and configurable
"""

import os
import json
from pathlib import Path
from typing import Dict, Any
try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(_path):
        return False

# Load .env file if it exists
env_file = Path(__file__).parent / '.env'
if env_file.exists():
    load_dotenv(env_file)

class Config:
    """Dynamic configuration loader with environment variable support"""

    def __init__(self, config_file: str = None):
        """Initialize config from file or environment"""

        # Start with defaults
        self._config = self._get_defaults()

        # Override with config file if provided
        if config_file:
            self._load_from_file(config_file)
        else:
            # Try to load from default location
            default_config = Path(__file__).parent / "config" / "rudi-config.json"
            if default_config.exists():
                self._load_from_file(str(default_config))

        # Override with environment variables (highest priority)
        self._load_from_env()
        self._normalize_paths()

    def _get_defaults(self) -> Dict[str, Any]:
        """Get default configuration"""
        home = Path.home()
        base_path = home / ".rudi" / "workspaces" / "rudi-processor"
        index_path = base_path / "index"

        return {
            # Paths - all relative to base_path by default
            "base_path": str(base_path),
            "rudi_path": str(base_path / "inbox"),
            "index_path": str(index_path),
            "library_path": str(base_path / "library"),
            "tools_path": str(Path(__file__).resolve().parent),

            # Processing options
            "watch_interval": 5,
            "confidence_threshold": 0.7,
            "batch_size": 10,

            # Output organization options
            "output_organization": "month",  # Options: "month", "date", "year", "flat"
            "output_subdir": "stage1",  # Subdirectory under metadata/

            # File type configurations
            "supported_extensions": {
                "text": [".txt", ".md", ".log", ".csv", ".tsv"],
                "code": [".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp", ".c"],
                "structured": [".json", ".xml", ".yaml", ".yml", ".toml", ".ini"],
                "documents": [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx"],
                "images": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".heic"],
                "video": [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"],
                "audio": [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".wma"]
            },

            # Logging
            "log_level": "INFO",
            "log_dir": str(index_path / "logs")
        }

    def _load_from_env(self):
        """Load configuration from environment variables"""
        # Environment variables override defaults
        # RUDI_BASE_PATH, RUDI_PATH, RUDI_INDEX_PATH, etc.

        env_mappings = {
            "RUDI_BASE_PATH": "base_path",
            "RUDI_PATH": "rudi_path",
            "RUDI_INDEX_PATH": "index_path",
            "RUDI_TOOLS_PATH": "tools_path",
            "RUDI_WATCH_INTERVAL": ("watch_interval", int),
            "RUDI_CONFIDENCE": ("confidence_threshold", float),
            "RUDI_LOG_LEVEL": "log_level",
            "RUDI_OUTPUT_ORGANIZATION": "output_organization",
            "RUDI_OUTPUT_SUBDIR": "output_subdir"
        }

        for env_var, config_key in env_mappings.items():
            value = os.environ.get(env_var)
            if value:
                if isinstance(config_key, tuple):
                    # Type conversion needed
                    key, converter = config_key
                    self._config[key] = converter(value)
                else:
                    self._config[config_key] = value

        # If base_path changed, update relative paths
        if "RUDI_BASE_PATH" in os.environ:
            base = Path(self._config["base_path"])
            if not os.environ.get("RUDI_PATH"):
                self._config["rudi_path"] = str(base / "inbox")
            if not os.environ.get("RUDI_INDEX_PATH"):
                self._config["index_path"] = str(base / "index")

    def _load_from_file(self, config_file: str):
        """Load configuration from JSON file"""
        try:
            with open(config_file, 'r') as f:
                file_config = json.load(f)
                self._config.update(file_config)
        except Exception as e:
            print(f"Warning: Could not load config file {config_file}: {e}")

    def _normalize_paths(self):
        """Expand user/env markers in configured filesystem paths."""
        path_keys = {
            "base_path",
            "rudi_path",
            "index_path",
            "library_path",
            "tools_path",
            "log_dir",
        }

        for key in path_keys:
            value = self._config.get(key)
            if isinstance(value, str):
                self._config[key] = os.path.expandvars(os.path.expanduser(value))

    def get(self, key: str, default=None):
        """Get configuration value"""
        return self._config.get(key, default)

    def __getitem__(self, key: str):
        """Allow dict-like access"""
        return self._config[key]

    def __contains__(self, key: str):
        """Check if key exists"""
        return key in self._config

    @property
    def rudi_path(self) -> Path:
        """Get RUDI path as Path object"""
        return Path(self._config["rudi_path"])

    @property
    def index_path(self) -> Path:
        """Get Index path as Path object"""
        return Path(self._config["index_path"])

    @property
    def tools_path(self) -> Path:
        """Get tools path as Path object"""
        return Path(self._config["tools_path"])

    @property
    def log_dir(self) -> Path:
        """Get log directory as Path object"""
        return Path(self._config["log_dir"])

    def to_dict(self) -> Dict[str, Any]:
        """Export configuration as dictionary"""
        return self._config.copy()

    def save(self, filepath: str):
        """Save current configuration to file"""
        with open(filepath, 'w') as f:
            json.dump(self._config, f, indent=2)

    def print_config(self):
        """Print current configuration"""
        print("Current RUDI Configuration:")
        print("-" * 40)
        for key, value in self._config.items():
            if isinstance(value, dict):
                print(f"{key}:")
                for k, v in value.items():
                    print(f"  {k}: {v}")
            else:
                print(f"{key}: {value}")


# Global config instance
config = Config()

# For backwards compatibility
def get_config() -> Config:
    """Get global config instance"""
    return config


if __name__ == "__main__":
    # Test/display configuration
    print("RUDI Processor Configuration")
    print("=" * 50)
    config.print_config()

    print("\n" + "=" * 50)
    print("To customize, set environment variables:")
    print("  export RUDI_BASE_PATH=/path/to/your/base")
    print("  export RUDI_PATH=/path/to/RUDI")
    print("  export RUDI_INDEX_PATH=/path/to/Index")
    print("\nOr create a custom config.json file")
