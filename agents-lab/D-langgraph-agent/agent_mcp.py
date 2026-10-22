"""
D (bonus) — LangGraph agent with **MCP tools**.

Instead of hard-coding tools, this agent loads them from an **MCP server**
via `langchain-mcp-adapters`. The server is the tiny local FastMCP server
`mcp_servers/demo_server.py` (tools: word_count, reverse_text, uppercase).

Run:
    python agent_mcp.py "How many words are in: the quick brown fox jumps over the lazy dog"
    python agent_mcp.py "Reverse the text 'hello world'"
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Annotated

from typing_extensions import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

AGENT_DIR = Path(__file__).resolve().parent
SERVER = AGENT_DIR / "mcp_servers" / "demo_server.py"
OBSIDIAN_EXE = os.environ.get(
    "OBSIDIAN_MCP_EXE",
    r"~\mcps\obsidian\Scripts\mcp-obsidian.exe",
)
MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")


class State(TypedDict):
    messages: Annotated[list, add_messages]


async def build_app():
    # 1. Connect to the MCP server (stdio) and load its tools.
    servers: dict = {
        "demo": {
            "command": sys.executable,
            "args": [str(SERVER)],
            "transport": "stdio",
        }
    }
    if os.environ.get("OBSIDIAN_API_KEY"):
        servers["obsidian"] = {
            "command": OBSIDIAN_EXE,
            "args": [],
            "transport": "stdio",
            "env": {
                "OBSIDIAN_API_KEY": os.environ["OBSIDIAN_API_KEY"],
                "OBSIDIAN_HOST": os.environ.get("OBSIDIAN_HOST", "127.0.0.1"),
                "OBSIDIAN_PORT": os.environ.get("OBSIDIAN_PORT", "27124"),
                "OBSIDIAN_PROTOCOL": os.environ.get("OBSIDIAN_PROTOCOL", "https"),
                "NO_PROXY": "127.0.0.1,localhost",
                "no_proxy": "127.0.0.1,localhost",
            },
        }
    client = MultiServerMCPClient(servers)
    tools = await client.get_tools()
    print(
        f"[mcp] loaded {len(tools)} tool(s): {[t.name for t in tools]}",
        file=sys.stderr,
    )

    # 2. Bind the MCP tools to the model and build a ReAct graph.
    from langchain_ollama import ChatOllama  # type: ignore

    llm = ChatOllama(model=MODEL, temperature=0).bind_tools(tools)

    def assistant(state: State):
        messages = [
            SystemMessage(content="You are a concise assistant. Use the MCP tools when helpful."),
            *state["messages"],
        ]
        return {"messages": [llm.invoke(messages)]}

    graph = StateGraph(State)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")
    return graph.compile()


async def main() -> None:
    question = " ".join(sys.argv[1:]) or (
        "Use the word_count tool on: 'the quick brown fox jumps over the lazy dog'"
    )
    app = await build_app()
    result = await app.ainvoke({"messages": [HumanMessage(content=question)]})
    for m in result["messages"]:
        kind = getattr(m, "type", "?")
        tool_calls = getattr(m, "tool_calls", None)
        if kind == "ai" and tool_calls:
            for tc in tool_calls:
                print(f"  [tool] {tc['name']}({tc['args']})")
        elif kind == "tool":
            print(f"  [result] {getattr(m, 'name', 'tool')} -> {str(m.content)[:200]}")
    print(result["messages"][-1].content)


if __name__ == "__main__":
    asyncio.run(main())
