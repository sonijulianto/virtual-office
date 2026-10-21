"""
Real-time Email Watcher & Bank Mutation Listener for sonijulianto@gmail.com.
Memantau inbox Gmail secara real-time via IMAP SSL (imap.gmail.com:993).
Mendeteksi email masuk dari BCA & BRI (Uang Masuk / Pembayaran),
otomatis mengekstrak nominal transaksi, merekonsiliasi cashflow,
serta memancarkan event Socket.IO dan speech bubble Lisa secara instan ke kantor 3D!
"""

import os
import re
import json
import asyncio
import logging
import imaplib
import email
from email.header import decode_header
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser
from typing import Dict, Any, List, Optional, Tuple

from dotenv import load_dotenv, set_key
from app.agents.roles.finance_lisa import (
    TARGET_EMAIL,
    OFFICE_WORKSPACE_DIR,
    record_new_transaction,
    format_rupiah,
    check_and_reconcile_transactions,
)

logger = logging.getLogger("email_watcher")

PROCESSED_UIDS_FILE = OFFICE_WORKSPACE_DIR / "PROCESSED_EMAIL_UIDS.json"
ENV_FILE_PATH = Path(__file__).resolve().parent.parent / ".env"


class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.text_parts = []

    def handle_data(self, data):
        cleaned = data.strip()
        if cleaned:
            self.text_parts.append(cleaned)

    def get_text(self):
        return " ".join(self.text_parts)


def clean_html(html_str: str) -> str:
    """Ekstraksi teks bersih dari isi HTML email."""
    try:
        parser = HTMLTextExtractor()
        parser.feed(html_str)
        return parser.get_text()
    except Exception:
        # Fallback regex sederhana
        clean = re.sub(r"<[^>]+>", " ", html_str)
        return " ".join(clean.split())


def get_email_credentials() -> Tuple[str, str]:
    """Membaca akun email dan sandi aplikasi dari file .env secara dinamis."""
    load_dotenv(dotenv_path=ENV_FILE_PATH, override=True)
    user = os.getenv("GMAIL_USER", TARGET_EMAIL).strip()
    pwd = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    return user, pwd


def save_email_credentials(email_user: str, app_password: str) -> bool:
    """Menyimpan atau memperbarui kredensial Gmail ke file .env."""
    try:
        set_key(str(ENV_FILE_PATH), "GMAIL_USER", email_user.strip())
        set_key(str(ENV_FILE_PATH), "GMAIL_APP_PASSWORD", app_password.strip().replace(" ", ""))
        load_dotenv(dotenv_path=ENV_FILE_PATH, override=True)
        return True
    except Exception as e:
        logger.error(f"Gagal memperbarui .env untuk Gmail: {e}")
        return False


def load_processed_uids() -> List[str]:
    """Membaca daftar UID email yang sudah diproses agar tidak duplikat."""
    if PROCESSED_UIDS_FILE.exists():
        try:
            data = json.loads(PROCESSED_UIDS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception as e:
            logger.warning(f"Gagal membaca processed UIDs: {e}")
    return []


def save_processed_uid(uid: str):
    """Menambahkan UID email ke daftar yang telah diproses."""
    uids = load_processed_uids()
    if uid not in uids:
        uids.append(uid)
        try:
            PROCESSED_UIDS_FILE.write_text(json.dumps(uids, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Gagal menyimpan UID: {e}")


def decode_mime_words(s: str) -> str:
    """Decode header MIME email seperti UTF-8 / Base64 / Quoted-Printable."""
    if not s:
        return ""
    decoded_fragments = []
    try:
        for frag, enc in decode_header(s):
            if isinstance(frag, bytes):
                decoded_fragments.append(frag.decode(enc or "utf-8", errors="replace"))
            else:
                decoded_fragments.append(str(frag))
        return " ".join(decoded_fragments).strip()
    except Exception:
        return str(s)


def extract_nominal(text: str) -> float:
    """
    Mengekstrak nominal Rupiah dari teks email (contoh: Rp 4.500.000, IDR 15,000,000.00, dll).
    """
    # Pola: Rp/IDR diikuti angka dengan pemisah titik atau koma
    patterns = [
        r"(?:rp\.?|idr)\s*([0-9\.,]+)",
        r"nominal\s*:\s*(?:rp\.?|idr)?\s*([0-9\.,]+)",
        r"jumlah\s*:\s*(?:rp\.?|idr)?\s*([0-9\.,]+)",
        r"amount\s*:\s*(?:rp\.?|idr)?\s*([0-9\.,]+)",
    ]
    
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw_val = m.group(1).strip()
            # Bersihkan desimal .00 atau ,00 di ujung
            raw_val = re.sub(r"[,.]00$", "", raw_val)
            # Hilangkan seluruh titik dan koma pemisah ribuan
            digits_only = re.sub(r"[^\d]", "", raw_val)
            if digits_only:
                try:
                    val = float(digits_only)
                    if val > 0:
                        return val
                except ValueError:
                    pass
    return 0.0


def extract_reference_number(text: str, default_prefix: str = "TRX") -> str:
    """Mengekstrak nomor referensi transaksi atau trace ID dari email."""
    patterns = [
        r"(?:ref(?:erensi)?|trace(?:\s*no)?|no\.\s*transaksi|kode\s*trx)\s*[:#]?\s*([A-Za-z0-9_-]{8,32})",
        r"([0-9]{12,24})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return f"{default_prefix}{datetime.now().strftime('%Y%m%d%H%M%S')}"


def parse_bank_email_content(sender: str, subject: str, body: str) -> Optional[Dict[str, Any]]:
    """
    Engine parser cerdas untuk pesan email BCA & BRI.
    Mendeteksi: Bank, Jenis (Masuk/Keluar), Nominal, Pengirim/Penerima, Keterangan, No Ref.
    """
    full_text = f"{subject}\n{body}".lower()
    combined_raw = f"{subject}\n{body}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M WIB")

    # 1. Deteksi Bank
    bank = "UNKNOWN"
    if any(k in sender.lower() for k in ["bca", "klikbca"]) or "bca" in full_text:
        bank = "BCA"
    elif any(k in sender.lower() for k in ["bri", "brimo"]) or "bri" in full_text:
        bank = "BRI"
    else:
        # Cek bank lain jika ada
        for other in ["MANDIRI", "BNI", "BSI", "PERMATA", "CIMB"]:
            if other.lower() in full_text or other.lower() in sender.lower():
                bank = other
                break
        if bank == "UNKNOWN":
            return None

    # 2. Deteksi Jenis Transaksi (Masuk vs Keluar)
    masuk_keywords = [
        "masuk", "kredit", "cr", "dana masuk", "transfer masuk", "setoran",
        "settlement", "penerimaan", "diterima", "credit", "top up"
    ]
    keluar_keywords = [
        "keluar", "debit", "debet", "db", "pembayaran", "tagihan", "pembelian",
        "tarik tunai", "transfer keluar", "auto-debit", "qris payment", "terpotong"
    ]

    is_masuk = any(k in full_text for k in masuk_keywords)
    is_keluar = any(k in full_text for k in keluar_keywords)

    # Spesifik jika QRIS Settlement (pemasukan bagi merchant)
    if "settlement" in full_text or "dana masuk settlement" in full_text:
        trx_type = "masuk"
        category = "QRIS Settlement / Penjualan"
    elif is_masuk and not is_keluar:
        trx_type = "masuk"
        category = "Transfer Masuk / Kredit"
    elif is_keluar and not is_masuk:
        trx_type = "keluar"
        category = "Pembayaran / Debit"
    else:
        # Heuristik dari subject
        if "masuk" in subject.lower() or "kredit" in subject.lower():
            trx_type = "masuk"
            category = "Transfer Masuk"
        else:
            trx_type = "keluar"
            category = "Pembayaran / Debit"

    # 3. Ekstraksi Nominal
    amount = extract_nominal(combined_raw)
    if amount <= 0:
        logger.debug(f"Abaikan email dari {sender}: Tidak ditemukan nominal transaksi valid.")
        return None

    # 4. Ekstraksi Pengirim / Penerima / Merchant
    party = "Rekening Tujuan / Merchant"
    party_patterns = [
        r"(?:dari|pengirim|sender)\s*[:]?\s*([A-Za-z0-9\s\.\,\-\/]{3,35})",
        r"(?:ke|penerima|merchant|kepada|tujuan)\s*[:]?\s*([A-Za-z0-9\s\.\,\-\/]{3,35})",
    ]
    for pat in party_patterns:
        m = re.search(pat, combined_raw, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            # Hindari kata-kata umum seperti "rekening anda"
            if len(candidate) > 2 and not candidate.lower().startswith("rekening"):
                party = candidate
                break

    # 5. Deskripsi
    desc = f"{category} melalui notifikasi email {bank}"
    desc_patterns = [
        r"(?:keterangan|berita|deskripsi|catatan|remark)\s*[:]?\s*([A-Za-z0-9\s\.\,\-\/]{3,50})",
    ]
    for pat in desc_patterns:
        m = re.search(pat, combined_raw, re.IGNORECASE)
        if m:
            desc = m.group(1).strip()
            break

    # 6. No. Referensi
    ref_no = extract_reference_number(combined_raw, default_prefix=bank)
    target_account = f"{bank} a/n Soni Julianto"

    return {
        "id": f"TRX-{bank}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "bank": bank,
        "type": trx_type,
        "category": category,
        "amount": amount,
        "sender_receiver": party.upper(),
        "description": desc,
        "account_target": target_account,
        "email_sender": sender,
        "email_subject": subject,
        "time": now_str,
        "ref_no": ref_no,
        "live_synced": True,
    }


class EmailWatcher:
    def __init__(self):
        self.is_running = False
        self.connected_live = False
        self.last_poll_time: Optional[str] = None
        self.last_status: str = "Inisialisasi..."
        self.last_detected_trx: Optional[Dict[str, Any]] = None
        self.poll_interval = 20  # detik
        self._watcher_task: Optional[asyncio.Task] = None

    def get_status(self) -> Dict[str, Any]:
        user, pwd = get_email_credentials()
        return {
            "monitored_email": user,
            "has_app_password": bool(pwd),
            "connected_live": self.connected_live,
            "is_running": self.is_running,
            "poll_interval_seconds": self.poll_interval,
            "last_poll_time": self.last_poll_time,
            "last_status": self.last_status,
            "last_detected_transaction": self.last_detected_trx,
            "instructions": {
                "step1": "Login ke Google Account Anda (sonijulianto@gmail.com)",
                "step2": "Buka Keamanan -> Verifikasi 2 Langkah -> Sandi Aplikasi (App Passwords)",
                "step3": "Buat Sandi Aplikasi baru bernama 'AI Virtual Office'",
                "step4": "Salin 16 karakter kode tersebut dan simpan di menu pengaturan ini."
            }
        }

    async def broadcast_new_transaction(self, trx: Dict[str, Any], summary: Dict[str, Any]):
        """
        Menyiarkan notifikasi transaksi baru secara instan:
        1. Socket.IO event 'finance_transaction_received' ke 3D Virtual Office
        2. Bubble suara & gesture Lisa di atas meja kerjanya
        3. macOS Native Desktop notification
        """
        self.last_detected_trx = trx
        bank = trx.get("bank", "Bank")
        amt = trx.get("amount", 0)
        trx_type = trx.get("type", "masuk")
        party = trx.get("sender_receiver", "Rekening")
        desc = trx.get("description", "")
        ref = trx.get("ref_no", "-")

        icon = "🟢" if trx_type == "masuk" else "🔴"
        label = "Uang Masuk (Kredit)" if trx_type == "masuk" else "Uang Keluar / Pembayaran"

        announcement = (
            f"🔔 **[REAL-TIME EMAIL DETEKSI] Notifikasi Mutasi {bank} Masuk!**\n\n"
            f"Saya (Lisa) baru saja mendeteksi email transaksi baru di `{TARGET_EMAIL}`:\n"
            f"• {icon} **Jenis:** {label}\n"
            f"• 💰 **Nominal:** *{format_rupiah(amt)}*\n"
            f"• 🏦 **Bank:** {bank}\n"
            f"• 👤 **Pihak Terkait:** {party}\n"
            f"• 📝 **Keterangan:** {desc}\n"
            f"• 🔖 **No. Ref:** `{ref}`\n\n"
            f"📈 **Cashflow Terkini:**\n"
            f"• Total Pemasukan: *{format_rupiah(summary['total_incoming'])}*\n"
            f"• Total Pengeluaran: *{format_rupiah(summary['total_outgoing'])}*\n"
            f"• Net Cashflow: *{format_rupiah(summary['net_cashflow'])}*\n\n"
            f"✅ _Data telah otomatis direkonsiliasi secara real-time ke arsip laporan._"
        )

        # 1. Native macOS Desktop Notification
        try:
            import subprocess
            clean_title = f"💰 Mutasi {bank}: {format_rupiah(amt)}"
            clean_sub = f"{icon} {label} ({party})"
            clean_body = f"{desc} (Ref: {ref})".replace('"', '\\"').replace("\n", " ")[:120]
            cmd = f'display notification "{clean_body}" with title "{clean_title}" subtitle "{clean_sub}" sound name "Glass"'
            subprocess.run(["osascript", "-e", cmd], capture_output=True, timeout=3)
        except Exception as e:
            logger.debug(f"macOS notif error: {e}")

        # 2. Socket.IO Broadcast
        try:
            from app.socket_server import sio
            # Event data spesifik
            await sio.emit("finance_transaction_received", {
                "transaction": trx,
                "summary": summary,
                "timestamp": datetime.now().strftime("%H:%M:%S WIB"),
            })

            # Event dialog Lisa agar karakter 3D bereaksi langsung
            await sio.emit("agent_response", {
                "agent_id": "lisa",
                "agent_name": "Lisa (Finance Specialist)",
                "text": announcement,
                "animation_trigger": "Talk_Friendly",
                "action_type": "gesture",
                "target_waypoint": None,
                "audio_url": None,
                "hermes_tools_used": ["live_email_watcher", "realtime_imap_stream", "reconciliation_engine"],
            })
        except Exception as e:
            logger.error(f"Gagal emit socket transaksi baru: {e}")

    def poll_imap_inbox(self) -> List[Dict[str, Any]]:
        """
        Menghubungi Gmail via IMAP SSL dan memeriksa pesan baru dari BCA & BRI.
        Dijalankan di thread terpisah agar tidak memblokir async event loop.
        """
        user, pwd = get_email_credentials()
        if not (user and pwd):
            self.connected_live = False
            self.last_status = "Menunggu Sandi Aplikasi Gmail (GMAIL_APP_PASSWORD)"
            return []

        processed_uids = set(load_processed_uids())
        new_transactions = []

        mail = None
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=12)
            mail.login(user, pwd)
            self.connected_live = True
            mail.select("INBOX")

            # Cari email dari pengirim BCA atau BRI
            # Query IMAP: mencari email yang belum diproses
            status, messages = mail.search(None, '(OR FROM "bca" (OR FROM "klikbca" FROM "bri"))')
            if status != "OK" or not messages[0]:
                self.last_status = f"Terhubung ke {user}. Tidak ada mutasi baru."
                return []

            msg_ids = messages[0].split()
            # Ambil maksimal 8 email terbaru untuk diperiksa
            recent_ids = msg_ids[-8:]

            for msg_id in recent_ids:
                uid_str = msg_id.decode("utf-8")
                if uid_str in processed_uids:
                    continue

                res, data = mail.fetch(msg_id, "(RFC822)")
                if res != "OK" or not data or not data[0]:
                    continue

                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)

                sender = decode_mime_words(msg.get("From", ""))
                subject = decode_mime_words(msg.get("Subject", ""))

                # Ekstraksi isi email (body)
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disp = str(part.get("Content-Disposition"))
                        if "attachment" not in content_disp:
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                text_part = payload.decode(charset, errors="replace")
                                if content_type == "text/html":
                                    body += clean_html(text_part) + "\n"
                                elif content_type == "text/plain":
                                    body += text_part + "\n"
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        charset = msg.get_content_charset() or "utf-8"
                        text_part = payload.decode(charset, errors="replace")
                        if msg.get_content_type() == "text/html":
                            body = clean_html(text_part)
                        else:
                            body = text_part

                parsed_trx = parse_bank_email_content(sender, subject, body)
                if parsed_trx:
                    new_transactions.append(parsed_trx)
                    logger.info(f"⚡ [Real-time Watcher] Ditemukan transaksi email: {parsed_trx['bank']} {parsed_trx['amount']} ({parsed_trx['type']})")

                # Catat UID agar tidak dibaca berulang
                save_processed_uid(uid_str)

            self.last_status = f"🟢 Terhubung live ke {user}. Memantau real-time."
            return new_transactions

        except imaplib.IMAP4.error as e:
            self.connected_live = False
            self.last_status = f"Autentikasi Gagal: {e}. Periksa Sandi Aplikasi Anda."
            logger.warning(f"IMAP Auth Error: {e}")
            return []
        except Exception as e:
            self.connected_live = False
            self.last_status = f"Koneksi terputus: {e}"
            logger.debug(f"IMAP Loop Exception: {e}")
            return []
        finally:
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

    async def run_watcher_loop(self):
        """Loop monitoring background real-time."""
        self.is_running = True
        logger.info(f"🚀 [Email Watcher] Memulai watcher real-time untuk {TARGET_EMAIL} (Interval: {self.poll_interval}s)...")

        while self.is_running:
            try:
                self.last_poll_time = datetime.now().strftime("%d %b %Y - %H:%M:%S WIB")
                
                # Jalankan sinkronisasi IMAP di thread executor agar async tidak terhambat
                loop = asyncio.get_event_loop()
                new_trxs = await loop.run_in_executor(None, self.poll_imap_inbox)

                for trx in new_trxs:
                    # Simpan ke database fisik
                    summary = record_new_transaction(trx)
                    # Broadcast ke 3D office & notifikasi
                    await self.broadcast_new_transaction(trx, summary)

                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                logger.info("Email Watcher loop dibatalkan.")
                break
            except Exception as e:
                logger.error(f"Error di email watcher loop: {e}")
                await asyncio.sleep(self.poll_interval)

    async def simulate_incoming_email(self, custom: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Fitur pengujian simulasi email transaksi masuk secara instan.
        Memungkinkan user langsung melihat reaksi real-time Lisa & pergerakan saldo di 3D office.
        """
        now = datetime.now()
        now_str = now.strftime("%Y-%m-%d %H:%M WIB")
        
        default_samples = [
            {
                "bank": "BCA",
                "type": "masuk",
                "category": "Transfer Masuk",
                "amount": 3500000,
                "sender_receiver": "PT MITRA SOLUSI DIGITAL",
                "description": "Pembayaran Invoice Termin 2 Integrasi API",
                "account_target": "BCA - 8205xxxx89 a/n Soni Julianto",
                "email_sender": "notifikasi@bca.co.id",
                "email_subject": "Notifikasi Transfer Dana Masuk ke Rekening BCA Anda",
                "ref_no": f"BCA{now.strftime('%Y%m%d%H%M%S')}",
            },
            {
                "bank": "BRI",
                "type": "masuk",
                "category": "QRIS Settlement",
                "amount": 890000,
                "sender_receiver": "QRIS MERCHANT SETTLEMENT",
                "description": "Hasil Settlement Penjualan Kasir POS",
                "account_target": "BRI - 0341xxxxxx501 a/n Soni Julianto",
                "email_sender": "notifikasi@bri.co.id",
                "email_subject": "Notifikasi Transaksi BRI: Dana Masuk Settlement QRIS",
                "ref_no": f"BRI{now.strftime('%Y%m%d%H%M%S')}",
            },
            {
                "bank": "BCA",
                "type": "keluar",
                "category": "Pembayaran Merchant",
                "amount": 125000,
                "sender_receiver": "COFFEE SHOP & BAKERY",
                "description": "Pembayaran QRIS Konsumsi Tim Sore Hari",
                "account_target": "BCA - 8205xxxx89 a/n Soni Julianto",
                "email_sender": "notifikasi@bca.co.id",
                "email_subject": "Notifikasi Transaksi Finansial Debit Rekening BCA",
                "ref_no": f"BCA{now.strftime('%Y%m%d%H%M%S')}",
            }
        ]

        import random
        selected = custom or random.choice(default_samples)
        
        trx = {
            "id": f"TRX-{selected['bank']}-{now.strftime('%Y%m%d%H%M%S')}",
            "bank": selected["bank"],
            "type": selected["type"],
            "category": selected["category"],
            "amount": float(selected["amount"]),
            "sender_receiver": selected["sender_receiver"],
            "description": selected["description"],
            "account_target": selected.get("account_target", f"{selected['bank']} a/n Soni Julianto"),
            "email_sender": selected.get("email_sender", f"notifikasi@{selected['bank'].lower()}.co.id"),
            "email_subject": selected.get("email_subject", f"Notifikasi Transaksi {selected['bank']}"),
            "time": now_str,
            "ref_no": selected.get("ref_no", f"{selected['bank']}{now.strftime('%Y%m%d%H%M%S')}"),
            "live_synced": True,
            "is_simulation": True,
        }

        # Simpan ke database fisik
        summary = record_new_transaction(trx)
        # Pancarkan ke Socket.IO & buat Lisa berbicara langsung
        await self.broadcast_new_transaction(trx, summary)

        return {
            "status": "success",
            "message": f"Simulasi email transaksi {trx['bank']} {format_rupiah(trx['amount'])} berhasil disiarkan!",
            "transaction": trx,
            "summary": summary
        }


# Global Singleton Instance
email_watcher = EmailWatcher()


def start_email_watcher():
    """Memulai background watcher task saat server startup."""
    global email_watcher
    if email_watcher._watcher_task is None or email_watcher._watcher_task.done():
        loop = asyncio.get_event_loop()
        email_watcher._watcher_task = loop.create_task(email_watcher.run_watcher_loop())
        logger.info("⚡ [Email Watcher Task Started]")


def get_email_watcher() -> EmailWatcher:
    """Mengembalikan instance watcher global."""
    return email_watcher
