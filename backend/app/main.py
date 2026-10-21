"""
Main Application Entrypoint: FastAPI + Socket.IO ASGI Application.
"""

import asyncio
import logging
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from app.socket_server import sio
from app.config import HOST, PORT, get_gemini_api_key, get_gemini_model

logger = logging.getLogger("main")

fastapi_app = FastAPI(
    title="3D Virtual Office AI Backend",
    description="Real-time multi-agent backend powering Unreal Engine 5 virtual office avatars using LangGraph & Socket.IO",
    version="1.0.0",
)

# Aktifkan CORS untuk kemudahan pengujian
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from pathlib import Path
import shutil
import uuid
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi import UploadFile, File, Form, HTTPException

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

UPLOAD_DIR = STATIC_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@fastapi_app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Endpoint untuk menerima unggahan file gambar atau video dari user,
    disimpan di backend/static/uploads/ dan dianalisis oleh agen multimodal.
    """
    try:
        orig_name = file.filename or "media_upload"
        ext = Path(orig_name).suffix.lower()
        if not ext:
            # Tebak dari content type jika ada
            if file.content_type and "video" in file.content_type:
                ext = ".mp4"
            else:
                ext = ".png"

        # Buat nama file unik dan aman
        safe_base = Path(orig_name).stem.replace(" ", "_")[:30]
        unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}_{safe_base}{ext}"
        dest_path = UPLOAD_DIR / unique_filename

        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = dest_path.stat().st_size
        mime = file.content_type or "application/octet-stream"

        from app.multimodal_service import detect_media_kind
        media_kind = detect_media_kind(mime, str(dest_path))

        file_url = f"/static/uploads/{unique_filename}"
        logger.info(f"📁 [Upload Berhasil] {dest_path.name} | Kind: {media_kind} | Size: {file_size} bytes | Mime: {mime}")

        return {
            "status": "success",
            "file_url": file_url,
            "file_path": str(dest_path.resolve()),
            "file_name": orig_name,
            "media_type": media_kind,
            "mime_type": mime,
            "size": file_size,
        }
    except Exception as e:
        logger.error(f"❌ Gagal mengunggah file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gagal mengunggah file: {str(e)}")

@fastapi_app.get("/")
async def root():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "status": "online",
        "service": "3D Virtual Office AI Backend",
        "llm_engine": "Google Gemini" if GEMINI_API_KEY else "Mock Offline Mode",
        "model": GEMINI_MODEL if GEMINI_API_KEY else "mock",
        "socket_endpoint": "ws://localhost:8000/socket.io/",
    }


@fastapi_app.get("/health")
async def health_check():
    key = get_gemini_api_key()
    return {
        "status": "healthy",
        "gemini_configured": bool(key),
        "model": get_gemini_model(),
        "hermes_agent": True,
    }


@fastapi_app.get("/api/hermes/status")
async def hermes_status():
    from app.agents.hermes_bridge import get_hermes_status_summary
    return get_hermes_status_summary()

@fastapi_app.on_event("startup")
async def on_startup():
    from app.scheduler import start_scheduler
    from app.email_watcher import start_email_watcher
    start_scheduler()
    start_email_watcher()


@fastapi_app.get("/api/schedule/status")
async def schedule_status():
    from app.scheduler import get_scheduler_info
    return get_scheduler_info()


@fastapi_app.post("/api/schedule/trigger")
async def schedule_trigger(phone: str = ""):
    from app.scheduler import execute_daily_report_job
    res = await execute_daily_report_job(phone_override=phone, trigger_type="manual_api_trigger")
    return res


@fastapi_app.post("/api/schedule/config")
async def schedule_config_update(data: dict):
    from app.scheduler import SCHEDULE_CONFIG
    if "time" in data and data["time"]:
        SCHEDULE_CONFIG["time"] = data["time"].strip()
    if "phone" in data:
        SCHEDULE_CONFIG["phone"] = data["phone"].strip()
    if "fonnte_token" in data:
        SCHEDULE_CONFIG["fonnte_token"] = data["fonnte_token"].strip()
    if "enabled" in data:
        SCHEDULE_CONFIG["enabled"] = bool(data["enabled"])
    from app.scheduler import get_scheduler_info
    return {"status": "updated", "config": get_scheduler_info()}


@fastapi_app.get("/api/finance/status")
async def finance_status():
    from app.agents.roles.finance_lisa import check_and_reconcile_transactions
    return check_and_reconcile_transactions()


@fastapi_app.get("/api/finance/watcher-status")
async def finance_watcher_status():
    from app.email_watcher import get_email_watcher
    return get_email_watcher().get_status()


@fastapi_app.post("/api/finance/email-config")
async def finance_email_config_update(data: dict):
    from app.email_watcher import save_email_credentials, get_email_watcher
    user = data.get("email", "").strip() or "sonijulianto@gmail.com"
    pwd = data.get("app_password", "").strip()
    saved = save_email_credentials(user, pwd)
    # Segera uji coba koneksi
    watcher = get_email_watcher()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, watcher.poll_imap_inbox)
    return {
        "status": "success" if saved else "failed",
        "saved": saved,
        "watcher_status": watcher.get_status()
    }


@fastapi_app.post("/api/finance/simulate-email")
async def finance_simulate_email(data: dict = None):
    from app.email_watcher import get_email_watcher
    watcher = get_email_watcher()
    res = await watcher.simulate_incoming_email(custom=data)
    return res


@fastapi_app.post("/api/finance/check-now")
async def finance_check_now():
    from app.email_watcher import get_email_watcher
    watcher = get_email_watcher()
    loop = asyncio.get_event_loop()
    new_trxs = await loop.run_in_executor(None, watcher.poll_imap_inbox)
    for trx in new_trxs:
        from app.agents.roles.finance_lisa import record_new_transaction
        summary = record_new_transaction(trx)
        await watcher.broadcast_new_transaction(trx, summary)
    return {
        "status": "success",
        "new_transactions_count": len(new_trxs),
        "watcher_status": watcher.get_status()
    }


@fastapi_app.post("/api/finance/trigger-report")
async def finance_trigger(phone: str = ""):
    from app.agents.roles.finance_lisa import compile_and_save_finance_report
    from app.scheduler import get_schedule_config, send_via_fonnte
    cfg = get_schedule_config()
    target_phone = phone or cfg["phone"]
    res = compile_and_save_finance_report(target_phone=target_phone)
    wa_sent = False
    if cfg["fonnte_token"] and target_phone:
        wa_sent = await send_via_fonnte(target_phone, res["wa_message"], cfg["fonnte_token"])
    res["wa_sent"] = wa_sent
    return res


@fastapi_app.post("/api/finance/reset-transactions")
async def finance_reset_transactions():
    from app.agents.roles.finance_lisa import clear_all_transactions
    summary = clear_all_transactions()
    try:
        from app.socket_server import sio
        await sio.emit("finance_transaction_received", {
            "transaction": None,
            "summary": summary,
            "reset": True,
            "timestamp": datetime.now().strftime("%H:%M:%S WIB"),
        })
        await sio.emit("agent_response", {
            "agent_id": "lisa",
            "agent_name": "Lisa (Finance Specialist)",
            "text": "🧹 **Data mutasi perbankan telah dibersihkan.**\n\nBuku kas kini dalam kondisi bersih (Rp 0). Saya siaga memantau email `sonijulianto@gmail.com` secara real-time untuk mencatat transaksi nyata berikutnya dari BCA dan BRI.",
            "animation_trigger": "Talk_Friendly",
            "action_type": "gesture",
            "target_waypoint": None,
            "audio_url": None,
            "hermes_tools_used": ["database_cleanse", "realtime_monitor_standby"]
        })
    except Exception as e:
        logger.debug(f"Socket emit reset error: {e}")
    return {
        "status": "success",
        "message": "Semua mutasi telah dibersihkan. Memulai pencatatan dari transaksi real.",
        "summary": summary
    }


# Mount static folder for assets, css, js
fastapi_app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# Gabungkan Socket.IO ASGI Server dengan FastAPI
combined_asgi_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=fastapi_app,
    socketio_path="socket.io",
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:combined_asgi_app", host=HOST, port=PORT, reload=True)
