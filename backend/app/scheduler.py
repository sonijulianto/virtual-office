"""
Background Scheduler untuk Laporan Otomatis Harian Jam 22:00 WIB (10 Malam).
1. Mengumpulkan laporan kerja harian dari Faisal, Syaugi, dan Guntara.
2. Budi (Project Manager) mengompilasi Executive Summary.
3. Mengirim otomatis ke WhatsApp via Gateway (Fonnte/Wablas) dan notifikasi macOS.
4. Menyimpan arsip di office_workspace/LAPORAN_HARIAN_DEVELOPER.md.
"""

import os
import asyncio
import logging
import subprocess
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any, Optional
import httpx

from app.config import get_gemini_model
from app.agents.roles.report_workflow import compile_and_save_daily_report
from app.agents.roles.finance_lisa import compile_and_save_finance_report, format_rupiah
from dotenv import load_dotenv

logger = logging.getLogger("scheduler")

ENV_FILE_PATH = Path(__file__).resolve().parent.parent / ".env"

def get_schedule_config() -> Dict[str, Any]:
    """Membaca konfigurasi jadwal langsung dari file .env secara dinamis."""
    load_dotenv(dotenv_path=ENV_FILE_PATH, override=True)
    return {
        "enabled": os.getenv("AUTO_DAILY_REPORT_ENABLED", "true").lower() in ["true", "1", "yes"],
        "time": os.getenv("AUTO_DAILY_REPORT_TIME", "22:00").strip(),
        "phone": os.getenv("WHATSAPP_PHONE_NUMBER", "089516789565").strip(),
        "fonnte_token": os.getenv("FONNTE_TOKEN", "").strip(),
    }

SCHEDULER_STATE: Dict[str, Any] = {
    "last_run_date": None,
    "last_run_timestamp": None,
    "last_run_status": "Belum pernah dijalankan sejak server aktif",
    "last_run_summary": None,
    "is_executing": False,
}

_scheduler_task: Optional[asyncio.Task] = None


def send_macos_notification(title: str, subtitle: str, message: str):
    """Memunculkan notifikasi banner desktop macOS."""
    try:
        # Sanitasi teks agar aman untuk AppleScript
        clean_msg = message.replace('"', '\\"').replace("\n", " ")[:120]
        clean_title = title.replace('"', '\\"')
        clean_sub = subtitle.replace('"', '\\"')
        cmd = f'display notification "{clean_msg}" with title "{clean_title}" subtitle "{clean_sub}" sound name "Glass"'
        subprocess.run(["osascript", "-e", cmd], capture_output=True, timeout=3)
    except Exception as e:
        logger.debug(f"Gagal memunculkan notifikasi macOS: {e}")


async def send_via_fonnte(target_phone: str, message: str, token: str) -> bool:
    """Mengirim pesan otomatis ke WhatsApp via API Fonnte."""
    if not (token and target_phone):
        return False

    clean_phone = "".join(filter(str.isdigit, target_phone))
    if clean_phone.startswith("0"):
        clean_phone = "62" + clean_phone[1:]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.fonnte.com/send",
                headers={"Authorization": token},
                data={
                    "target": clean_phone,
                    "message": message,
                    "countryCode": "62",
                },
            )
            data = resp.json()
            logger.info(f"📲 [WhatsApp Fonnte] Response: {data}")
            return bool(data.get("status") is True or resp.status_code == 200)
    except Exception as e:
        logger.error(f"❌ [WhatsApp Fonnte Error] Gagal kirim: {e}")
        return False


async def execute_daily_report_job(phone_override: str = "", trigger_type: str = "scheduled") -> Dict[str, Any]:
    """
    Eksekutor utama pengumpulan dan pengiriman laporan harian jam 10 malam.
    """
    if SCHEDULER_STATE["is_executing"]:
        return {"status": "busy", "message": "Job laporan sedang berjalan saat ini"}

    SCHEDULER_STATE["is_executing"] = True
    now = datetime.now()
    now_str = now.strftime("%d %B %Y - %H:%M WIB")
    logger.info(f"🚀 [Auto-Report 22:00] Memulai pengumpulan laporan harian ({trigger_type})...")

    try:
        cfg = get_schedule_config()
        target_phone = phone_override or cfg["phone"]
        fonnte_token = cfg["fonnte_token"]

        # 1. Budi mengompilasi laporan dari Faisal, Syaugi, dan Guntara
        report_data = compile_and_save_daily_report(target_phone=target_phone)
        wa_message = report_data["wa_message"]
        wa_url = report_data["wa_url"]
        devs = report_data["dev_data"]

        # 2. Lisa mengompilasi laporan keuangan transaksi BCA & BRI dari email sonijulianto@gmail.com
        finance_data = compile_and_save_finance_report(target_phone=target_phone)
        fin_summary = finance_data["summary"]
        wa_finance_message = finance_data["wa_message"]
        wa_finance_url = finance_data["wa_url"]

        # 3. Pengiriman via WhatsApp Gateway (jika token tersedia)
        wa_sent = False
        wa_fin_sent = False
        if fonnte_token and target_phone:
            wa_sent = await send_via_fonnte(target_phone, wa_message, fonnte_token)
            await asyncio.sleep(1.5)
            wa_fin_sent = await send_via_fonnte(target_phone, wa_finance_message, fonnte_token)

        # 4. Notifikasi Native macOS Desktop
        notif_msg = f"Developer: Faisal, Syaugi, Guntara. Finance: Masuk {format_rupiah(fin_summary['total_incoming'])}, Keluar {format_rupiah(fin_summary['total_outgoing'])}."
        send_macos_notification(
            title="🏢 AI Kantor Virtual (Jam 10 Malam)",
            subtitle="⏰ Laporan Harian Developer & Keuangan",
            message=notif_msg,
        )

        # 5. Broadcast pengumuman Budi & Lisa ke 3D Virtual Office via Socket.IO
        try:
            from app.socket_server import sio
            broadcast_text = (
                f"⏰ **[OTOMATIS JAM 10 MALAM] Laporan Harian Seluruh Tim Fullstack Developer Telah Siap!**\n\n"
                f"Saya (Budi) telah merekap seluruh progres hari ini dari repositori lokal:\n"
                f"• 📱 **Faisal Ravaneli** (`{devs['faisal']['project']}`): {devs['faisal']['progress']}\n"
                f"• 🏪 **Syaugi Askar** (`{devs['syaugi']['project']}`): {devs['syaugi']['progress']}\n"
                f"• 📦 **Guntara Gumelar** (`{devs['guntara']['project']}`): {devs['guntara']['progress']}\n\n"
                f"📁 Laporan tersimpan di: `office_workspace/LAPORAN_HARIAN_DEVELOPER.md`\n\n"
                + (
                    f"✅ **Laporan developer otomatis telah terkirim ke WhatsApp {target_phone}!**"
                    if wa_sent
                    else f"📲 **Buka WhatsApp:**\n👉 [Klik di Sini untuk Kirim ke WhatsApp]({wa_url})"
                )
            )

            await sio.emit("agent_response", {
                "agent_id": "manager",
                "agent_name": "Budi (Project Manager)",
                "text": broadcast_text,
                "animation_trigger": "Talk_Professional",
                "action_type": "gesture",
                "target_waypoint": None,
                "audio_url": None,
                "hermes_tools_used": ["auto_cron_2200", "git_status", "whatsapp_dispatch"],
                "hermes_model": get_gemini_model(),
            })

            # Broadcast dari Lisa (Finance)
            lisa_broadcast_text = (
                f"💰 **[OTOMATIS JAM 10 MALAM] Laporan Rekonsiliasi Keuangan BCA & BRI Siap!**\n\n"
                f"Halo Pak Soni, saya (Lisa) telah menyortir seluruh transaksi hari ini dari email `{fin_summary['email_account']}`:\n"
                f"• 🟢 **Total Uang Masuk:** {format_rupiah(fin_summary['total_incoming'])} ({len(fin_summary['incoming_list'])} transaksi)\n"
                f"• 🔴 **Total Pengeluaran:** {format_rupiah(fin_summary['total_outgoing'])} ({len(fin_summary['outgoing_list'])} pembayaran)\n"
                f"• 📈 **Net Cashflow:** {format_rupiah(fin_summary['net_cashflow'])}\n\n"
                f"📁 Arsip tersimpan di: `office_workspace/LAPORAN_MUTASI_BCA_BRI.md`\n\n"
                + (
                    f"✅ **Laporan keuangan telah berhasil terkirim ke WhatsApp {target_phone}!**"
                    if wa_fin_sent
                    else f"📲 **Buka WhatsApp:**\n👉 [Klik di Sini untuk Kirim Laporan Keuangan ke WA]({wa_finance_url})"
                )
            )

            await sio.emit("agent_response", {
                "agent_id": "lisa",
                "agent_name": "Lisa (Finance Specialist)",
                "text": lisa_broadcast_text,
                "animation_trigger": "Talk_Friendly",
                "action_type": "gesture",
                "target_waypoint": None,
                "audio_url": None,
                "hermes_tools_used": ["email_sync_imap", "bca_bri_parser", "whatsapp_dispatch"],
                "hermes_model": get_gemini_model(),
            })
        except Exception as e:
            logger.debug(f"Socket broadcast skip: {e}")

        # Update State
        today_date = now.strftime("%Y-%m-%d")
        SCHEDULER_STATE["last_run_date"] = today_date
        SCHEDULER_STATE["last_run_timestamp"] = now_str
        all_sent = wa_sent and wa_fin_sent
        SCHEDULER_STATE["last_run_status"] = "Sukses dikompilasi & dikirim via WhatsApp (Dev & Finance)" if all_sent else "Sukses dikompilasi (Dev & Finance siap di WhatsApp)"
        SCHEDULER_STATE["last_run_summary"] = {
            "time": now_str,
            "trigger_type": trigger_type,
            "whatsapp_sent": wa_sent,
            "whatsapp_finance_sent": wa_fin_sent,
            "whatsapp_url": wa_url,
            "whatsapp_finance_url": wa_finance_url,
            "target_phone": target_phone,
            "dev_report_file": report_data["file_path"],
            "finance_report_file": finance_data["file_path"],
            "finance_summary": {
                "incoming": fin_summary["total_incoming"],
                "outgoing": fin_summary["total_outgoing"],
                "net": fin_summary["net_cashflow"],
            }
        }

        logger.info(f"✅ [Auto-Report 22:00] Selesai: {SCHEDULER_STATE['last_run_status']}")
        return {
            "status": "success",
            "message": SCHEDULER_STATE["last_run_status"],
            "data": SCHEDULER_STATE["last_run_summary"],
        }

    except Exception as e:
        logger.error(f"❌ [Auto-Report Error]: {e}", exc_info=True)
        SCHEDULER_STATE["last_run_status"] = f"Gagal: {str(e)}"
        return {"status": "error", "message": str(e)}

    finally:
        SCHEDULER_STATE["is_executing"] = False


async def scheduler_background_loop():
    """
    Loop pengecekan waktu setiap 25 detik.
    Jika waktu lokal cocok dengan target waktu di .env (default: 22:00)
    dan belum dijalankan hari ini, maka jalankan otomatis.
    """
    cfg = get_schedule_config()
    logger.info(f"⏰ [Scheduler] Background Scheduler Laporan Harian Aktif (Target: Jam {cfg['time']} WIB, Target: {cfg['phone']})...")

    while True:
        try:
            cfg = get_schedule_config()
            if cfg["enabled"]:
                now = datetime.now()
                current_hm = now.strftime("%H:%M")
                current_ymd = now.strftime("%Y-%m-%d")

                target_time = cfg["time"].strip()

                # Cek kecocokan jam:menit dan belum jalan hari ini
                if current_hm == target_time and SCHEDULER_STATE["last_run_date"] != current_ymd:
                    logger.info(f"🔔 [Scheduler Trigger] Waktu mencapai {current_hm}! Menjalankan laporan harian otomatis...")
                    await execute_daily_report_job(trigger_type="auto_scheduled")

            await asyncio.sleep(25)
        except asyncio.CancelledError:
            logger.info("⏰ [Scheduler] Background loop dibatalkan.")
            break
        except Exception as e:
            logger.error(f"⚠️ [Scheduler Loop Error]: {e}")
            await asyncio.sleep(30)


def start_scheduler():
    """Memulai scheduler background task saat aplikasi start."""
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        loop = asyncio.get_event_loop()
        _scheduler_task = loop.create_task(scheduler_background_loop())


def get_scheduler_info() -> Dict[str, Any]:
    """Mengembalikan informasi status scheduler langsung dari .env untuk UI / API."""
    cfg = get_schedule_config()
    now = datetime.now()
    target_time = cfg["time"]
    
    today_ymd = now.strftime("%Y-%m-%d")
    already_run_today = SCHEDULER_STATE["last_run_date"] == today_ymd

    return {
        "enabled": cfg["enabled"],
        "schedule_time": target_time,
        "current_server_time": now.strftime("%H:%M:%S WIB"),
        "target_phone": cfg["phone"] or "Belum disetel di .env",
        "has_fonnte_gateway": bool(cfg["fonnte_token"]),
        "already_run_today": already_run_today,
        "last_run_status": SCHEDULER_STATE["last_run_status"],
        "last_run_timestamp": SCHEDULER_STATE["last_run_timestamp"],
        "last_run_summary": SCHEDULER_STATE["last_run_summary"],
    }
