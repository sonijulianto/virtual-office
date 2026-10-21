"""
Protocol definitions for communication between Unreal Engine 5 and the Backend Server.
"""

from typing import Optional, Literal, List
from pydantic import BaseModel, Field


class UserMessagePayload(BaseModel):
    """
    Payload received from Unreal Engine 5 when a user speaks/chats or interacts with an avatar.
    """
    user_id: str = Field(default="player_1", description="Identifier of the user/player")
    target_agent: str = Field(
        default="auto",
        description="Target agent ID ('receptionist', 'manager', or 'auto' for supervisor routing)"
    )
    message: str = Field(default="", description="Text message from user")
    room_location: str = Field(
        default="Lobby",
        description="Current 3D room/area in the virtual office where user is located"
    )
    project_workspace: Optional[str] = Field(
        default="auto",
        description="Target project workspace directory path or 'auto' for agent's default project"
    )
    media_url: Optional[str] = Field(
        default=None,
        description="URL of uploaded media (e.g., /static/uploads/...)"
    )
    media_path: Optional[str] = Field(
        default=None,
        description="Absolute local file path on server of uploaded media"
    )
    media_type: Optional[str] = Field(
        default=None,
        description="Kind of media: 'image' or 'video'"
    )
    mime_type: Optional[str] = Field(
        default=None,
        description="MIME type e.g. 'image/png', 'video/mp4'"
    )
    file_name: Optional[str] = Field(
        default=None,
        description="Original name of the uploaded file"
    )


class AgentResponsePayload(BaseModel):
    """
    Payload sent back to Unreal Engine 5 to drive dialogue and 3D character animation.
    """
    agent_id: str = Field(..., description="ID of the agent responding ('receptionist', 'manager', etc.)")
    agent_name: str = Field(..., description="Display name of the character (e.g. 'Sarah', 'Budi')")
    text: str = Field(..., description="Text response to display in speech bubble / chat HUD")
    animation_trigger: str = Field(
        default="Talk_Friendly",
        description="Animation montage/state trigger in Unreal Engine (e.g., 'Talk_Friendly', 'Talk_Professional', 'Wave', 'Think')"
    )
    action_type: Literal["gesture", "walk_to", "idle"] = Field(
        default="gesture",
        description="Type of action the avatar should perform"
    )
    target_waypoint: Optional[str] = Field(
        default=None,
        description="Target waypoint name if avatar needs to move"
    )
    audio_url: Optional[str] = Field(
        default=None,
        description="URL for streaming TTS audio if voice feature is active"
    )
    hermes_tools_used: Optional[List[str]] = Field(
        default=None,
        description="Daftar tool Hermes Agent yang dieksekusi (misal: ['memory', 'write_file'])"
    )
    hermes_model: Optional[str] = Field(
        default=None,
        description="Model LLM aktif yang digunakan oleh Hermes Agent"
    )
    media_url: Optional[str] = Field(
        default=None,
        description="Echo attachment media URL yang dianalisis"
    )
    media_type: Optional[str] = Field(
        default=None,
        description="'image' atau 'video'"
    )
