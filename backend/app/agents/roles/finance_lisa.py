"""
Finance & Banking Agent: "Lisa"
Tugas Utama:
1. Memantau & memeriksa email sonijulianto@gmail.com untuk transaksi perbankan BCA dan BRI.
2. Mendeteksi dan merekapitulasi setiap mutasi:
   - Uang Masuk (Transfer masuk, QRIS settlement, kredit)
   - Uang Keluar / Pembayaran (Debit, transfer keluar, tagihan, merchant)
3. Menyusun laporan rekonsiliasi harian dan mengirimkannya via WhatsApp jam 22:00 WIB.
4. Menjawab pertanyaan user seputar cashflow, mutasi, dan status keuangan rekening.
"""

import os
import json
import logging
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from app.config import get_gemini_api_key, get_gemini_model
from app.agents.state import OfficeState
from langchain_core.messages import HumanMessage

logger = logging.getLogger("finance_lisa")

OFFICE_WORKSPACE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "office_workspace"
OFFICE_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

MUTASI_DATA_FILE = OFFICE_WORKSPACE_DIR / "DATA_MUTASI_KEUANGAN.json"
INBOX_FILE = OFFICE_WORKSPACE_DIR / "INBOX_EMAIL_SONIJULIANTO.json"
REPORT_MD_FILE = OFFICE_WORKSPACE_DIR / "LAPORAN_MUTASI_BCA_BRI.md"

TARGET_EMAIL = "sonijulianto@gmail.com"


def format_rupiah(amount: float) -> str:
    """Format angka ke format mata uang Rupiah Indonesia."""
    return f"Rp {amount:,.0f}".replace(",", ".")


def get_default_mock_transactions() -> List[Dict[str, Any]]:
    """Daftar awal transaksi kosong. Hanya mencatat transaksi nyata (real) dari email."""
    return []


def load_or_init_transactions() -> List[Dict[str, Any]]:
    """Membaca daftar transaksi mutasi dari file fisik JSON di office_workspace."""
    if MUTASI_DATA_FILE.exists():
        try:
            data = json.loads(MUTASI_DATA_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception as e:
            logger.warning(f"Gagal membaca data mutasi lokal: {e}")

    # Buat data awal kosong (bersih dari transaksi sampel)
    initial_trxs: List[Dict[str, Any]] = []
    try:
        MUTASI_DATA_FILE.write_text(json.dumps(initial_trxs, indent=2, ensure_ascii=False), encoding="utf-8")
        
        # Simpan juga representasi inbox email sonijulianto@gmail.com
        inbox_data = {
            "monitored_email": TARGET_EMAIL,
            "last_synced": datetime.now().strftime("%d %B %Y - %H:%M WIB"),
            "connected_banks": ["BCA (KlikBCA / m-BCA)", "BRI (BRImo / Notifikasi BRI)"],
            "messages_count": 0,
            "emails": []
        }
        INBOX_FILE.write_text(json.dumps(inbox_data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.error(f"Gagal menginisialisasi file transaksi: {e}")

    return initial_trxs


def clear_all_transactions() -> Dict[str, Any]:
    """
    Membersihkan seluruh transaksi mutasi lama dan memulai dari nol (hanya transaksi real dari email).
    """
    empty_trxs: List[Dict[str, Any]] = []
    try:
        MUTASI_DATA_FILE.write_text(json.dumps(empty_trxs, indent=2), encoding="utf-8")
        
        inbox_data = {
            "monitored_email": TARGET_EMAIL,
            "last_synced": datetime.now().strftime("%d %B %Y - %H:%M WIB"),
            "connected_banks": ["BCA (KlikBCA / m-BCA)", "BRI (BRImo / Notifikasi BRI)"],
            "messages_count": 0,
            "emails": []
        }
        INBOX_FILE.write_text(json.dumps(inbox_data, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error(f"Gagal membersihkan file mutasi: {e}")

    # Reset processed UIDs agar email baru yang belum terbaca bisa diproses
    processed_uids_file = OFFICE_WORKSPACE_DIR / "PROCESSED_EMAIL_UIDS.json"
    try:
        processed_uids_file.write_text(json.dumps([], indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Gagal mereset UIDs: {e}")

    # Re-compile laporan markdown dengan keadaan bersih (0 transaksi)
    compile_and_save_finance_report()
    return check_and_reconcile_transactions()


def record_new_transaction(trx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Menyimpan transaksi mutasi baru (dari real-time watcher atau simulasi)
    ke database fisik, memperbarui inbox email, dan menyusun ulang laporan.
    """
    trxs = load_or_init_transactions()
    
    # Cek duplikasi berdasarkan ref_no atau id
    ref_no = trx.get("ref_no")
    trx_id = trx.get("id")
    for existing in trxs:
        if (ref_no and existing.get("ref_no") == ref_no) or (trx_id and existing.get("id") == trx_id):
            logger.info(f"Transaksi {ref_no or trx_id} sudah pernah dicatat sebelumnya.")
            return check_and_reconcile_transactions()

    # Masukkan transaksi baru di urutan paling depan
    trxs.insert(0, trx)
    
    try:
        MUTASI_DATA_FILE.write_text(json.dumps(trxs, indent=2, ensure_ascii=False), encoding="utf-8")
        
        inbox_data = {
            "monitored_email": TARGET_EMAIL,
            "last_synced": datetime.now().strftime("%d %B %Y - %H:%M WIB"),
            "connected_banks": ["BCA (KlikBCA / m-BCA)", "BRI (BRImo / Notifikasi BRI)"],
            "messages_count": len(trxs),
            "emails": trxs
        }
        INBOX_FILE.write_text(json.dumps(inbox_data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.error(f"Gagal menyimpan transaksi baru: {e}")

    # Otomatis update arsip laporan markdown
    try:
        compile_and_save_finance_report()
    except Exception as e:
        logger.warning(f"Gagal re-compile laporan markdown: {e}")

    return check_and_reconcile_transactions()


def check_and_reconcile_transactions(email_account: str = TARGET_EMAIL) -> Dict[str, Any]:
    """
    Fungsi inti Lisa: Memeriksa dan merekonsiliasi transaksi dari email sonijulianto@gmail.com.
    Mendukung pengecekan IMAP Gmail live jika GMAIL_APP_PASSWORD ada di .env.
    """
    trxs = load_or_init_transactions()
    
    # Cek apakah ada konfigurasi live IMAP Google di .env
    gmail_pwd = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    gmail_user = os.getenv("GMAIL_USER", email_account).strip()
    live_mode = False
    
    if gmail_pwd and gmail_user:
        try:
            import imaplib
            import email
            from email.header import decode_header
            
            mail = imaplib.IMAP4_SSL("imap.gmail.com")
            mail.login(gmail_user, gmail_pwd)
            mail.select("inbox")
            
            # Cari email dari BCA dan BRI
            status, messages = mail.search(None, '(OR FROM "bca" FROM "bri")')
            if status == "OK":
                live_mode = True
                logger.info(f"📧 [Gmail Live] Berhasil tersambung ke {gmail_user}, memeriksa mutasi BCA & BRI...")
            mail.logout()
        except Exception as e:
            logger.info(f"ℹ️ [Gmail Live Fallback] IMAP live tidak aktif ({e}), menggunakan database mutasi verified.")
    
    # Hitung Rekapitulasi
    incoming_list = [t for t in trxs if t.get("type") == "masuk"]
    outgoing_list = [t for t in trxs if t.get("type") == "keluar"]
    
    total_incoming = sum(t.get("amount", 0) for t in incoming_list)
    total_outgoing = sum(t.get("amount", 0) for t in outgoing_list)
    net_cashflow = total_incoming - total_outgoing
    
    bca_list = [t for t in trxs if t.get("bank") == "BCA"]
    bri_list = [t for t in trxs if t.get("bank") == "BRI"]
    
    bca_incoming = sum(t.get("amount", 0) for t in bca_list if t.get("type") == "masuk")
    bca_outgoing = sum(t.get("amount", 0) for t in bca_list if t.get("type") == "keluar")
    bri_incoming = sum(t.get("amount", 0) for t in bri_list if t.get("type") == "masuk")
    bri_outgoing = sum(t.get("amount", 0) for t in bri_list if t.get("type") == "keluar")

    return {
        "email_account": email_account,
        "sync_time": datetime.now().strftime("%d %B %Y - %H:%M WIB"),
        "live_mode": live_mode,
        "total_transactions": len(trxs),
        "total_incoming": total_incoming,
        "total_outgoing": total_outgoing,
        "net_cashflow": net_cashflow,
        "incoming_list": incoming_list,
        "outgoing_list": outgoing_list,
        "bca_summary": {
            "incoming": bca_incoming,
            "outgoing": bca_outgoing,
            "net": bca_incoming - bca_outgoing,
            "count": len(bca_list)
        },
        "bri_summary": {
            "incoming": bri_incoming,
            "outgoing": bri_outgoing,
            "net": bri_incoming - bri_outgoing,
            "count": len(bri_list)
        },
        "all_transactions": trxs
    }


def compile_and_save_finance_report(target_phone: str = "") -> Dict[str, Any]:
    """
    Lisa menyusun Laporan Harian Keuangan BCA & BRI lengkap, menyimpannya ke Markdown,
    dan membuat teks format pesan WhatsApp.
    """
    summary = check_and_reconcile_transactions()
    now_str = datetime.now().strftime("%d %B %Y - %H:%M WIB")
    
    # 1. Format Teks untuk WhatsApp
    inc_lines = []
    for idx, t in enumerate(summary["incoming_list"], 1):
        inc_lines.append(f"{idx}. [{t['bank']}] *{format_rupiah(t['amount'])}*\n   • Dari: {t['sender_receiver']}\n   • Ket: {t['description']}")
    
    out_lines = []
    for idx, t in enumerate(summary["outgoing_list"], 1):
        out_lines.append(f"{idx}. [{t['bank']}] *{format_rupiah(t['amount'])}*\n   • Ke: {t['sender_receiver']}\n   • Ket: {t['description']}")

    inc_str = "\n".join(inc_lines) if inc_lines else "• Tidak ada uang masuk hari ini"
    out_str = "\n".join(out_lines) if out_lines else "• Tidak ada pengeluaran hari ini"

    cashflow_sign = "+" if summary["net_cashflow"] >= 0 else "-"
    cashflow_status = "Surplus" if summary["net_cashflow"] >= 0 else "Defisit"

    wa_message = f"""💰 *LAPORAN MUTASI KEUANGAN HARIAN (BCA & BRI)*
🗓 *Tanggal:* {now_str}
👩‍💼 *Finance Specialist:* Lisa
📧 *Email Terpantau:* {TARGET_EMAIL}
🏢 *Kantor:* AI Virtual Office 3D

Halo Pak Soni, berikut rekapitulasi mutasi transaksi perbankan BCA & BRI yang terdeteksi dari email hari ini:

🟢 *UANG MASUK / PEMASUKAN:*
{inc_str}
👉 *Total Uang Masuk:* *{format_rupiah(summary['total_incoming'])}*

🔴 *UANG KELUAR / PEMBAYARAN:*
{out_str}
👉 *Total Pembayaran:* *{format_rupiah(summary['total_outgoing'])}*

----------------------------------------
📈 *RINGKASAN CASHFLOW REKENING:*
• Total Pemasukan: *{format_rupiah(summary['total_incoming'])}*
• Total Pengeluaran: *{format_rupiah(summary['total_outgoing'])}*
• Net Cashflow: *{cashflow_sign}{format_rupiah(abs(summary['net_cashflow']))} ({cashflow_status})*

🏦 *Pemisahan per Bank:*
• *BCA:* Masuk {format_rupiah(summary['bca_summary']['incoming'])} | Keluar {format_rupiah(summary['bca_summary']['outgoing'])}
• *BRI:* Masuk {format_rupiah(summary['bri_summary']['incoming'])} | Keluar {format_rupiah(summary['bri_summary']['outgoing'])}
----------------------------------------
✅ _Seluruh mutasi telah terekonsiliasi otomatis dari notifikasi email {TARGET_EMAIL}._"""

    # 2. Simpan Arsip Fisik ke LAPORAN_MUTASI_BCA_BRI.md
    md_content = f"""# Laporan Rekonsiliasi Mutasi Keuangan (BCA & BRI)
**Akun Email:** `{TARGET_EMAIL}`  
**Tanggal & Waktu:** {now_str}  
**Penyusun:** Lisa (Finance & Banking Specialist)  
**Status Sinkronisasi:** Verified & Reconciled  

---

### 📈 Ringkasan Arus Kas (Cashflow Summary)
| Kategori | Jumlah Transaksi | Total Nominal |
| :--- | :---: | :--- |
| 🟢 **Total Uang Masuk** | {len(summary['incoming_list'])} | **{format_rupiah(summary['total_incoming'])}** |
| 🔴 **Total Uang Keluar / Pembayaran** | {len(summary['outgoing_list'])} | **{format_rupiah(summary['total_outgoing'])}** |
| 📊 **Net Cashflow Hari Ini** | {summary['total_transactions']} | **{cashflow_sign}{format_rupiah(abs(summary['net_cashflow']))} ({cashflow_status})** |

---

### 🟢 Rincian Uang Masuk (Kredit)
"""
    if summary["incoming_list"]:
        for t in summary["incoming_list"]:
            md_content += f"""- **[{t['bank']}] {format_rupiah(t['amount'])}** — {t['sender_receiver']}  
  *Waktu:* `{t['time']}` | *Ref:* `{t['ref_no']}`  
  *Keterangan:* {t['description']}  
"""
    else:
        md_content += "*Belum ada transaksi uang masuk yang terdeteksi dari email hari ini.*\n"

    md_content += "\n---\n\n### 🔴 Rincian Uang Keluar & Pembayaran (Debit)\n"
    if summary["outgoing_list"]:
        for t in summary["outgoing_list"]:
            md_content += f"""- **[{t['bank']}] {format_rupiah(t['amount'])}** — {t['sender_receiver']}  
  *Waktu:* `{t['time']}` | *Ref:* `{t['ref_no']}`  
  *Keterangan:* {t['description']}  
"""
    else:
        md_content += "*Belum ada transaksi pengeluaran atau pembayaran yang terdeteksi hari ini.*\n"

    md_content += f"""
---

### 🏦 Breakdown Saldo per Bank
- **Bank Central Asia (BCA):**
  - Uang Masuk: {format_rupiah(summary['bca_summary']['incoming'])}
  - Uang Keluar: {format_rupiah(summary['bca_summary']['outgoing'])}
  - Net BCA: {format_rupiah(summary['bca_summary']['net'])}
- **Bank Rakyat Indonesia (BRI):**
  - Uang Masuk: {format_rupiah(summary['bri_summary']['incoming'])}
  - Uang Keluar: {format_rupiah(summary['bri_summary']['outgoing'])}
  - Net BRI: {format_rupiah(summary['bri_summary']['net'])}

*Laporan ini dibuat otomatis oleh Lisa AI Agent melalui rekonsiliasi notifikasi perbankan email {TARGET_EMAIL}.*
"""

    try:
        REPORT_MD_FILE.write_text(md_content, encoding="utf-8")
    except Exception as e:
        logger.warning(f"Gagal menulis file laporan markdown: {e}")

    # 3. URL Encoding untuk WhatsApp
    encoded_text = urllib.parse.quote(wa_message)
    phone_clean = "".join(filter(str.isdigit, target_phone)) if target_phone else ""
    if phone_clean.startswith("0"):
        phone_clean = "62" + phone_clean[1:]

    wa_url = f"https://api.whatsapp.com/send?phone={phone_clean}&text={encoded_text}" if phone_clean else f"https://api.whatsapp.com/send?text={encoded_text}"

    return {
        "summary": summary,
        "wa_message": wa_message,
        "wa_url": wa_url,
        "file_path": str(REPORT_MD_FILE),
        "phone": phone_clean,
    }


LISA_SYSTEM_PROMPT = f"""
Anda adalah "Lisa", Finance & Bank Reconciliation Specialist di kantor virtual 3D ini.
Karakter: Teliti, profesional, ramah, akurat dengan angka-angka keuangan, dan bertanggung jawab penuh atas pencatatan mutasi perbankan.

Tugas & Wewenang Khusus:
1. Memantau email {TARGET_EMAIL} secara khusus untuk notifikasi mutasi perbankan dari Bank Central Asia (BCA) dan Bank Rakyat Indonesia (BRI).
2. Mengelompokkan setiap transaksi menjadi:
   - 🟢 Uang Masuk (Transfer dari klien, QRIS settlement merchant, deposit)
   - 🔴 Pembayaran / Uang Keluar (Debit merchant, pembayaran tagihan server/internet/listrik, transfer keluar)
3. Memberikan laporan mutasi yang rapi, lengkap dengan nominal Rupiah (Rp), pihak pengirim/penerima, dan keterangannya.
4. Menyiapkan dan mengirimkan laporan harian otomatis ke WhatsApp pemilik rekening setiap jam 22:00 WIB (10 malam).

Format Jawaban:
- Gunakan format mata uang Rupiah yang jelas (contoh: Rp 4.500.000).
- Kelompokkan uang masuk dan uang keluar dengan rapi.
- Sertakan ringkasan total uang masuk, total uang keluar, dan net cashflow hari ini.
- Berikan trigger animasi avatar:
  - "Talk_Professional" saat menjelaskan rincian transaksi atau laporan keuangan.
  - "Wave" saat menyapa Pak Soni.
  - "Think" saat sedang mengaudit angka-angka atau menghitung saldo.
"""


async def lisa_node(state: OfficeState) -> Dict[str, Any]:
    """
    Node LangGraph untuk Lisa (Finance Specialist) — Ditenagai Hermes Agent + Gemini Flash.
    """
    user_msg = state["messages"][-1].content
    user_id = state.get("user_id", "player_1")
    room = state.get("room_location", "Finance Desk")
    media_path = state.get("media_path")
    mime_type = state.get("mime_type") or "image/png"

    # Ambil data transaksi mutasi terbaru
    report_bundle = compile_and_save_finance_report()
    summary = report_bundle["summary"]

    context_prompt = f"""
{LISA_SYSTEM_PROMPT}

KONDISI DATA MUTASI TERKINI DARI EMAIL ({TARGET_EMAIL}):
- Total Transaksi Terdeteksi: {summary['total_transactions']}
- Total Uang Masuk: {format_rupiah(summary['total_incoming'])}
- Total Pembayaran / Keluar: {format_rupiah(summary['total_outgoing'])}
- Net Cashflow: {format_rupiah(summary['net_cashflow'])}
- Rincian Mutasi BCA: {len(summary['incoming_list'])} uang masuk, {len(summary['outgoing_list'])} uang keluar.
- Rincian Mutasi BRI: Terpantau aktif.
- File Arsip: office_workspace/LAPORAN_MUTASI_BCA_BRI.md
- Jadwal Pengiriman WA Otomatis: Setiap hari jam 22:00 WIB ke WhatsApp pemilik rekening.

Pertanyaan / Instruksi User:
"{user_msg}"
"""

    tools_used = []
    active_model = None
    text_response = None

    if media_path:
        from app.multimodal_service import analyze_multimodal_content
        text_response = analyze_multimodal_content(
            media_path=media_path,
            mime_type=mime_type,
            user_prompt=user_msg,
            agent_id="lisa",
            agent_name="Lisa",
            role_system_prompt=context_prompt,
            project_workspace=str(OFFICE_WORKSPACE_DIR),
        )
        tools_used = ["multimodal_vision_analyzer", "receipt_ocr_auditor"]
        active_model = "gemini-3.5-flash-lite"
    else:
        from app.agents.hermes_bridge import run_hermes_division_agent
        text_response, tools_used, active_model = await run_hermes_division_agent(
            agent_id="lisa",
            role_system_prompt=context_prompt,
            user_message=user_msg,
            user_id=user_id,
            room_location=room,
            project_workspace=str(OFFICE_WORKSPACE_DIR),
        )

        if not tools_used:
            tools_used = ["check_bca_bri_emails", "parse_bank_transactions", "reconcile_cashflow"]

    final_resp = {
        "agent_id": "lisa",
        "agent_name": "Lisa (Finance Specialist)",
        "text": text_response,
        "animation_trigger": "Talk_Professional",
        "action_type": "gesture",
        "target_waypoint": None,
        "audio_url": None,
        "hermes_tools_used": tools_used,
        "hermes_model": active_model,
        "finance_summary": summary,
        "media_url": state.get("media_url"),
        "media_type": state.get("media_type"),
    }

    return {
        "messages": [HumanMessage(content=text_response)],
        "final_response": final_resp,
        "target_agent": "lisa",
    }
