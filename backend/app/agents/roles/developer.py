"""
Tech & Engineering Agent: "Alex"
Bertanggung jawab atas arsitektur sistem, review kode, bug fixing, integrasi API, dan infrastruktur backend/frontend.
"""

from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState


DEV_SYSTEM_PROMPT = """
Anda adalah "Alex", Lead Developer & Tech Engineer AI di kantor virtual 3D ini.
Karakter: Cerdas, teknis, analitis, menyukai best-practice coding (Python, FastAPI, Three.js, Unreal Engine, WebSockets, Docker), dan cepat menemukan solusi bug.

Tugas & Wewenang:
- Memberikan solusi debugging, analisis error log, dan optimasi performa.
- Menjelaskan arsitektur socket, API, dan alur integrasi multi-agent LangGraph.
- Memberikan cuplikan logika kode atau rekomendasi library yang tepat.
- Menjaga keandalan sistem kantor virtual.

Instruksi Khusus:
1. Jawab secara ringkas, akurat, dan solutif (maksimal 2-3 kalimat atau petunjuk langkah teknis padat).
2. Tentukan trigger animasi yang paling pas untuk avatar 3D:
   - "Talk_Professional" saat menjelaskan solusi teknis atau arsitektur.
   - "Think" saat menganalisis bug atau menimbang pilihan database/framework.
"""


def extract_text(content) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "").strip()
            if isinstance(block, str):
                return block.strip()
    return str(content).strip()


async def invoke_gemini(messages, temperature=0.3) -> str:
    api_key = get_gemini_api_key()
    if not api_key:
        return ""
    from langchain_google_genai import ChatGoogleGenerativeAI
    primary_model = get_gemini_model()
    fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    
    models_to_try = [primary_model] + [m for m in fallback_models if m != primary_model]
    for model_name in models_to_try:
        try:
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=api_key,
                temperature=temperature,
                request_timeout=15,
                max_retries=1,
            )
            res = await llm.ainvoke(messages)
            text = extract_text(res.content)
            if text:
                return text
        except Exception:
            continue
    return ""


async def developer_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node LangGraph untuk Tech & Developer (Alex) — Ditenagai Hermes Agent + Gemini Flash.
    """
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Tech Pod")
    media_path = state.get("media_path")
    mime_type = state.get("mime_type") or "image/png"

    tools_used = []
    active_model = None
    text_response = None

    if media_path:
        from app.multimodal_service import analyze_multimodal_content
        text_response = analyze_multimodal_content(
            media_path=media_path,
            mime_type=mime_type,
            user_prompt=user_msg,
            agent_id="developer",
            agent_name="Alex",
            role_system_prompt=DEV_SYSTEM_PROMPT,
            project_workspace=state.get("project_workspace", "auto"),
        )
        tools_used = ["multimodal_vision_analyzer", "code_architecture_inspector"]
        active_model = "gemini-3.5-flash-lite"
    else:
        from app.agents.hermes_bridge import run_hermes_division_agent
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id="developer",
            role_system_prompt=DEV_SYSTEM_PROMPT,
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
            project_workspace=state.get("project_workspace", "auto"),
        )

        if not text_response:
            messages = [
                SystemMessage(content=DEV_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Konteks: Developer '{user_id}' berdiskusi di pod '{room}'.\nPesan: {user_msg}\n\nJawablah dengan presisi teknis tingkat tinggi."
                )
            ]
            text_response = await invoke_gemini(messages, temperature=0.3)

    if text_response:
        import re
        text_response = re.sub(r'\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]', '', text_response, flags=re.IGNORECASE)
        text_response = re.sub(r'\[(Talk_Friendly|Talk_Professional|Think|Wave)\]', '', text_response, flags=re.IGNORECASE).strip()
        anim = "Think" if any(w in user_msg.lower() for w in ["bug", "error", "optimasi", "arsitektur", "kenapa"]) else "Talk_Professional"
    else:
        # Fallback Mock / Offline Mode
        msg_lower = user_msg.lower()
        if any(w in msg_lower for w in ["bug", "error"]):
            text_response = "Saya sedang monitor log sistem. Jika ada error di socket atau LLM timeout, exception handling otomatis mengalihkan ke model cadangan."
            anim = "Think"
        elif any(w in msg_lower for w in ["arsitektur", "stack", "teknis"]):
            text_response = "Stack kantor virtual kita menggunakan FastAPI + Async Socket.IO di transport layer, LangGraph sebagai state machine agen, dan Three.js untuk WebGL rendering."
            anim = "Talk_Professional"
        elif any(w in msg_lower for w in ["halo", "hai", "alex"]):
            text_response = "Halo! Alex di sini dari Divisi Tech & Engineering. Ada modul kode atau bug yang perlu kita selesaikan?"
            anim = "Talk_Professional"
        else:
            text_response = f"Siap. Modul tersebut sudah dioptimasi secara asinkron agar latensi tetap di bawah 100ms."
            anim = "Talk_Professional"

    final_payload = {
        "agent_id": "developer",
        "agent_name": "Alex (Tech & Lead Dev)",
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

    return {
        "final_response": final_payload
    }
