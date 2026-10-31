r"""
Scout (runnable twin) — an executable web-research agent.

Same job as the Markdown agent in this folder (B-km-agent): given a URL or topic,
fetch sources and write a structured brief (Summary -> Key points -> Sources),
never fabricating. It reuses D's guardrails + tracing, and can search your
Obsidian vault via MCP.

Run (reuses D's venv, which already has the dependencies):
    ..\D-langgraph-agent\.venv\Scripts\python.exe scout.py "https://example.com"
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Annotated

from typing_extensions import TypedDict

_HERE = Path(__file__).resolve().parent
_D = _HERE.parent / "D-langgraph-agent"
sys.path.insert(0, str(_D))

from guardrails import check_input, sanitize_output  # noqa: E402
from observability import Tracer  # noqa: E402
from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402
from langchain_core.tools import tool  # noqa: E402
from langchain_mcp_adapters.client import MultiServerMCPClient  # noqa: E402
from langgraph.graph import StateGraph, START  # noqa: E402
from langgraph.graph.message import add_messages  # noqa: E402
from langgraph.prebuilt import ToolNode, tools_condition  # noqa: E402

def _default_obsidian_exe() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "mcps", "obsidian", "Scripts", "mcp-obsidian.exe")


OBSIDIAN_EXE = os.environ.get("OBSIDIAN_MCP_EXE") or _default_obsidian_exe()
MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

SCOUT_PROMPT = (
    "You are Scout, a web research assistant. Given a URL or topic, call the "
    "fetch_url tool (and Obsidian tools if relevant), then write a STRUCTURED BRIEF:\n"
    "1. Summary (2-3 sentences)\n"
    "2. Key points (bullets)\n"
    "3. Sources (the exact URLs used)\n"
    "Never fabricate. Every claim must trace to a fetched source. If something "
    "cannot be sourced, say so."
)

TRACER = Tracer("scout")


def _strip_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _fetch_html(url: str) -> str | None:
    try:
        import httpx

        resp = httpx.get(
            url, timeout=30, follow_redirects=True, headers={"User-Agent": _UA}
        )
        if resp.status_code == 200:
            return resp.text
    except Exception:  # noqa: BLE001
        pass
    try:
        import subprocess

        out = subprocess.run(
            ["curl.exe", "-sL", "--max-time", "30", "-A", _UA, url],
            capture_output=True, timeout=45,
        )
        if out.returncode == 0 and out.stdout:
            return out.stdout.decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    return None


@tool
def fetch_url(url: str) -> str:
    """Fetch a web page and return its visible text (truncated)."""
    html = _fetch_html(url)
    if html is None:
        return f"Error fetching {url}: request failed"
    text = _strip_html(html)
    body = text[:6000] + ("\n...[truncated]" if len(text) > 6000 else "")
    return f"URL: {url}\n\n{body}"


class State(TypedDict):
    messages: Annotated[list, add_messages]


async def build_app():
    tools = [fetch_url]
    if os.environ.get("OBSIDIAN_API_KEY"):
        client = MultiServerMCPClient(
            {
                "obsidian": {
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
            }
        )
        tools += await client.get_tools()
    print(f"[scout] {len(tools)} tool(s): {[t.name for t in tools]}", file=sys.stderr)

    from langchain_ollama import ChatOllama  # type: ignore

    llm = ChatOllama(model=MODEL, temperature=0).bind_tools(tools)

    def assistant(state: State):
        messages = [SystemMessage(content=SCOUT_PROMPT), *state["messages"]]
        return {"messages": [llm.invoke(messages)]}

    graph = StateGraph(State)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")
    return graph.compile()


async def main() -> None:
    target = " ".join(sys.argv[1:]) or "https://en.wikipedia.org/wiki/Retrieval-augmented_generation"
    allowed, reason = check_input(target)
    TRACER.event("input", target=target[:200], allowed=allowed, reason=reason)
    if not allowed:
        print(f"[blocked] {reason}")
        return

    app = await build_app()
    result = await app.ainvoke(
        {"messages": [HumanMessage(content=f"Research this and write a brief: {target}")]}
    )
    for m in result["messages"]:
        kind = getattr(m, "type", "?")
        tool_calls = getattr(m, "tool_calls", None)
        if kind == "ai" and tool_calls:
            for tc in tool_calls:
                print(f"  [tool] {tc['name']}({str(tc['args'])[:120]})")
                TRACER.event("tool_call", tool=tc["name"], args=tc["args"])
        elif kind == "tool":
            TRACER.event(
                "tool_result", tool=getattr(m, "name", "tool"), result=str(m.content)[:200]
            )

    brief = sanitize_output(result["messages"][-1].content)
    TRACER.event("output", target=target[:200], brief=brief[:300])
    print("\n" + brief)
    sys.stdout.flush()
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
