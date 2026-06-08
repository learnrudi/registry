from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


ROOT = Path(__file__).resolve().parents[1]


class VideoGeneratorMcpStdioTest(unittest.IsolatedAsyncioTestCase):
    async def test_list_tools_and_list_video_models_over_stdio(self) -> None:
        params = StdioServerParameters(
            command=sys.executable,
            args=["src/server.py"],
            cwd=ROOT,
        )

        with open(os.devnull, "w", encoding="utf-8") as errlog:
            async with stdio_client(params, errlog=errlog) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()

                    tools = await session.list_tools()
                    tool_names = {tool.name for tool in tools.tools}
                    self.assertEqual(
                        tool_names,
                        {"list_video_models", "generate_video", "get_video_job"},
                    )
                    generate_tool = next(tool for tool in tools.tools if tool.name == "generate_video")
                    self.assertFalse(generate_tool.inputSchema["additionalProperties"])
                    for field in ("mode", "input_image", "end_image", "source_video"):
                        self.assertIn(field, generate_tool.inputSchema["properties"])

                    result = await session.call_tool("list_video_models", {})

        self.assertEqual(len(result.content), 1)
        payload = json.loads(result.content[0].text)
        self.assertTrue(payload["ok"])
        self.assertIn("gemini", payload["providers"])
        self.assertIn("secret_status", payload["providers"]["openai"])


if __name__ == "__main__":
    unittest.main()
