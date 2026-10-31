"""
D — LangGraph ReAct agent (with real tools).

A minimal but *real* agent: it can call tools in a loop until it can answer.

Tools provided:
  - calculator(expression)  -> safe arithmetic (+, -, *, /, **, %)
  - current_time()          -> current local date/time
  - read_text_file(path)    -> read a UTF-8 text file inside this folder

Model: a local Ollama chat model (default: qwen3:8b, which supports tools).
If Ollama/model is unavailable it falls back to an offline EchoLLM so the
graph still runs.

Run:
    python agent.py "What is 23 * 47?"
    python agent.py                # interactive loop
"""
from __future__ import annotations

import ast
import operator
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Annotated

from typing_extensions import TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from guardrails import check_input, sanitize_output
from observability import Tracer

AGENT_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (
    "You are a concise assistant with memory of this conversation. "
    "Use the conversation history and tools when they help. "
    "When you have the answer, reply directly."
)


# --- Tools --------------------------------------------------------------------
_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


_MAX_EXP = 4096


def _eval_node(node: ast.AST, depth: int = 0) -> float:
    if depth > 64:
        raise ValueError("expression too deep")
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        v = node.value
        if isinstance(v, int) and abs(v) > _MAX_EXP:
            raise ValueError(f"operand exceeds {_MAX_EXP}")
        return v
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
        left = _eval_node(node.left, depth + 1)
        right = _eval_node(node.right, depth + 1)
        if isinstance(node.op, ast.Pow) and (left > _MAX_EXP or right > _MAX_EXP):
            raise ValueError(f"exponent operand exceeds {_MAX_EXP}")
        return _ALLOWED_OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_eval_node(node.operand, depth + 1))
    raise ValueError("unsupported expression")


@tool
def calculator(expression: str) -> str:
    """Evaluate a basic arithmetic expression (+, -, *, /, **, %).

    Example: calculator("(2 + 3) * 4")
    """
    try:
        tree = ast.parse(expression, mode="eval")
        result = _eval_node(tree.body)
        if isinstance(result, float) and result.is_integer():
            result = int(result)
        return str(result)
    except Exception as exc:  # noqa: BLE001
        return f"Error evaluating {expression!r}: {exc}"


@tool
def current_time() -> str:
    """Return the current local date and time (YYYY-MM-DD HH:MM:SS)."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def read_text_file(path: str) -> str:
    """Read a UTF-8 text file inside this agent's folder and return its contents.

    `path` is relative to the agent folder, e.g. "README.md".
    """
    target = (AGENT_DIR / path).resolve()
    if target != AGENT_DIR and AGENT_DIR not in target.parents:
        return "Error: path must stay inside the agent folder."
    if not target.exists() or not target.is_file():
        return f"Error: file not found: {path}"
    text = target.read_text(encoding="utf-8", errors="replace")
    return text[:4000] + ("\n…[truncated]" if len(text) > 4000 else "")


TOOLS = [calculator, current_time, read_text_file]


# --- Brain (model) ------------------------------------------------------------
class EchoLLM:
    """Offline fallback: no real model, returns an echo message."""

    def bind_tools(self, tools):  # keep the graph valid
        return self

    def invoke(self, messages):
        last = messages[-1].content if messages else ""
        return AIMessage(
            content=(
                "EchoLLM (offline fallback). I received: "
                f"{last!r}\n"
                "Start Ollama and run `ollama pull qwen3:8b` to use a real model."
            )
        )


def build_llm():
    model_name = os.environ.get("OLLAMA_MODEL", "qwen3:8b")
    try:
        from langchain_ollama import ChatOllama  # type: ignore

        llm = ChatOllama(model=model_name, temperature=0)
        llm.invoke("ping")  # fail fast if the server isn't reachable
        print(f"[brain] using local Ollama model '{model_name}'", file=sys.stderr)
        return llm
    except Exception as exc:  # noqa: BLE001
        print(
            f"[brain] Ollama unavailable ({type(exc).__name__}); using offline EchoLLM",
            file=sys.stderr,
        )
        return EchoLLM()


# --- Graph --------------------------------------------------------------------
class State(TypedDict):
    messages: Annotated[list, add_messages]


def make_checkpointer():
    """SQLite-backed memory (persists to disk); falls back to in-memory."""
    try:
        import sqlite3

        from langgraph.checkpoint.sqlite import SqliteSaver  # type: ignore

        conn = sqlite3.connect(
            str(AGENT_DIR / "checkpoints.sqlite"), check_same_thread=False
        )
        print("[memory] persisting to checkpoints.sqlite", file=sys.stderr)
        return SqliteSaver(conn)
    except Exception as exc:  # noqa: BLE001
        print(f"[memory] in-memory only ({type(exc).__name__})", file=sys.stderr)
        return MemorySaver()


def build_graph():
    llm_with_tools = build_llm().bind_tools(TOOLS)

    def assistant(state: State):
        messages = [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]]
        return {"messages": [llm_with_tools.invoke(messages)]}

    graph = StateGraph(State)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")
    return graph.compile(checkpointer=make_checkpointer())


TRACER = Tracer("d-agent")


def answer(app, question: str, thread_id: str = "cli") -> str:
    allowed, reason = check_input(question)
    TRACER.event(
        "input", thread_id=thread_id, allowed=allowed, reason=reason,
        question=question[:200],
    )
    if not allowed:
        print(f"  [guardrail] blocked: {reason}")
        return f"[blocked] {reason}"

    config = {"configurable": {"thread_id": thread_id}}
    final = None
    started = time.time()
    for update in app.stream(
        {"messages": [HumanMessage(content=question)]}, config, stream_mode="updates"
    ):
        for _node, data in update.items():
            messages = data.get("messages", []) if isinstance(data, dict) else []
            for m in messages:
                kind = getattr(m, "type", "?")
                tool_calls = getattr(m, "tool_calls", None)
                if kind == "ai" and tool_calls:
                    for tc in tool_calls:
                        print(f"  [tool] {tc['name']}({tc['args']})")
                        TRACER.event("tool_call", tool=tc["name"], args=tc["args"])
                elif kind == "tool":
                    print(f"  [result] {getattr(m, 'name', 'tool')} -> {str(m.content)[:200]}")
                    TRACER.event(
                        "tool_result", tool=getattr(m, "name", "tool"),
                        result=str(m.content)[:200],
                    )
                elif kind == "ai":
                    final = m

    raw = final.content if final is not None else "(no answer)"
    safe = sanitize_output(raw)
    TRACER.event(
        "output", thread_id=thread_id, duration_s=round(time.time() - started, 3),
        answer=safe[:300],
    )
    return safe


def main() -> None:
    app = build_graph()
    args = sys.argv[1:]
    if args:
        print(answer(app, " ".join(args)))
        return

    print("LangGraph agent ready (tools: calculator, current_time, read_text_file).")
    print("Remembers this conversation (persisted). Type '/new' to reset, 'exit' to quit.")
    thread_id = "cli"
    while True:
        try:
            question = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if question.lower() in {"exit", "quit", ""}:
            break
        if question == "/new":
            thread_id = "cli-" + datetime.now().strftime("%H%M%S")
            print("(new conversation started — previous context cleared)")
            continue
        print("agent>", answer(app, question, thread_id))


if __name__ == "__main__":
    main()
