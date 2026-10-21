from typing import TypedDict, Annotated, Optional, Dict, Any, List
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class OfficeState(TypedDict):
    """
    Shared state across all nodes in the Virtual Office LangGraph workflow.
    """
    # Conversation message history
    messages: Annotated[List[BaseMessage], add_messages]
    
    # Metadata from Unreal Engine
    user_id: str
    room_location: str
    target_agent: str  # Can be "auto", "receptionist", "manager", "faisal", "syaugi", "guntara", etc.
    project_workspace: Optional[str]
    
    # Multimodal Media fields
    media_url: Optional[str]
    media_path: Optional[str]
    media_type: Optional[str]
    mime_type: Optional[str]
    file_name: Optional[str]

    # Internal routing decision
    next_agent: Optional[str]
    
    # Final output formatted for Unreal Engine
    final_response: Optional[Dict[str, Any]]
