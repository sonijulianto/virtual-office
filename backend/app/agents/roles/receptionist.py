"""
Receptionist Agent: "Sarah"
Bertanggung jawab atas penyambutan tamu, informasi ruangan kantor, dan panduan umum.
"""

from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState


RECEPTIONIST_SYSTEM_PROMPT = """
Anda adalah "Sarah", Resepsionis Virtual AI di kantor 3D ini.
Karakter: Ramah, ramah senyum, profesional, dan sangat membantu.

Informasi Fasilitas Kantor:
- Lobby Utama: Tempat tamu pertama kali tiba.
- Ruang Rapat (Meeting Room Alpha): Ada di lantai 1 sebelah kanan, lengkap dengan proyektor.
- Ruang Developer & IT: Ada di lantai 1 sebelah kiri.
- Ruang CEO / Direktur: Ada di lantai 2.
- Cafeteria & Lounge: Ada di bagian belakang lobi untuk istirahat.

Data Buku Tamu Hari Ini (Guest Book):
- Pukul 09:30: Pak Sandi (PT Global Solusi) - Agenda: Diskusi integrasi di Meeting Room Alpha.
- Pukul 11:00: Ibu Maya Arini - Agenda: Wawancara kerja UI/UX Designer.
- Pukul 14:00: Tim Audit Keuangan (2 orang) - Agenda: Review laporan dengan Pak Budi.
Total hari ini tercatat ada 4 tamu dari 3 sesi kunjungan.

Instruksi Khusus:
1. Jawab secara ringkas, jelas, dan ramah (maksimal 2-3 kalimat) agar nyaman dibaca di speech bubble 3D / HUD.
2. Jika ditanya mengenai tamu atau jadwal kunjungan hari ini, gunakan data Buku Tamu di atas.
3. Tentukan trigger animasi yang paling cocok untuk avatar 3D Anda:
   - "Wave" jika menyapa pertama kali.
   - "Talk_Friendly" saat menjelaskan informasi.
   - "Think" jika sedang mengingat/mengecek data buku tamu.
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


async def receptionist_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node LangGraph untuk Resepsionis (Sarah) — Ditenagai Hermes Agent + Gemini Flash.
    """
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Lobby")

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
            agent_id="receptionist",
            agent_name="Sarah",
            role_system_prompt=RECEPTIONIST_SYSTEM_PROMPT,
        )
        tools_used = ["multimodal_vision_analyzer"]
        active_model = "gemini-3.5-flash-lite"
    else:
        from app.agents.hermes_bridge import run_hermes_division_agent
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id="receptionist",
            role_system_prompt=RECEPTIONIST_SYSTEM_PROMPT,
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
        )

        if not text_response:
            messages = [
                SystemMessage(content=RECEPTIONIST_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Konteks: Pengguna '{user_id}' berada di area '{room}'.\nPesan: {user_msg}\n\nJawablah dengan ramah berdasarkan data kantor."
                )
            ]
            text_response = await invoke_gemini(messages, temperature=0.7)

    if text_response:
        import re
        text_response = re.sub(r'\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]', '', text_response, flags=re.IGNORECASE)
        text_response = re.sub(r'\[(Talk_Friendly|Talk_Professional|Think|Wave)\]', '', text_response, flags=re.IGNORECASE).strip()
        anim = "Think" if any(w in user_msg.lower() for w in ["tamu", "berapa", "siapa", "jadwal", "daftar"]) else ("Wave" if any(w in user_msg.lower() for w in ["halo", "hai", "selamat"]) else "Talk_Friendly")
    else:
        # Fallback Mock / Offline Mode (hanya jika API gagal/offline)
        msg_lower = user_msg.lower()
        if any(w in msg_lower for w in ["tamu", "pengunjung", "guest", "kunjungan"]):
            text_response = "Berdasarkan buku tamu hari ini, tercatat ada 4 tamu terjadwal: Pak Sandi (09:30), Ibu Maya untuk interview (11:00), dan tim audit keuangan (14:00)."
            anim = "Think"
        elif any(w in msg_lower for w in ["halo", "hai", "hello", "hi"]):
            text_response = "Halo! Selamat datang di kantor virtual kami. Saya Sarah, resepsionis AI. Ada yang bisa saya bantu?"
            anim = "Wave"
        elif any(w in msg_lower for w in ["rapat", "meeting", "ruang rapat"]):
            text_response = "Ruang Rapat Alpha berada di sebelah kanan koridor lantai 1. Silakan masuk, proyektor sudah siap."
            anim = "Talk_Friendly"
        elif any(w in msg_lower for w in ["toilet", "wc", "kamar kecil"]):
            text_response = "Toilet berada di lorong dekat tangga darurat sebelah kiri cafeteria."
            anim = "Talk_Friendly"
        elif any(w in msg_lower for w in ["kantin", "makan", "cafeteria", "kopi"]):
            text_response = "Cafeteria dan lounge santai ada di bagian belakang lobi utama. Anda bisa rehat dan ngopi di sana!"
            anim = "Talk_Friendly"
        else:
            text_response = f"Tentu! Saya bisa membantu mengecek buku tamu, memandu denah ruangan, atau mencatat keperluan Anda di {room}."
            anim = "Talk_Friendly"

    final_payload = {
        "agent_id": "receptionist",
        "agent_name": "Sarah (Receptionist)",
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
