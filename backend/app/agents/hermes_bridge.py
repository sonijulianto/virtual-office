"""
Hermes Agent Bridge (NousResearch/hermes-agent + Google Gemini Flash)
Menghubungkan setiap agen divisi & Fullstack Developer di Kantor Virtual 3D:
- Sarah (Receptionist)
- Clara (Marketing)
- Alex (Tech Lead)
- Budi (Project Manager)
- Faisal Ravaneli (Fullstack Developer — Project: one-asco-ecosystem/mobile)
- Syaugi Askar (Fullstack Developer — Project: tpf_pos_mobile)
- Guntara Gumelar (Fullstack Developer — Project: pivore_mobile)
"""

import os
import sys
import re
import time
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from app.config import get_gemini_api_key, get_gemini_model

logger = logging.getLogger("hermes_bridge")

# Tambahkan path repositori hermes_agent ke sys.path
HERMES_REPO_DIR = Path(__file__).resolve().parents[2] / "hermes_agent"
OFFICE_WORKSPACE_DIR = Path(__file__).resolve().parents[3] / "office_workspace"
OFFICE_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

if str(HERMES_REPO_DIR) not in sys.path:
    sys.path.insert(0, str(HERMES_REPO_DIR))

GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

# Cache model Gemini Flash yang sedang responsif di endpoint OpenAI-compatible
_cached_active_model: Optional[str] = None
_cached_model_ts: float = 0.0

# Mapping folder project default untuk masing-masing agen
AGENT_DEFAULT_WORKSPACES: Dict[str, str] = {
    "faisal": "/Users/magnatech/project/one-asco-ecosystem/mobile",
    "syaugi": "/Users/magnatech/tpf_pos_mobile",
    "guntara": "/Users/magnatech/project/pivore_mobile",
    "developer": "/Users/magnatech/project/SONI/kantor_virtual_3d",
    "manager": str(OFFICE_WORKSPACE_DIR),
    "receptionist": str(OFFICE_WORKSPACE_DIR),
    "marketing": str(OFFICE_WORKSPACE_DIR),
}

# Mapping toolsets per agen di Kantor Virtual 3D
ROLE_TOOLSETS: Dict[str, List[str]] = {
    "receptionist": ["memory", "todo", "file", "skills"],
    "marketing": ["memory", "todo", "file", "skills"],
    "developer": ["memory", "todo", "file", "skills", "terminal"],
    "manager": ["memory", "todo", "file", "skills", "terminal"],
    "faisal": ["memory", "todo", "file", "skills", "terminal"],
    "syaugi": ["memory", "todo", "file", "skills", "terminal"],
    "guntara": ["memory", "todo", "file", "skills", "terminal"],
}

# Label aktivitas Bahasa Indonesia saat Hermes mengeksekusi tool
TOOL_ACTIVITY_LABELS: Dict[str, str] = {
    "memory": "🧠 Hermes: Menyimpan/Membaca Memory...",
    "read_file": "📖 Hermes: Membaca file kode project...",
    "write_file": "✍️ Hermes: Menulis file baru di project...",
    "patch": "🔧 Hermes: Mengedit/Patch kode project...",
    "search_files": "🔍 Hermes: Mencari kode di project...",
    "todo_list": "📋 Hermes: Menyusun Todo List...",
    "skills_list": "⚡ Hermes: Mengecek daftar Skill...",
    "skill_view": "⚡ Hermes: Membaca modul Skill...",
    "skill_manage": "🚀 Hermes: Membuat/Mengupdate Skill baru...",
    "terminal": "💻 Hermes: Menjalankan command Terminal...",
    "process_manage": "⚙️ Hermes: Mengelola proses sistem...",
}


def list_available_projects() -> List[Dict[str, str]]:
    """
    Mendeteksi daftar folder project di Mac user (/Users/magnatech/project, dll.)
    untuk ditampilkan pada Dropdown Pemilih Project di UI 3D.
    """
    projects: List[Dict[str, str]] = [
        {
            "id": "auto",
            "name": "🎯 Otomatis (Sesuai Pegangan Agen)",
            "path": "auto",
        },
        {
            "id": "one-asco-mobile",
            "name": "📱 one-asco-ecosystem/mobile (Faisal Ravaneli)",
            "path": "/Users/magnatech/project/one-asco-ecosystem/mobile",
        },
        {
            "id": "one-asco-root",
            "name": "🌐 one-asco-ecosystem [Fullstack Root] (Faisal)",
            "path": "/Users/magnatech/project/one-asco-ecosystem",
        },
        {
            "id": "tpf_pos_mobile",
            "name": "🏪 tpf_pos_mobile (Syaugi Askar)",
            "path": "/Users/magnatech/tpf_pos_mobile",
        },
        {
            "id": "pivore_mobile",
            "name": "📦 pivore_mobile (Guntara Gumelar)",
            "path": "/Users/magnatech/project/pivore_mobile",
        },
    ]

    seen_paths = {p["path"] for p in projects}
    base_dir = Path("/Users/magnatech/project")
    if base_dir.exists():
        for item in sorted(base_dir.iterdir()):
            if item.is_dir() and not item.name.startswith(".") and item.name not in ("flutter", "SONI"):
                p_str = str(item)
                if p_str not in seen_paths:
                    projects.append({
                        "id": item.name,
                        "name": f"📁 {item.name}",
                        "path": p_str,
                    })
                    seen_paths.add(p_str)

    soni_dir = base_dir / "SONI"
    if soni_dir.exists():
        for item in sorted(soni_dir.iterdir()):
            if item.is_dir() and not item.name.startswith("."):
                p_str = str(item)
                if p_str not in seen_paths:
                    projects.append({
                        "id": f"soni-{item.name}",
                        "name": f"🏢 SONI/{item.name}",
                        "path": p_str,
                    })
                    seen_paths.add(p_str)

    return projects


def resolve_agent_workspace(agent_id: str, requested_workspace: Optional[str] = None) -> str:
    """Menentukan direktori kerja (cwd) untuk agen Hermes."""
    if requested_workspace and requested_workspace != "auto":
        req_path = Path(requested_workspace)
        if req_path.exists() and req_path.is_dir():
            return str(req_path)

    default_path = AGENT_DEFAULT_WORKSPACES.get(agent_id, str(OFFICE_WORKSPACE_DIR))
    if Path(default_path).exists():
        return default_path
    return str(OFFICE_WORKSPACE_DIR)


def _select_best_gemini_flash_model(api_key: str) -> str:
    """
    Memilih model Gemini Flash terbaik (prioritas utama: gemini-3.8-flash).
    Jika gemini-3.8-flash sedang mengalami lonjakan trafik (HTTP 503 / timeout > 3.5s)
    pada endpoint OpenAI-compatible milik Google, otomatis beralih ke gemini-3.6-flash
    atau gemini-3.5-flash-lite agar agen Hermes merespons cepat tanpa delay panjang.
    """
    global _cached_active_model, _cached_model_ts
    now = time.time()
    if _cached_active_model and (now - _cached_model_ts) < 90:
        return _cached_active_model

    import httpx

    primary = get_gemini_model() or "gemini-3.8-flash"
    candidates = [primary, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    seen = []
    for m in candidates:
        if m not in seen:
            seen.append(m)

    for model_name in seen:
        try:
            resp = httpx.post(
                f"{GEMINI_OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 5,
                },
                timeout=3.8,
            )
            if resp.status_code == 200:
                _cached_active_model = model_name
                _cached_model_ts = now
                logger.info(f"⚡ [Hermes Bridge] Model aktif terpilih: {model_name}")
                return model_name
        except Exception:
            continue

    return "gemini-3.6-flash"


def clean_hermes_response(text: str) -> str:
    """Membersihkan tag animasi internal dari teks balasan agar rapi di balon chat 3D."""
    if not text:
        return ""
    text = re.sub(r"\[(Trigger|Action|Animasi|Animation|Anim):\s*.*?\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\[(Talk_Friendly|Talk_Professional|Think|Wave|Walk)\]", "", text, flags=re.IGNORECASE)
    return text.strip()


def parse_tool_details(tool_name: str, args: Any, target_cwd: str) -> Dict[str, Any]:
    """
    Menganalisis parameter tool (read_file, patch, write_file, terminal)
    agar menghasilkan metadata terstruktur seperti Antigravity:
    - Nama file yang dibaca/diedit
    - Nomor baris awal & akhir (line range)
    - Preview potongan kode lama dan kode baru (diff preview)
    """
    details: Dict[str, Any] = {
        "file_path": "",
        "rel_path": "",
        "start_line": None,
        "end_line": None,
        "line_range": "",
        "action_type": "other",
        "command": "",
        "old_code": "",
        "new_code": "",
        "display_label": "",
    }

    arg_dict: Dict[str, Any] = {}
    if isinstance(args, dict):
        arg_dict = args
    elif isinstance(args, str):
        try:
            import json
            arg_dict = json.loads(args)
        except Exception:
            arg_dict = {"raw": args}

    def make_rel(p: str) -> str:
        if not p:
            return ""
        try:
            p_obj = Path(p)
            if not p_obj.is_absolute():
                return p
            cwd_obj = Path(target_cwd)
            if p_obj.is_relative_to(cwd_obj):
                return str(p_obj.relative_to(cwd_obj))
        except Exception:
            pass
        return p.split("/")[-1] if "/" in p else p

    t_lower = tool_name.lower()

    if any(k in t_lower for k in ["read_file", "read"]):
        details["action_type"] = "read"
        raw_path = str(arg_dict.get("path") or arg_dict.get("file_path") or "")
        details["file_path"] = raw_path
        details["rel_path"] = make_rel(raw_path)

        offset = arg_dict.get("offset") or arg_dict.get("start_line") or 1
        limit = arg_dict.get("limit") or arg_dict.get("end_line")
        try:
            offset_int = int(offset)
            details["start_line"] = offset_int
            if limit:
                limit_int = int(limit)
                details["end_line"] = offset_int + limit_int - 1 if limit_int < 2000 else offset_int + limit_int
                details["line_range"] = f"Baris {details['start_line']}–{details['end_line']}"
            else:
                details["line_range"] = f"Mulai baris {offset_int}"
        except Exception:
            details["line_range"] = ""

        if details["rel_path"]:
            details["display_label"] = (
                f"Membaca {details['rel_path']} ({details['line_range']})"
                if details["line_range"]
                else f"Membaca {details['rel_path']}"
            )
        else:
            details["display_label"] = "Membaca file project..."

    elif any(k in t_lower for k in ["patch", "edit", "write_file", "write"]):
        details["action_type"] = "edit"
        raw_path = str(arg_dict.get("path") or arg_dict.get("file_path") or "")
        details["file_path"] = raw_path
        details["rel_path"] = make_rel(raw_path)

        old_str = arg_dict.get("old_string") or arg_dict.get("target") or ""
        new_str = arg_dict.get("new_string") or arg_dict.get("content") or arg_dict.get("replacement") or arg_dict.get("patch") or ""
        details["old_code"] = str(old_str)[:800] if old_str else ""
        details["new_code"] = str(new_str)[:800] if new_str else ""

        if details["rel_path"]:
            details["display_label"] = f"Memodifikasi kode di {details['rel_path']}"
        else:
            details["display_label"] = "Menerapkan perubahan kode di project..."

    elif any(k in t_lower for k in ["terminal", "command", "bash", "sh"]):
        details["action_type"] = "command"
        cmd = str(arg_dict.get("command") or arg_dict.get("cmd") or "")
        details["command"] = cmd
        details["display_label"] = f"Menjalankan command: {cmd[:65]}"

    elif any(k in t_lower for k in ["search_files", "search", "grep"]):
        details["action_type"] = "search"
        pat = str(arg_dict.get("pattern") or arg_dict.get("regex") or arg_dict.get("query") or "")
        details["display_label"] = f"Mencari kode: '{pat[:40]}'"

    else:
        details["display_label"] = TOOL_ACTIVITY_LABELS.get(tool_name, f"⚡ Hermes: {tool_name}...")

    return details


async def run_hermes_division_agent(
    agent_id: str,
    role_system_prompt: str,
    user_message: str,
    user_id: str = "player_1",
    room_location: str = "Lobby",
    project_workspace: Optional[str] = "auto",
) -> Tuple[str, List[str], str]:
    """
    Menjalankan Hermes AIAgent untuk agen tertentu.
    Mengembalikan tuple: (final_text, tools_used, active_model).
    """
    api_key = get_gemini_api_key()
    if not api_key:
        return "", [], ""

    os.environ["GEMINI_API_KEY"] = api_key
    os.environ["GOOGLE_API_KEY"] = api_key
    os.environ["GEMINI_BASE_URL"] = GEMINI_OPENAI_BASE_URL

    target_cwd = resolve_agent_workspace(agent_id, project_workspace)
    loop = asyncio.get_running_loop()
    tools_used: List[str] = []

    def emit_tool_status(tool_name: str, status: str, args_preview: Any = None, result: Any = None, call_id: str = ""):
        """Broadcast aktivitas tool Hermes secara real-time ke Frontend 3D via Socket.IO."""
        try:
            from app.socket_server import sio
            parsed = parse_tool_details(tool_name, args_preview, target_cwd)
            payload = {
                "agent_id": agent_id,
                "call_id": call_id or f"{tool_name}_{int(time.time()*1000)}",
                "tool_name": tool_name,
                "status": status,
                "activity_label": parsed["display_label"] or TOOL_ACTIVITY_LABELS.get(tool_name, f"⚡ Hermes: {tool_name}..."),
                "project_cwd": target_cwd,
                "file_path": parsed["rel_path"] or parsed["file_path"],
                "abs_path": parsed["file_path"],
                "start_line": parsed["start_line"],
                "end_line": parsed["end_line"],
                "line_range": parsed["line_range"],
                "action_type": parsed["action_type"],
                "old_code": parsed["old_code"],
                "new_code": parsed["new_code"],
                "command": parsed["command"],
                "result_preview": str(result)[:300] if result else "",
            }
            asyncio.run_coroutine_threadsafe(
                sio.emit("hermes_tool_event", payload),
                loop,
            )
        except Exception as e:
            logger.debug(f"Gagal emit hermes_tool_event: {e}")

    def _sync_run() -> Tuple[str, List[str], str]:
        active_model = _select_best_gemini_flash_model(api_key)
        from run_agent import AIAgent

        tool_args_cache = {}

        def on_tool_start(call_id: str, function_name: str, display_args: Any = None, *args, **kwargs):
            logger.info(f"🔧 [Hermes Tool Start] agent={agent_id} cwd={target_cwd} tool={function_name} args={display_args}")
            tools_used.append(function_name)
            tool_args_cache[call_id] = display_args
            emit_tool_status(function_name, "started", display_args, call_id=call_id)

        def on_tool_complete(call_id: str, function_name: str, display_args: Any = None, result: Any = None, *args, **kwargs):
            logger.info(f"✅ [Hermes Tool Complete] agent={agent_id} tool={function_name}")
            args_to_use = display_args if display_args is not None else tool_args_cache.get(call_id)
            comp_res = result if result is not None else (args[0] if len(args) > 0 else None)
            emit_tool_status(function_name, "completed", args_to_use, result=comp_res, call_id=call_id)

        hermes_ephemeral_prompt = (
            f"{role_system_prompt.strip()}\n\n"
            f"=== INSTRUKSI INTERAKSI CODING OTONOM (ANTIGRAVITY STYLE) ===\n"
            f"- Anda memiliki kapabilitas penuh seperti Antigravity untuk MEMBACA dan LANGSUNG MENGUBAH KODE NYATA di repositori lokal `{target_cwd}`.\n"
            f"- 1. KETIKA INGIN MEMERIKSA / MEMBACA KODE: Gunakan tool `read_file` dengan parameter `path`, `offset` (nomor baris mulai), dan `limit` (jumlah baris). Ini memungkinkan user tahu persis file apa dan baris berapa yang sedang Anda periksa secara live.\n"
            f"- 2. KETIKA DIMINTA MENGUBAH / MEMPERBAIKI KODE / MENAMBAH FITUR: JANGAN HANYA MENJAWAB TEKS! Anda WAJIB LANGSUNG MERUBAH KODE NYATA pada file tersebut menggunakan tool `patch` (dengan `path`, `old_string`, dan `new_string`) atau `write_file`.\n"
            f"- 3. KETIKA INGIN MEMERIKSA STRUKTUR / DEPENDENCY / ERROR: Anda bisa menggunakan tool `search_files` atau `terminal` (misal: `flutter analyze`, `git status`, dll.).\n"
            f"- 4. LAPORAN AKHIR: Sebutkan dengan jelas file apa yang Anda baca (beserta nomor barisnya) dan perubahan apa yang berhasil Anda terapkan di project."
        )

        enabled_tools = ROLE_TOOLSETS.get(agent_id, ["memory", "todo", "file", "skills", "terminal"])

        agent = AIAgent(
            provider="gemini",
            base_url=GEMINI_OPENAI_BASE_URL,
            api_key=api_key,
            model=active_model,
            fallback_model={
                "provider": "gemini",
                "model": "gemini-3.5-flash-lite",
                "base_url": GEMINI_OPENAI_BASE_URL,
                "api_key": api_key,
            },
            enabled_toolsets=enabled_tools,
            ephemeral_system_prompt=hermes_ephemeral_prompt,
            quiet_mode=True,
            skip_background_review=True,
            max_iterations=8,
            cwd=target_cwd,
            tool_start_callback=on_tool_start,
            tool_complete_callback=on_tool_complete,
        )

        contextual_message = (
            f"[Konteks Kantor 3D: User '{user_id}' | Project Aktif: '{target_cwd}']\n"
            f"Instruksi User: {user_message}"
        )

        result = agent.run_conversation(
            user_message=contextual_message,
            task_id=f"office-{agent_id}-{int(time.time())}",
        )
        final_resp = clean_hermes_response(result.get("final_response", ""))
        if final_resp.startswith("Google AI Studio ") or "rate-limited every one" in final_resp:
            return "", tools_used, active_model
        return final_resp, tools_used, active_model

    try:
        return await asyncio.to_thread(_sync_run)
    except Exception as exc:
        logger.warning(f"⚠️ [Hermes Bridge] Error saat menjalankan AIAgent ({agent_id}): {exc}")
        return "", tools_used, ""


def get_hermes_status_summary() -> Dict[str, Any]:
    """Mengambil ringkasan status Hermes Agent, Memory, dan daftar Project."""
    memory_path = Path.home() / ".hermes" / "memories" / "MEMORY.md"
    user_mem_path = Path.home() / ".hermes" / "memories" / "USER.md"

    memories = []
    if memory_path.exists():
        content = memory_path.read_text(encoding="utf-8", errors="ignore").strip()
        if content:
            memories.extend([line.strip() for line in content.splitlines() if line.strip()])
    if user_mem_path.exists():
        content = user_mem_path.read_text(encoding="utf-8", errors="ignore").strip()
        if content:
            memories.extend([f"[User] {line.strip()}" for line in content.splitlines() if line.strip()])

    workspace_files = []
    if OFFICE_WORKSPACE_DIR.exists():
        for f in sorted(OFFICE_WORKSPACE_DIR.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                workspace_files.append({
                    "name": f.name,
                    "size_bytes": f.stat().st_size,
                })

    return {
        "hermes_installed": HERMES_REPO_DIR.exists(),
        "primary_model": get_gemini_model() or "gemini-3.8-flash",
        "active_model": _cached_active_model or (get_gemini_model() or "gemini-3.8-flash"),
        "memories": memories,
        "workspace_dir": str(OFFICE_WORKSPACE_DIR),
        "workspace_files": workspace_files,
        "agent_workspaces": AGENT_DEFAULT_WORKSPACES,
        "available_projects": list_available_projects(),
    }
