"""
A tiny MCP server (FastMCP) exposing a few deterministic tools.

This exists to demonstrate *MCP tool loading* in the LangGraph agent
(`agent_mcp.py`). It speaks MCP over stdio.

Run standalone (optional):
    python mcp_servers/demo_server.py
"""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("demo")


@mcp.tool()
def word_count(text: str) -> int:
    """Count the number of words in the given text."""
    return len(text.split())


@mcp.tool()
def reverse_text(text: str) -> str:
    """Return the given text reversed."""
    return text[::-1]


@mcp.tool()
def uppercase(text: str) -> str:
    """Return the given text in UPPERCASE."""
    return text.upper()


if __name__ == "__main__":
    mcp.run()
