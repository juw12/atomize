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
import time
from pathlib import Path
from typing import Annotated

from typing_extensions import TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from guardrails import check_input, sanitize_output  # noqa: E402
from observability import Tracer  # noqa: E402

AGENT_DIR = Path(__file__).resolve().parent
SERVER = AGENT_DIR / "mcp_servers" / "demo_server.py"
def _default_obsidian_exe() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "mcps", "obsidian", "Scripts", "mcp-obsidian.exe")


OBSIDIAN_EXE = os.environ.get("OBSIDIAN_MCP_EXE") or _default_obsidian_exe()
MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")
TRACER = Tracer("d-mcp-agent")


class EchoLLM:
    """Offline fallback (matches agent.py): no real model, returns an echo message."""

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        last = messages[-1].content if messages else ""
        return AIMessage(
            content=(
                f"EchoLLM (offline fallback). I received: {last!r}\n"
                "Start Ollama and run `ollama pull qwen3:8b` to use a real model."
            )
        )


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
    try:
        from langchain_ollama import ChatOllama  # type: ignore

        llm = ChatOllama(model=MODEL, temperature=0)
        llm.invoke("ping")  # fail fast if the server isn't reachable
        llm = llm.bind_tools(tools)
        print(f"[brain] using local Ollama model '{MODEL}'", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(
            f"[brain] Ollama unavailable ({type(exc).__name__}); using offline EchoLLM",
            file=sys.stderr,
        )
        llm = EchoLLM().bind_tools(tools)

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
    allowed, reason = check_input(question)
    TRACER.event("input", question=question[:200], allowed=allowed, reason=reason)
    if not allowed:
        print(f"  [guardrail] blocked: {reason}")
        return

    started = time.time()
    app = await build_app()
    result = await app.ainvoke({"messages": [HumanMessage(content=question)]})
    for m in result["messages"]:
        kind = getattr(m, "type", "?")
        tool_calls = getattr(m, "tool_calls", None)
        if kind == "ai" and tool_calls:
            for tc in tool_calls:
                print(f"  [tool] {tc['name']}({tc['args']})")
                TRACER.event("tool_call", tool=tc["name"], args=tc["args"])
        elif kind == "tool":
            print(f"  [result] {getattr(m, 'name', 'tool')} -> {str(m.content)[:200]}")
            TRACER.event("tool_result", tool=getattr(m, "name", "tool"),
                         result=str(m.content)[:200])

    raw = result["messages"][-1].content
    safe = sanitize_output(raw)
    TRACER.event(
        "output",
        duration_s=round(time.time() - started, 3),
        answer=safe[:300],
    )
    print(safe)


if __name__ == "__main__":
    asyncio.run(main())
