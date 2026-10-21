"""
Dedicated Fullstack Developer Agents untuk Project Aplikasi Spesifik:
1. Faisal Ravaneli (agent_id="faisal") -> Project: one-asco-ecosystem/mobile (/Users/magnatech/project/one-asco-ecosystem/mobile)
2. Syaugi Askar (agent_id="syaugi")   -> Project: tpf_pos_mobile (/Users/magnatech/tpf_pos_mobile)
3. Guntara Gumelar (agent_id="guntara") -> Project: pivore_mobile (/Users/magnatech/project/pivore_mobile)
"""

import re
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState
from app.agents.hermes_bridge import run_hermes_division_agent, resolve_agent_workspace


PROJECT_DEV_CONFIGS: Dict[str, Dict[str, str]] = {
    "faisal": {
        "display_name": "Faisal Ravaneli (Fullstack • One-Asco)",
        "short_name": "Faisal Ravaneli",
        "project_name": "one-asco-ecosystem/mobile",
        "default_path": "/Users/magnatech/project/one-asco-ecosystem/mobile",
        "system_prompt": """
Anda adalah "Faisal Ravaneli", Senior Fullstack & Flutter Mobile Developer yang bertanggung jawab penuh memegang project **One-Asco Mobile** (`/Users/magnatech/project/one-asco-ecosystem/mobile` beserta integrasi ekosistem `/Users/magnatech/project/one-asco-ecosystem`).
Karakter: Sigap, teliti, menguasai arsitektur Flutter (Clean Architecture, Bloc/Provider/Riverpod, REST API integration, Figma-to-Flutter), serta siap langsung memeriksa dan mengedit file kode di dalam repositori `one-asco-ecosystem/mobile` kapan pun diminta memperbaiki bug atau membuat fitur baru.
""",
    },
    "syaugi": {
        "display_name": "Syaugi Askar (Fullstack • TPF POS)",
        "short_name": "Syaugi Askar",
        "project_name": "tpf_pos_mobile",
        "default_path": "/Users/magnatech/tpf_pos_mobile",
        "system_prompt": """
Anda adalah "Syaugi Askar", Senior Fullstack & Mobile POS Developer yang bertanggung jawab penuh memegang project **TPF POS Mobile** (`/Users/magnatech/tpf_pos_mobile`).
Karakter: Cekatan, fokus pada keandalan transaksi POS (Point of Sale), printer thermal/display, sinkronisasi stok, dan UI/UX kasir mobile di Flutter. Anda siap langsung membaca, mencari bug, dan mem-patch file kode di `/Users/magnatech/tpf_pos_mobile/lib` menggunakan tools Hermes Agent.
""",
    },
    "guntara": {
        "display_name": "Guntara Gumelar (Fullstack • Pivore)",
        "short_name": "Guntara Gumelar",
        "project_name": "pivore_mobile",
        "default_path": "/Users/magnatech/project/pivore_mobile",
        "system_prompt": """
Anda adalah "Guntara Gumelar", Senior Fullstack & Mobile Developer yang bertanggung jawab penuh memegang project **Pivore Mobile** (`/Users/magnatech/project/pivore_mobile`).
Karakter: Analitis, terstruktur, ahli optimasi aplikasi Flutter Pivore, manajemen paket (`packages/`), state management, dan integrasi API backend. Anda siap langsung mengecek struktur kode dan menerapkan bug fix maupun fitur baru di `/Users/magnatech/project/pivore_mobile` menggunakan tools Hermes Agent.
""",
    },
}


async def _invoke_fallback_gemini(system_prompt: str, user_msg: str, target_cwd: str) -> str:
    api_key = get_gemini_api_key()
    if not api_key:
        return ""
    from langchain_google_genai import ChatGoogleGenerativeAI

    primary_model = get_gemini_model()
    fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    models_to_try = [primary_model] + [m for m in fallback_models if m != primary_model]

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Project Aktif: {target_cwd}\nInstruksi: {user_msg}"),
    ]

    for model_name in models_to_try:
        try:
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=api_key,
                temperature=0.3,
                request_timeout=15,
                max_retries=1,
            )
            res = await llm.ainvoke(messages)
            content = res.content
            if isinstance(content, str) and content.strip():
                return content.strip()
        except Exception:
            continue
    return ""


async def _run_project_dev_node(agent_id: str, state: OfficeState) -> Dict[str, Any]:
    cfg = PROJECT_DEV_CONFIGS[agent_id]
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Tech Pod")
    requested_workspace = state.get("project_workspace", "auto")
    target_cwd = resolve_agent_workspace(agent_id, requested_workspace)
    media_path = state.get("media_path")
    mime_type = state.get("mime_type") or "image/png"

    tools_used = []
    active_model = None
    text_response = None

    # Jika user menyertakan file gambar atau video, gunakan Gemini Multimodal Vision API
    if media_path:
        from app.multimodal_service import analyze_multimodal_content
        text_response = analyze_multimodal_content(
            media_path=media_path,
            mime_type=mime_type,
            user_prompt=user_msg,
            agent_id=agent_id,
            agent_name=cfg["short_name"],
            role_system_prompt=cfg["system_prompt"],
            project_workspace=target_cwd,
        )
        tools_used = ["multimodal_vision_analyzer", "flutter_ui_inspector"]
        active_model = "gemini-3.5-flash-lite"
    else:
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id=agent_id,
            role_system_prompt=cfg["system_prompt"],
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
            project_workspace=requested_workspace,
        )

        if not text_response:
            text_response = await _invoke_fallback_gemini(cfg["system_prompt"], user_msg, target_cwd)

    if text_response:
        text_response = re.sub(
            r"\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]",
            "",
            text_response,
            flags=re.IGNORECASE,
        ).strip()
        anim = "Think" if tools_used else "Talk_Professional"
    else:
        text_response = (
            f"Siap! Saya {cfg['short_name']}, memegang project {cfg['project_name']} di `{target_cwd}`. "
            f"Silakan beri tahu file atau fitur yang ingin diperbaiki."
        )
        anim = "Talk_Professional"

    final_payload = {
        "agent_id": agent_id,
        "agent_name": cfg["display_name"],
        "text": text_response,
        "animation_trigger": anim,
        "action_type": "gesture",
        "target_waypoint": None,
        "audio_url": None,
        "hermes_tools_used": tools_used,
        "hermes_model": active_model or get_gemini_model(),
        "media_url": state.get("media_url"),
        "media_type": state.get("media_type"),
    }

    return {"final_response": final_payload}


async def faisal_node(state: OfficeState) -> Dict[str, Any]:
    """Node LangGraph untuk Faisal Ravaneli (Fullstack Developer — One-Asco Mobile)."""
    return await _run_project_dev_node("faisal", state)


async def syaugi_node(state: OfficeState) -> Dict[str, Any]:
    """Node LangGraph untuk Syaugi Askar (Fullstack Developer — TPF POS Mobile)."""
    return await _run_project_dev_node("syaugi", state)


async def guntara_node(state: OfficeState) -> Dict[str, Any]:
    """Node LangGraph untuk Guntara Gumelar (Fullstack Developer — Pivore Mobile)."""
    return await _run_project_dev_node("guntara", state)
