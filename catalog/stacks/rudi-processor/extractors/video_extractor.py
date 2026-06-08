#!/usr/bin/env python3
"""
Video Extractor - Extracts metadata from video files
Transcript would need to be generated separately
"""

from .base_extractor import BaseExtractor
from typing import Dict, Any
import subprocess
import json

# Try to import video libraries
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


class VideoExtractor(BaseExtractor):
    """Extract metadata from video files"""

    def extract(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract video metadata using ffprobe or opencv"""

        # Try ffprobe first (more reliable if available)
        ffprobe_data = self.extract_with_ffprobe(file_path)
        if ffprobe_data:
            metadata['extracted_content'].update(ffprobe_data)
        elif HAS_CV2:
            # Fallback to OpenCV
            opencv_data = self.extract_with_opencv(file_path)
            metadata['extracted_content'].update(opencv_data)
        else:
            metadata['processing_status']['errors'].append("No video processing tools available (install ffmpeg or opencv-python)")

        # Note: transcript remains None - would need speech-to-text processing
        metadata['extracted_content']['transcript'] = None
        metadata['extracted_content']['needs_transcription'] = True
        metadata['extracted_content']['has_audio'] = metadata['extracted_content'].get('audio_codec') is not None

        return metadata

    def extract_with_ffprobe(self, file_path: str) -> Dict[str, Any]:
        """Use ffprobe to extract video metadata"""
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

                    # Extract tags if available
                    if 'tags' in fmt:
                        extracted['video_tags'] = fmt['tags']

                # Extract stream info
                for stream in data.get('streams', []):
                    if stream['codec_type'] == 'video':
                        extracted['dimensions'] = {
                            'width': stream.get('width'),
                            'height': stream.get('height')
                        }
                        extracted['video_codec'] = stream.get('codec_name')
                        extracted['frame_rate'] = eval(stream.get('r_frame_rate', '0/1'))
                        extracted['total_frames'] = int(stream.get('nb_frames', 0))

                    elif stream['codec_type'] == 'audio':
                        extracted['audio_codec'] = stream.get('codec_name')
                        extracted['audio_channels'] = stream.get('channels')
                        extracted['audio_sample_rate'] = stream.get('sample_rate')

                return extracted

        except Exception as e:
            # ffprobe not available or failed
            return None

        return None

    def extract_with_opencv(self, file_path: str) -> Dict[str, Any]:
        """Use OpenCV as fallback for video metadata"""
        try:
            import cv2

            cap = cv2.VideoCapture(file_path)

            extracted = {}

            # Get video properties
            extracted['dimensions'] = {
                'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            }
            extracted['frame_rate'] = cap.get(cv2.CAP_PROP_FPS)
            extracted['total_frames'] = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # Calculate duration
            if extracted['frame_rate'] > 0:
                extracted['duration_seconds'] = extracted['total_frames'] / extracted['frame_rate']

            cap.release()

            return extracted

        except Exception as e:
            return {
                'error': f"OpenCV extraction failed: {str(e)}"
            }
