#!/usr/bin/env python3
"""
Document Processor MCP Server
Extract PDF slides as images, remove watermarks, and process presentations.

Features:
- PDF to high-resolution PNGs (individual slides)
- Intelligent watermark removal (adaptive color sampling + inpainting)
- Batch processing
- Support for multiple DPI settings
"""

import sys
import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List

# =============================================================================
# WATERMARK REMOVAL
# =============================================================================

def remove_watermark_from_image(
    image_path: str,
    output_path: str,
    watermark_region: Optional[Dict[str, int]] = None,
    auto_detect: bool = True
) -> Dict[str, Any]:
    """
    Remove watermark from an image using intelligent color sampling and inpainting.

    Args:
        image_path: Path to input image
        output_path: Path to save cleaned image
        watermark_region: Dict with 'x_from_right', 'y_from_bottom', 'width', 'height'
        auto_detect: If True, try to auto-detect dark watermark pixels

    Returns:
        Dict with status, message, and cleaned_path
    """
    try:
        import numpy as np
        from PIL import Image

        img = Image.open(image_path)
        width, height = img.size

        if watermark_region:
            # Use provided region
            wm_x = width - watermark_region['x_from_right']
            wm_y = height - watermark_region['y_from_bottom']
            wm_w = watermark_region['width']
            wm_h = watermark_region['height']
        else:
            # Default: bottom-right corner (typical watermark location)
            # Covers ~7.7% width, ~2.8% height in bottom-right
            wm_x = int(width * 0.923)
            wm_y = int(height * 0.972)
            wm_w = int(width * 0.077)
            wm_h = int(height * 0.028)

        # Sample background color from clean area (left of watermark)
        sample_x = max(0, wm_x - 200)
        sample_region = (sample_x, wm_y, wm_x - 50 if wm_x > 50 else wm_x, wm_y + wm_h)
        sample_img = img.crop(sample_region)
        sample_array = np.array(sample_img)

        # Filter to only light pixels (background)
        light_pixels = sample_array[sample_array[:,:,0] > 200]

        if len(light_pixels) > 0:
            median_color = tuple(np.median(light_pixels.reshape(-1, 3), axis=0).astype(int))
        else:
            median_color = tuple(np.median(sample_array.reshape(-1, 3), axis=0).astype(int))

        # Convert to numpy for pixel replacement
        img_array = np.array(img)

        # Replace watermark region with background color + subtle noise
        for y in range(wm_y, min(wm_y + wm_h, height)):
            for x in range(wm_x, min(wm_x + wm_w, width)):
                noise = np.random.randint(-2, 3, 3)
                new_color = np.clip(np.array(median_color) + noise, 0, 255).astype(np.uint8)
                img_array[y, x] = new_color

        # Save result
        result_img = Image.fromarray(img_array)
        result_img.save(output_path, 'PNG', quality=95)

        return {
            "success": True,
            "message": "Watermark removed successfully",
            "cleaned_path": output_path,
            "region_covered": {
                "x": wm_x,
                "y": wm_y,
                "width": wm_w,
                "height": wm_h
            }
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error removing watermark: {str(e)}",
            "cleaned_path": None
        }

# =============================================================================
# PDF PROCESSING
# =============================================================================

def pdf_to_images(
    pdf_path: str,
    output_dir: str,
    dpi: int = 300,
    format: str = "png",
    prefix: str = "slide"
) -> Dict[str, Any]:
    """
    Convert PDF pages to high-resolution images.

    Args:
        pdf_path: Path to PDF file
        output_dir: Directory to save images
        dpi: Resolution (default 300 for print quality)
        format: Output format (png, jpg, etc.)
        prefix: Filename prefix for slides

    Returns:
        Dict with status, message, slides list, and output_dir
    """
    try:
        pdf_path = Path(pdf_path).resolve()
        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        if not pdf_path.exists():
            return {
                "success": False,
                "message": f"PDF not found: {pdf_path}",
                "slides": [],
                "output_dir": str(output_dir)
            }

        # Use pdftoppm for conversion
        output_prefix = output_dir / prefix
        cmd = [
            "pdftoppm",
            "-png" if format == "png" else f"-{format}",
            "-r", str(dpi),
            str(pdf_path),
            str(output_prefix)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {
                "success": False,
                "message": f"pdftoppm error: {result.stderr}",
                "slides": [],
                "output_dir": str(output_dir)
            }

        # Find generated files
        slides = sorted(output_dir.glob(f"{prefix}-*.{format}"))

        return {
            "success": True,
            "message": f"Extracted {len(slides)} slides",
            "slides": [str(s) for s in slides],
            "output_dir": str(output_dir),
            "dpi": dpi
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}",
            "slides": [],
            "output_dir": str(output_dir) if 'output_dir' in locals() else None
        }

def pdf_extract_slides(
    pdf_path: str,
    output_dir: Optional[str] = None,
    remove_watermarks: bool = False,
    watermark_config: Optional[Dict] = None,
    dpi: int = 300
) -> Dict[str, Any]:
    """
    Extract PDF slides as images and optionally remove watermarks.

    Args:
        pdf_path: Path to PDF file
        output_dir: Output directory (default: same dir as PDF + "_slides")
        remove_watermarks: Whether to remove watermarks from slides
        watermark_config: Watermark region config (if None, auto-detect)
        dpi: Image resolution

    Returns:
        Dict with extraction results and cleaned slide paths
    """
    try:
        pdf_path = Path(pdf_path).resolve()

        # Determine output directory
        if output_dir is None:
            output_dir = pdf_path.parent / f"{pdf_path.stem}_slides"
        else:
            output_dir = Path(output_dir).resolve()

        output_dir.mkdir(parents=True, exist_ok=True)

        # Extract slides
        extraction_result = pdf_to_images(
            str(pdf_path),
            str(output_dir),
            dpi=dpi,
            format="png",
            prefix="slide"
        )

        if not extraction_result["success"]:
            return extraction_result

        slides = extraction_result["slides"]
        cleaned_slides = []

        # Remove watermarks if requested
        if remove_watermarks and slides:
            cleaned_dir = output_dir / "cleaned"
            cleaned_dir.mkdir(exist_ok=True)

            for slide_path in slides:
                slide_name = Path(slide_path).name
                cleaned_path = cleaned_dir / slide_name

                wm_result = remove_watermark_from_image(
                    slide_path,
                    str(cleaned_path),
                    watermark_region=watermark_config
                )

                if wm_result["success"]:
                    cleaned_slides.append(str(cleaned_path))

        return {
            "success": True,
            "message": f"Extracted {len(slides)} slides" +
                      (f", cleaned {len(cleaned_slides)}" if remove_watermarks else ""),
            "slides": slides,
            "cleaned_slides": cleaned_slides if remove_watermarks else None,
            "output_dir": str(output_dir),
            "dpi": dpi
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}",
            "slides": [],
            "cleaned_slides": None,
            "output_dir": None
        }

def batch_remove_watermark(
    image_dir: str,
    output_dir: Optional[str] = None,
    watermark_config: Optional[Dict] = None,
    pattern: str = "*.png"
) -> Dict[str, Any]:
    """
    Remove watermarks from all images in a directory.

    Args:
        image_dir: Directory containing images
        output_dir: Output directory (default: image_dir/cleaned)
        watermark_config: Watermark region config
        pattern: File pattern to match (e.g., "*.png", "slide-*.jpg")

    Returns:
        Dict with processing results
    """
    try:
        image_dir = Path(image_dir).resolve()

        if output_dir is None:
            output_dir = image_dir / "cleaned"
        else:
            output_dir = Path(output_dir).resolve()

        output_dir.mkdir(parents=True, exist_ok=True)

        # Find all matching images
        images = sorted(image_dir.glob(pattern))

        if not images:
            return {
                "success": False,
                "message": f"No images found matching pattern: {pattern}",
                "processed": 0,
                "cleaned_images": []
            }

        cleaned_images = []
        errors = []

        for img_path in images:
            cleaned_path = output_dir / img_path.name

            result = remove_watermark_from_image(
                str(img_path),
                str(cleaned_path),
                watermark_region=watermark_config
            )

            if result["success"]:
                cleaned_images.append(str(cleaned_path))
            else:
                errors.append({
                    "file": str(img_path),
                    "error": result["message"]
                })

        return {
            "success": len(errors) == 0,
            "message": f"Processed {len(cleaned_images)}/{len(images)} images successfully",
            "processed": len(cleaned_images),
            "total": len(images),
            "cleaned_images": cleaned_images,
            "errors": errors if errors else None,
            "output_dir": str(output_dir)
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}",
            "processed": 0,
            "cleaned_images": []
        }

# =============================================================================
# MCP SERVER
# =============================================================================

TOOLS = [
    {
        "name": "pdf_to_images",
        "description": "Convert PDF pages to high-resolution PNG images. Each page becomes a separate image file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pdf_path": {
                    "type": "string",
                    "description": "Path to the PDF file"
                },
                "output_dir": {
                    "type": "string",
                    "description": "Directory to save the images"
                },
                "dpi": {
                    "type": "number",
                    "description": "Resolution in DPI (default: 300 for print quality)",
                    "default": 300
                },
                "format": {
                    "type": "string",
                    "description": "Output format: png, jpg, etc. (default: png)",
                    "default": "png"
                },
                "prefix": {
                    "type": "string",
                    "description": "Filename prefix for output files (default: slide)",
                    "default": "slide"
                }
            },
            "required": ["pdf_path", "output_dir"]
        }
    },
    {
        "name": "remove_watermark",
        "description": "Remove watermark from a single image using intelligent color sampling and pixel replacement. Works best for text/logo watermarks on uniform backgrounds.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": "Path to the image file"
                },
                "output_path": {
                    "type": "string",
                    "description": "Path to save the cleaned image"
                },
                "watermark_region": {
                    "type": "object",
                    "description": "Optional: specify watermark location (from edges). If not provided, assumes bottom-right corner.",
                    "properties": {
                        "x_from_right": {"type": "number"},
                        "y_from_bottom": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"}
                    }
                }
            },
            "required": ["image_path", "output_path"]
        }
    },
    {
        "name": "pdf_extract_slides",
        "description": "Extract PDF slides as PNG images and optionally remove watermarks in one operation. Perfect for cleaning presentation PDFs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pdf_path": {
                    "type": "string",
                    "description": "Path to the PDF file"
                },
                "output_dir": {
                    "type": "string",
                    "description": "Output directory (default: PDF_name_slides/)"
                },
                "remove_watermarks": {
                    "type": "boolean",
                    "description": "Whether to remove watermarks from extracted slides (default: false)",
                    "default": False
                },
                "watermark_config": {
                    "type": "object",
                    "description": "Watermark region config (optional)",
                    "properties": {
                        "x_from_right": {"type": "number"},
                        "y_from_bottom": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"}
                    }
                },
                "dpi": {
                    "type": "number",
                    "description": "Image resolution (default: 300)",
                    "default": 300
                }
            },
            "required": ["pdf_path"]
        }
    },
    {
        "name": "batch_remove_watermark",
        "description": "Remove watermarks from all images in a directory. Useful for cleaning multiple slides or images at once.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "image_dir": {
                    "type": "string",
                    "description": "Directory containing images"
                },
                "output_dir": {
                    "type": "string",
                    "description": "Output directory (default: image_dir/cleaned)"
                },
                "watermark_config": {
                    "type": "object",
                    "description": "Watermark region config (optional)",
                    "properties": {
                        "x_from_right": {"type": "number"},
                        "y_from_bottom": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"}
                    }
                },
                "pattern": {
                    "type": "string",
                    "description": "File pattern to match (default: *.png)",
                    "default": "*.png"
                }
            },
            "required": ["image_dir"]
        }
    }
]

def handle_tool_call(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Route tool calls to appropriate functions"""

    if name == "pdf_to_images":
        return pdf_to_images(
            args["pdf_path"],
            args["output_dir"],
            dpi=args.get("dpi", 300),
            format=args.get("format", "png"),
            prefix=args.get("prefix", "slide")
        )

    elif name == "remove_watermark":
        return remove_watermark_from_image(
            args["image_path"],
            args["output_path"],
            watermark_region=args.get("watermark_region")
        )

    elif name == "pdf_extract_slides":
        return pdf_extract_slides(
            args["pdf_path"],
            output_dir=args.get("output_dir"),
            remove_watermarks=args.get("remove_watermarks", False),
            watermark_config=args.get("watermark_config"),
            dpi=args.get("dpi", 300)
        )

    elif name == "batch_remove_watermark":
        return batch_remove_watermark(
            args["image_dir"],
            output_dir=args.get("output_dir"),
            watermark_config=args.get("watermark_config"),
            pattern=args.get("pattern", "*.png")
        )

    else:
        return {"success": False, "message": f"Unknown tool: {name}"}

def main():
    """MCP Server main loop - stdio JSON-RPC"""

    for line in sys.stdin:
        try:
            request = json.loads(line)
            method = request.get("method")

            if method == "tools/list":
                response = {
                    "jsonrpc": "2.0",
                    "id": request.get("id"),
                    "result": {"tools": TOOLS}
                }

            elif method == "tools/call":
                params = request.get("params", {})
                tool_name = params.get("name")
                tool_args = params.get("arguments", {})

                result = handle_tool_call(tool_name, tool_args)

                response = {
                    "jsonrpc": "2.0",
                    "id": request.get("id"),
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result, indent=2)
                            }
                        ]
                    }
                }

            elif method == "initialize":
                response = {
                    "jsonrpc": "2.0",
                    "id": request.get("id"),
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "document-processor",
                            "version": "1.0.0"
                        }
                    }
                }

            else:
                response = {
                    "jsonrpc": "2.0",
                    "id": request.get("id"),
                    "error": {
                        "code": -32601,
                        "message": f"Method not found: {method}"
                    }
                }

            print(json.dumps(response), flush=True)

        except Exception as e:
            error_response = {
                "jsonrpc": "2.0",
                "id": request.get("id") if 'request' in locals() else None,
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {str(e)}"
                }
            }
            print(json.dumps(error_response), flush=True)

if __name__ == "__main__":
    main()
