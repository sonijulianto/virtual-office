"""
Marketing & Content Agent: "Clara"
Bertanggung jawab atas riset tren media sosial, copywriting, ide konten kreatif, dan strategi campaign.
"""

from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState


MARKETING_SYSTEM_PROMPT = """
Anda adalah "Clara", Creative & Social Media Marketing AI di kantor virtual 3D ini.
Karakter: Kreatif, energik, ekspresif, memahami tren viral terkini (Instagram Reels, TikTok, YouTube Shorts, LinkedIn), dan ahli copywriting yang persuasif.

Tugas & Wewenang:
- Memberikan ide konten kreatif, hook video, dan struktur naskah (scripting).
- Menganalisis target audiens dan strategi personal branding maupun bisnis.
- Menyusun copywriting iklan, caption media sosial, dan hashtag strategis.
- Merancang jadwal rilis konten (content calendar).

Instruksi Khusus:
1. Jawab secara ringkas, bersemangat, dan to-the-point (maksimal 2-3 kalimat atau bullet point padat) agar nyaman dibaca di balon dialog 3D.
2. Tentukan trigger animasi yang paling pas untuk avatar 3D:
   - "Talk_Friendly" saat menjelaskan ide atau strategi konten.
   - "Wave" saat menyapa dengan antusias.
   - "Think" saat sedang memikirkan ide kreatif atau hook baru.
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


async def invoke_gemini(messages, temperature=0.7) -> str:
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


async def marketing_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node LangGraph untuk Marketing & Content (Clara) — Ditenagai Hermes Agent + Gemini Flash.
    """
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Marketing Studio")
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
            agent_id="marketing",
            agent_name="Clara",
            role_system_prompt=MARKETING_SYSTEM_PROMPT,
        )
        tools_used = ["multimodal_vision_analyzer", "creative_hook_evaluator"]
        active_model = "gemini-3.5-flash-lite"
    else:
        from app.agents.hermes_bridge import run_hermes_division_agent
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id="marketing",
            role_system_prompt=MARKETING_SYSTEM_PROMPT,
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
        )

        if not text_response:
            messages = [
                SystemMessage(content=MARKETING_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Konteks: Pengguna '{user_id}' berdiskusi di pod '{room}'.\nPesan: {user_msg}\n\nJawablah dengan gaya kreatif dan berikan rekomendasi actionable."
                )
            ]
            text_response = await invoke_gemini(messages, temperature=0.7)

    if text_response:
        import re
        text_response = re.sub(r'\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]', '', text_response, flags=re.IGNORECASE)
        text_response = re.sub(r'\[(Talk_Friendly|Talk_Professional|Think|Wave)\]', '', text_response, flags=re.IGNORECASE).strip()
        anim = "Think" if any(w in user_msg.lower() for w in ["ide", "hook", "strategi", "riset", "analisis"]) else ("Wave" if any(w in user_msg.lower() for w in ["halo", "hai", "clara"]) else "Talk_Friendly")
    else:
        # Fallback Mock / Offline Mode
        msg_lower = user_msg.lower()
        if any(w in msg_lower for w in ["ide", "konten", "reels", "tiktok"]):
            text_response = "Untuk Reels viral minggu ini: gunakan hook visual 'POV punya kantor virtual AI', lalu tunjukkan AI Agent di tiap divisi sedang bekerja otomatis!"
            anim = "Talk_Friendly"
        elif any(w in msg_lower for w in ["caption", "copywriting"]):
            text_response = "Tentu! Saya buatkan draft caption dengan formula PAS (Problem-Agitate-Solution) lengkap dengan CTA yang memikat."
            anim = "Talk_Friendly"
        elif any(w in msg_lower for w in ["halo", "hai"]):
            text_response = "Hai! Saya Clara dari Divisi Creative & Marketing. Siap bikin konten bisnis Anda viral hari ini?"
            anim = "Wave"
        else:
            text_response = f"Ide bagus! Mari kita kemas topik tersebut ke format micro-content yang disukai audiens saat ini."
            anim = "Think"

    final_payload = {
        "agent_id": "marketing",
        "agent_name": "Clara (Marketing & Creative)",
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
