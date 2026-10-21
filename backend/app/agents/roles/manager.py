"""
Project Manager Agent: "Budi"
Bertanggung jawab atas koordinasi tugas, deadline sprint, jadwal rapat, dan manajemen proyek.
"""

from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState


MANAGER_SYSTEM_PROMPT = """
Anda adalah "Budi", Senior Project Manager AI di kantor virtual 3D ini.
Karakter: Profesional, terstruktur, fokus pada produktivitas dan solusi teknis.

Tugas & Wewenang:
- Mengatur agenda meeting dan sprint planning.
- Membantu pembagian tugas tim teknis dan deadline.
- Memberikan update status project kantor virtual.

Informasi Sprint Tim Saat Ini:
- Sprint 3: Integrasi Realtime AI Kantor Virtual (Progress 85%).
- Milestone Aktif: Koneksi Socket.IO ke Web 3D dan persiapan plugin Unreal Engine 5.
- Target Rilis Versi Alpha: Jumat pekan ini.
- Prioritas Tugas Tim: Optimasi animasi avatar 3D dan penambahan fitur Text-to-Speech (TTS).

Instruksi Khusus:
1. Jawab secara padat, profesional, dan to-the-point (maksimal 2-3 kalimat).
2. Tentukan trigger animasi yang paling pas untuk avatar 3D:
   - "Talk_Professional" saat memberikan update / menjawab status.
   - "Think" saat menganalisis jadwal atau mengevaluasi tantangan teknis.
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


async def invoke_gemini(messages, temperature=0.4) -> str:
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


async def manager_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node LangGraph untuk Project Manager (Budi) — Ditenagai Hermes Agent + Gemini Flash.
    Mendukung koordinasi multi-agent: Mengumpulkan laporan dari Faisal, Syaugi, dan Guntara,
    mengompilasinya, serta mengirimkan/menyiapkan notifikasi WhatsApp untuk user.
    """
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Meeting Room")
    msg_lower = user_msg.lower()

    # Deteksi apakah user meminta laporan developer atau pengiriman ke WhatsApp
    is_report_request = (
        any(w in msg_lower for w in ["report", "laporan", "progres", "standup", "rekap", "kerjaan"])
        and any(w in msg_lower for w in ["faisal", "syaugi", "guntara", "developer", "tim", "fullstack", "whatsapp", "wa"])
    ) or ("whatsapp" in msg_lower and any(w in msg_lower for w in ["kirim", "budi", "dev", "lapor", "report", "bisa"]))

    if is_report_request:
        import re, os
        from app.agents.roles.report_workflow import compile_and_save_daily_report

        # Ekstrak nomor HP jika ada (misal: 08123456789)
        phones = re.findall(r"(?:08|\+?628)\d{8,12}", user_msg)
        target_phone = phones[0] if phones else os.getenv("WHATSAPP_PHONE_NUMBER", "")

        rep_result = compile_and_save_daily_report(target_phone=target_phone)
        wa_url = rep_result["wa_url"]
        devs = rep_result["dev_data"]

        auto_note = (
            f"✅ **Pesan otomatis telah terkirim via WhatsApp Gateway ke nomor {target_phone}!**"
            if rep_result.get("auto_sent")
            else f"📲 **Tautan WhatsApp Siap Kirim (Sekali Klik):**\n👉 [Klik di Sini untuk Buka di WhatsApp]({wa_url})"
        )

        report_reply = (
            f"**Tentu bisa sekali, Pak! Ini use-case koordinasi multi-agent yang sangat tepat.**\n\n"
            f"Saya (Budi) baru saja menghubungi ketiga Fullstack Developer (**Faisal**, **Syaugi**, dan **Guntara**) "
            f"dan mengumpulkan rangkuman pekerjaan terbaru langsung dari repositori lokal mereka:\n\n"
            f"1. 📱 **Faisal Ravaneli** (`one-asco-ecosystem/mobile`):\n"
            f"   • **Branch Aktif:** `{devs['faisal']['branch']}`\n"
            f"   • **Pekerjaan:** {devs['faisal']['progress']}\n"
            f"   • **Status:** {devs['faisal']['status']}\n\n"
            f"2. 🏪 **Syaugi Askar** (`tpf_pos_mobile`):\n"
            f"   • **Branch Aktif:** `{devs['syaugi']['branch']}`\n"
            f"   • **Pekerjaan:** {devs['syaugi']['progress']}\n"
            f"   • **Status:** {devs['syaugi']['status']}\n\n"
            f"3. 📦 **Guntara Gumelar** (`pivore_mobile`):\n"
            f"   • **Branch Aktif:** `{devs['guntara']['branch']}`\n"
            f"   • **Pekerjaan:** {devs['guntara']['progress']}\n"
            f"   • **Status:** {devs['guntara']['status']}\n\n"
            f"📁 **Arsip Fisik Kantor:** Salinan laporan lengkap otomatis saya simpan di `office_workspace/LAPORAN_HARIAN_DEVELOPER.md`.\n\n"
            f"{auto_note}\n\n"
            f"*(Tips: Anda juga bisa menghubungkan gateway API WhatsApp seperti Fonnte/Twilio di file `.env` jika ingin laporan ini terkirim otomatis tanpa perlu klik manual!)*"
        )

        return {
            "final_response": {
                "agent_id": "manager",
                "agent_name": "Budi (Project Manager)",
                "text": report_reply,
                "animation_trigger": "Talk_Professional",
                "action_type": "gesture",
                "target_waypoint": None,
                "audio_url": None,
                "hermes_tools_used": ["git_status", "compile_report", "whatsapp_dispatch"],
                "hermes_model": get_gemini_model(),
            }
        }

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
            agent_id="manager",
            agent_name="Budi",
            role_system_prompt=MANAGER_SYSTEM_PROMPT,
        )
        tools_used = ["multimodal_vision_analyzer", "roadmap_evaluator"]
        active_model = "gemini-3.5-flash-lite"
    else:
        from app.agents.hermes_bridge import run_hermes_division_agent
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id="manager",
            role_system_prompt=MANAGER_SYSTEM_PROMPT,
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
        )

        if not text_response:
            messages = [
                SystemMessage(content=MANAGER_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Konteks: Anggota tim '{user_id}' berdiskusi di '{room}'.\nPesan: {user_msg}\n\nJawablah dengan gaya manajerial yang solutif."
                )
            ]
            text_response = await invoke_gemini(messages, temperature=0.4)

    if text_response:
        import re
        text_response = re.sub(r'\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]', '', text_response, flags=re.IGNORECASE)
        text_response = re.sub(r'\[(Talk_Friendly|Talk_Professional|Think|Wave)\]', '', text_response, flags=re.IGNORECASE).strip()
        anim = "Think" if any(w in user_msg.lower() for w in ["deadline", "evaluasi", "masalah", "bug", "analisis"]) else "Talk_Professional"
    else:
        # Fallback Mock / Offline Mode
        msg_lower = user_msg.lower()
        if any(w in msg_lower for w in ["sprint", "progres", "status", "update"]):
            text_response = "Status sprint kita saat ini on-track. Milestone utama adalah integrasi Unreal Engine dengan multi-agent LangGraph."
            anim = "Talk_Professional"
        elif any(w in msg_lower for w in ["deadline", "jadwal", "kapan"]):
            text_response = "Target rilis internal akhir pekan ini. Pastikan modul Socket.io dan blueprint animasi sudah teruji dengan baik."
            anim = "Think"
        elif any(w in msg_lower for w in ["tugas", "task", "kerjaan"]):
            text_response = "Prioritas sekarang adalah pengujian event bridge antara UE5 dan backend. Silakan cek board tugas di ruang rapat."
            anim = "Talk_Professional"
        else:
            text_response = f"Baik, saya catat. Mari kita pastikan eksekusinya tepat waktu. Ada hal lain yang perlu kita diskusikan di {room}?"
            anim = "Talk_Professional"

    final_payload = {
        "agent_id": "manager",
        "agent_name": "Budi (Project Manager)",
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
