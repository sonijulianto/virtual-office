"""
Supervisor Router:
Menentukan rute agen yang tepat berdasarkan target eksplisit, pilihan project workspace, atau isi pesan user.
"""

from typing import Dict, Any, Literal
from app.agents.state import OfficeState

AgentRoute = Literal[
    "receptionist",
    "marketing",
    "developer",
    "manager",
    "faisal",
    "syaugi",
    "guntara",
    "lisa",
]


def route_supervisor(state: OfficeState) -> AgentRoute:
    """
    Menentukan node agen berikutnya yang akan dipanggil.
    """
    target = (state.get("target_agent") or "auto").lower()
    proj_ws = (state.get("project_workspace") or "auto").lower()

    # 1. Jika user memilih agen secara eksplisit di UI:
    if target in ["faisal", "faisal ravaneli", "one-asco"]:
        return "faisal"
    if target in ["syaugi", "syaugi askar", "tpf", "tpf_pos_mobile"]:
        return "syaugi"
    if target in ["guntara", "guntara gumelar", "pivore", "pivore_mobile"]:
        return "guntara"
    if target in ["receptionist", "sarah", "frontdesk", "lobby"]:
        return "receptionist"
    if target in ["marketing", "clara", "creative", "content"]:
        return "marketing"
    if target in ["developer", "dev", "alex", "tech", "it"]:
        return "developer"
    if target in ["manager", "budi", "pm", "project"]:
        return "manager"
    if target in ["lisa", "finance", "keuangan", "akuntan", "bendahara"]:
        return "lisa"

    # 2. Deteksi dari isi pesan & nama file media (nama developer atau nama project spesifik):
    last_msg = state["messages"][-1].content.lower() if state["messages"] else ""
    file_name = (state.get("file_name") or "").lower()
    combined_query = f"{last_msg} {file_name}"
    room = state.get("room_location", "Lobby").lower()

    if any(k in combined_query for k in ["faisal", "ravaneli", "one-asco", "one asco", "asco"]):
        return "faisal"
    if any(k in combined_query for k in ["syaugi", "askar", "tpf", "tpf_pos", "pos mobile"]):
        return "syaugi"
    if any(k in combined_query for k in ["guntara", "gumelar", "pivore"]):
        return "guntara"

    # 3. Jika target == "auto" tetapi user sedang memilih Project Workspace spesifik di Dropdown UI:
    if "one-asco" in proj_ws:
        return "faisal"
    if "tpf" in proj_ws:
        return "syaugi"
    if "pivore" in proj_ws:
        return "guntara"

    # 4. Heuristik Divisi Umum:
    finance_keywords = [
        "lisa", "keuangan", "finance", "bca", "bri", "mutasi", "uang masuk",
        "uang keluar", "pembayaran", "sonijulianto", "rekening", "saldo",
        "transfer", "qris", "debit", "kredit", "tagihan", "invoice", "cashflow", "duit",
        "struk", "bukti", "kwitansi", "nota", "faktur"
    ]
    if any(k in combined_query for k in finance_keywords):
        return "lisa"

    marketing_keywords = [
        "konten", "content", "reels", "tiktok", "instagram", "medsos", "sosial media",
        "iklan", "ads", "copywriting", "caption", "kampanye", "campaign", "viral",
        "branding", "clara", "hook", "audiens", "flyer", "poster", "banner", "thumbnail", "video"
    ]
    if any(k in combined_query for k in marketing_keywords):
        return "marketing"

    developer_keywords = [
        "kode", "code", "coding", "bug", "error", "api", "database", "backend",
        "frontend", "server", "socket", "threejs", "unreal", "python", "deploy",
        "arsitektur", "alex", "stack", "git", "latency", "fitur", "screenshot", "screen", "overflow", "pixel"
    ]
    if any(k in combined_query for k in developer_keywords):
        return "developer"

    manager_keywords = [
        "proyek", "project", "sprint", "deadline", "timeline", "jadwal", "meeting agenda",
        "prioritas", "evaluasi", "budi", "task", "tugas", "laporan", "gantt", "roadmap"
    ]
    if any(k in combined_query for k in manager_keywords):
        return "manager"

    receptionist_keywords = [
        "tamu", "pengunjung", "buku tamu", "lobby", "toilet", "kamar kecil", "lantai",
        "kantin", "kopi", "fasilitas", "sarah", "arah", "selamat datang", "halo", "hai"
    ]
    if any(k in last_msg for k in receptionist_keywords):
        return "receptionist"

    if "marketing" in room or "creative" in room:
        return "marketing"
    if "finance" in room or "keuangan" in room:
        return "lisa"
    if "tech" in room or "dev" in room:
        return "developer"
    if "meeting" in room or "rapat" in room:
        return "manager"

    return "receptionist"


async def supervisor_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node pencatat keputusan router.
    """
    next_node = route_supervisor(state)
    return {
        "next_agent": next_node
    }
