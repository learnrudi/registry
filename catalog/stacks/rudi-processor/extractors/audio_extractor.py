#!/usr/bin/env python3
"""
Audio Extractor - Extracts metadata from audio files
Transcript would need speech-to-text processing
"""

from .base_extractor import BaseExtractor
from typing import Dict, Any
import subprocess
import json

# Try to import audio libraries
try:
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False


class AudioExtractor(BaseExtractor):
    """Extract metadata from audio files"""

    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract audio metadata using mutagen or ffprobe"""

        # Try mutagen first (better for metadata tags)
        if HAS_MUTAGEN:
            mutagen_data = self.extract_with_mutagen(file_path)
            if mutagen_data:
                metadata['extracted_content'].update(mutagen_data)

        # Try ffprobe for additional technical data
        ffprobe_data = self.extract_with_ffprobe(file_path)
        if ffprobe_data:
            # Merge ffprobe data, don't overwrite existing
            for key, value in ffprobe_data.items():
                if key not in metadata['extracted_content'] or metadata['extracted_content'][key] is None:
                    metadata['extracted_content'][key] = value

        if not (HAS_MUTAGEN or ffprobe_data):
            metadata['processing_status']['errors'].append("No audio processing tools available (install mutagen or ffmpeg)")

        # Note: transcript remains None - would need speech-to-text
        metadata['extracted_content']['transcript'] = None
        metadata['extracted_content']['needs_transcription'] = True

        return metadata

    def extract_with_mutagen(self, file_path: str) -> Dict[str, Any]:
        """Use mutagen to extract audio metadata and tags"""
        try:
            from mutagen import File as MutagenFile

            audio = MutagenFile(file_path)
            if audio is None:
                return None

            extracted = {}

            # Get basic audio info
            if hasattr(audio.info, 'length'):
                extracted['duration_seconds'] = audio.info.length
            if hasattr(audio.info, 'bitrate'):
                extracted['bitrate'] = audio.info.bitrate
            if hasattr(audio.info, 'sample_rate'):
                extracted['sample_rate'] = audio.info.sample_rate
            if hasattr(audio.info, 'channels'):
                extracted['channels'] = audio.info.channels

            # Extract tags
            tags = {}
            if audio.tags:
                # Common tag mappings
                tag_mapping = {
                    'title': ['TIT2', 'Title', '\xa9nam'],
                    'artist': ['TPE1', 'Artist', '\xa9ART'],
                    'album': ['TALB', 'Album', '\xa9alb'],
                    'date': ['TDRC', 'Date', '\xa9day'],
                    'genre': ['TCON', 'Genre', '\xa9gen'],
                    'track': ['TRCK', 'TrackNumber'],
                    'albumartist': ['TPE2', 'AlbumArtist'],
                    'comment': ['COMM', 'Comment', '\xa9cmt']
                }

                for tag_name, possible_keys in tag_mapping.items():
                    for key in possible_keys:
                        if key in audio.tags:
                            value = audio.tags[key]
                            # Convert to string if it's a list
                            if isinstance(value, list) and len(value) > 0:
                                value = str(value[0])
                            tags[tag_name] = str(value)
                            break

            if tags:
                extracted['audio_tags'] = tags

                # Create a searchable text from tags
                tag_text = ' '.join([f"{k}: {v}" for k, v in tags.items()])
                extracted['tag_text'] = tag_text

            return extracted

        except Exception as e:
            return None

    def extract_with_ffprobe(self, file_path: str) -> Dict[str, Any]:
        """Use ffprobe to extract audio metadata"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                data = json.loads(result.stdout)

                extracted = {}

                # Extract format info
                if 'format' in data:
                    fmt = data['format']
                    extracted['duration_seconds'] = float(fmt.get('duration', 0))
                    extracted['bitrate'] = int(fmt.get('bit_rate', 0))
                    extracted['format_name'] = fmt.get('format_name')

                # Extract stream info
                for stream in data.get('streams', []):
                    if stream['codec_type'] == 'audio':
                        extracted['audio_codec'] = stream.get('codec_name')
                        extracted['channels'] = stream.get('channels')
                        extracted['sample_rate'] = int(stream.get('sample_rate', 0))
                        extracted['bit_depth'] = stream.get('bits_per_sample')

                return extracted

        except Exception:
            return None

        return None
