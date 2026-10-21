"""
LangGraph Multi-Agent Workflow for 3D Virtual Office:
- Receptionist (Sarah)
- Marketing & Creative (Clara)
- Tech Lead (Alex)
- Project Manager (Budi)
- Fullstack Dev One-Asco Mobile (Faisal Ravaneli)
- Fullstack Dev TPF POS Mobile (Syaugi Askar)
- Fullstack Dev Pivore Mobile (Guntara Gumelar)
"""

from typing import Dict, Any
from langgraph.graph import StateGraph, END, START
from langchain_core.messages import HumanMessage

from app.agents.state import OfficeState
from app.agents.supervisor import supervisor_node, route_supervisor
from app.agents.roles.receptionist import receptionist_node
from app.agents.roles.marketing import marketing_node
from app.agents.roles.developer import developer_node
from app.agents.roles.manager import manager_node
from app.agents.roles.project_devs import faisal_node, syaugi_node, guntara_node
from app.agents.roles.finance_lisa import lisa_node
from app.schemas.protocol import UserMessagePayload, AgentResponsePayload


def build_office_graph():
    """
    Menyusun alur graph multi-agent:
    START -> supervisor -> (conditional) -> [receptionist | marketing | developer | manager | faisal | syaugi | guntara] -> END
    """
    workflow = StateGraph(OfficeState)

    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("receptionist", receptionist_node)
    workflow.add_node("marketing", marketing_node)
    workflow.add_node("developer", developer_node)
    workflow.add_node("manager", manager_node)
    workflow.add_node("faisal", faisal_node)
    workflow.add_node("syaugi", syaugi_node)
    workflow.add_node("guntara", guntara_node)
    workflow.add_node("lisa", lisa_node)

    workflow.add_edge(START, "supervisor")

    workflow.add_conditional_edges(
        "supervisor",
        route_supervisor,
        {
            "receptionist": "receptionist",
            "marketing": "marketing",
            "developer": "developer",
            "manager": "manager",
            "faisal": "faisal",
            "syaugi": "syaugi",
            "guntara": "guntara",
            "lisa": "lisa",
        },
    )

    for node_name in ["receptionist", "marketing", "developer", "manager", "faisal", "syaugi", "guntara", "lisa"]:
        workflow.add_edge(node_name, END)

    return workflow.compile()


office_graph = build_office_graph()


async def process_office_interaction(payload: UserMessagePayload) -> AgentResponsePayload:
    """
    Fungsi utama untuk memproses pesan dari Web 3D / Unreal Engine ke dalam graph LangGraph.
    """
    msg_content = payload.message.strip() if payload.message else ""
    if not msg_content and payload.media_path:
        kind_label = "video" if payload.media_type == "video" else "gambar"
        msg_content = f"Tolong periksa dan analisis {kind_label} yang saya lampirkan."

    initial_state: Dict[str, Any] = {
        "messages": [HumanMessage(content=msg_content or "Halo")],
        "user_id": payload.user_id,
        "room_location": payload.room_location,
        "target_agent": payload.target_agent,
        "project_workspace": payload.project_workspace or "auto",
        "media_url": payload.media_url,
        "media_path": payload.media_path,
        "media_type": payload.media_type,
        "mime_type": payload.mime_type,
        "file_name": payload.file_name,
        "next_agent": None,
        "final_response": None,
    }

    result = await office_graph.ainvoke(initial_state)

    resp_data = result.get("final_response")
    if not resp_data:
        resp_data = {
            "agent_id": "system",
            "agent_name": "Sistem Kantor",
            "text": "Maaf, respon tidak dapat diproses saat ini.",
            "animation_trigger": "Idle",
            "action_type": "idle",
            "target_waypoint": None,
            "audio_url": None,
        }

    # Teruskan referensi media jika belum disematkan agen
    if payload.media_url and not resp_data.get("media_url"):
        resp_data["media_url"] = payload.media_url
        resp_data["media_type"] = payload.media_type

    return AgentResponsePayload(**resp_data)
