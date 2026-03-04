"""Example of using nostream tag to exclude LLM output from the stream."""

# :snippet-start: nostream-tag
from typing import Any, TypedDict, cast

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage
from langgraph.graph import START, StateGraph

# Create two models: one that streams, one that doesn't
streaming_model = ChatAnthropic(
    model_name="claude-3-haiku-20240307", timeout=None, stop=None
)
internal_model = ChatAnthropic(
    model_name="claude-3-haiku-20240307", timeout=None, stop=None
).with_config({"tags": ["nostream"]})


class State(TypedDict):
    """State for the graph."""

    topic: str
    public_response: str
    internal_analysis: str


def generate_response(state: State) -> dict[str, Any]:
    """Generate a public response that will be streamed."""
    topic = state["topic"]
    response = streaming_model.invoke(
        [{"role": "user", "content": f"Write a short response about {topic}"}]
    )
    return {"public_response": response.content}


def analyze_internally(state: State) -> dict[str, Any]:
    """Analyze internally without streaming tokens."""
    topic = state["topic"]
    # This model has the "nostream" tag, so its tokens won't appear in the stream
    analysis = internal_model.invoke(
        [{"role": "user", "content": f"Analyze the topic: {topic}"}]
    )
    return {"internal_analysis": analysis.content}


graph = (
    StateGraph(State)
    .add_node("generate_response", generate_response)
    .add_node("analyze_internally", analyze_internally)
    .add_edge(START, "generate_response")
    .add_edge(START, "analyze_internally")
    .compile()
)

initial_state: State = {
    "topic": "AI",
    "public_response": "",
    "internal_analysis": "",
}
stream = graph.stream(cast("Any", initial_state), stream_mode="messages")
# :snippet-end:

# :remove-start:
# Stream with "messages" mode - only tokens from streaming_model will appear
streamed_nodes: list[str] = []
for msg, metadata in stream:
    if isinstance(msg, BaseMessage) and msg.content and isinstance(metadata, dict):
        streamed_nodes.append(metadata["langgraph_node"])
        # print(msg.content, end="|", flush=True)
assert "analyze_internally" not in streamed_nodes, (
    "No tokens from the non-streaming model should appear in the stream"
)

if __name__ == "__main__":
    print("\n✓ nostream tag example works as expected")  # noqa: T201
# :remove-end:
