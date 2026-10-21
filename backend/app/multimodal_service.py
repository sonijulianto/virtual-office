"""
Multimodal Service: Image & Video Analysis powered by Google Gemini Multimodal API.
Mendukung analisis gambar (screenshot bug, mockup UI, bukti transfer, foto dokumen)
dan video (rekaman layar aplikasi, demo fitur, konten video promo)
yang dikirim user saat berinteraksi dengan agen di Kantor Virtual 3D.
"""

import os
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List

from google import genai
from google.genai import types
from app.config import get_gemini_api_key, get_gemini_model

logger = logging.getLogger("multimodal_service")

# Model-model multimodal Gemini dengan urutan prioritas responsif
MULTIMODAL_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
]


def detect_media_kind(mime_type: str, file_path: str) -> str:
    """Menentukan apakah media berjenis gambar atau video."""
    m_lower = (mime_type or "").lower()
    p_lower = (file_path or "").lower()
    if any(k in m_lower for k in ["video", "mp4", "webm", "quicktime", "mov", "mkv"]) or any(p_lower.endswith(ext) for ext in [".mp4", ".webm", ".mov", ".avi", ".mkv"]):
        return "video"
    return "image"


def get_role_context_instruction(agent_id: str, agent_name: str, project_workspace: Optional[str] = None) -> str:
    """Menyusun instruksi khusus analisis visual berdasarkan divisi & persona agen."""
    cwd = project_workspace or "workspace kantor"
    a_id = (agent_id or "").lower()

    if a_id in ["faisal", "syaugi", "guntara", "developer"]:
        return (
            f"Anda adalah {agent_name}, developer ahli di project `{cwd}`.\n"
            f"Fokus Analisis Visual:\n"
            f"1. Periksa screenshot atau rekaman video layar dengan teliti: amati UI layout Flutter, pesan error merah, stack trace, overflow pixel, status bar, atau bug interaksi yang tampak.\n"
            f"2. Hubungkan visual tersebut dengan arsitektur kode di `{cwd}`.\n"
            f"3. Berikan diagnosis akar masalah secara teknis namun mudah dipahami, serta sebutkan komponen/file mana di lib/ yang perlu di-edit atau diperbaiki beserta contoh kodenya jika relevan.\n"
            f"4. Tetap gunakan bahasa profesional seorang engineer senior."
        )
    elif a_id == "marketing":
        return (
            f"Anda adalah {agent_name} (Creative & Social Media Marketing Lead).\n"
            f"Fokus Analisis Visual:\n"
            f"1. Evaluasi daya pikat visual: komposisi warna, tipografi, kejelasan branding, serta hook visual dalam video/gambar promo.\n"
            f"2. Berikan kritik membangun untuk meningkatkan click-through rate (CTR), engagement, dan daya tarik bagi audiens di Instagram Reels, TikTok, atau YouTube.\n"
            f"3. Buatkan rekomendasi copywriting, caption persuasif, dan ide hook alternatif yang lebih viral."
        )
    elif a_id == "lisa":
        return (
            f"Anda adalah {agent_name} (Finance & Bank Reconciliation Specialist).\n"
            f"Fokus Analisis Visual:\n"
            f"1. Periksa dokumen, struk, faktur, invoice, atau tangkapan layar bukti transfer perbankan (BCA/BRI/QRIS) yang dikirim user.\n"
            f"2. Ekstrak data kunci transaksi: Nama Bank, Nominal Rupiah (Rp), Nama Pengirim & Penerima, Tanggal/Waktu, serta Nomor Referensi Transaksi.\n"
            f"3. Konfirmasikan keabsahan bukti tersebut dan nyatakan apakah mutasi ini siap dicatat/direkonsiliasikan ke dalam buku kas dan laporan harian jam 10 malam."
        )
    elif a_id == "manager":
        return (
            f"Anda adalah {agent_name} (Project Manager & Sprint Lead).\n"
            f"Fokus Analisis Visual:\n"
            f"1. Evaluasi diagram, roadmap, sprint board, atau dokumen progres proyek yang tampak pada gambar/video.\n"
            f"2. Berikan arahan manajerial terkait alokasi tugas tim (Faisal, Syaugi, Guntara), prioritas sprint, dan mitigasi potensi delay."
        )
    else:
        return (
            f"Anda adalah {agent_name} di Kantor Virtual 3D.\n"
            f"Analisis gambar atau video yang dikirimkan user secara ramah, terstruktur, dan relevan dengan tugas Anda."
        )


def analyze_multimodal_content(
    media_path: str,
    mime_type: str,
    user_prompt: str,
    agent_id: str,
    agent_name: str,
    role_system_prompt: str = "",
    project_workspace: Optional[str] = None,
) -> str:
    """
    Fungsi utama untuk memproses file gambar atau video via Google Gemini Multimodal.
    Mengembalikan teks analisis komprehensif dalam bahasa Indonesia.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        return "Maaf, API Key Gemini belum terkonfigurasi untuk analisis media visual."

    path_obj = Path(media_path)
    if not path_obj.exists():
        logger.error(f"File media tidak ditemukan di server: {media_path}")
        return f"Maaf, file media `{path_obj.name}` tidak ditemukan di server untuk dianalisis."

    file_size = path_obj.stat().st_size
    media_kind = detect_media_kind(mime_type, media_path)
    logger.info(f"📸 [Multimodal Analysis Start] agent={agent_id} kind={media_kind} mime={mime_type} size={file_size} bytes path={media_path}")

    # Fallback mime type jika kosong atau generik
    final_mime = mime_type
    if not final_mime or final_mime == "application/octet-stream":
        suffix = path_obj.suffix.lower()
        if suffix in [".png"]: final_mime = "image/png"
        elif suffix in [".jpg", ".jpeg"]: final_mime = "image/jpeg"
        elif suffix in [".webp"]: final_mime = "image/webp"
        elif suffix in [".mp4"]: final_mime = "video/mp4"
        elif suffix in [".webm"]: final_mime = "video/webm"
        elif suffix in [".mov"]: final_mime = "video/quicktime"
        else: final_mime = "image/png" if media_kind == "image" else "video/mp4"

    client = genai.Client(api_key=api_key)

    # Susun konten input media
    media_part = None
    uploaded_file_obj = None

    try:
        # Jika ukuran file <= 20MB, gunakan inline bytes
        if file_size <= 20 * 1024 * 1024:
            with open(path_obj, "rb") as f:
                data_bytes = f.read()
            media_part = types.Part.from_bytes(data=data_bytes, mime_type=final_mime)
        else:
            # Jika video/file besar > 20MB, gunakan Gemini Files Upload API
            logger.info(f"Uploading large {media_kind} file ({file_size} bytes) to Gemini Files API...")
            uploaded_file_obj = client.files.upload(file=str(path_obj), mime_type=final_mime)
            # Tunggu jika file video masih processing di server Google
            if media_kind == "video":
                for _ in range(15):
                    f_info = client.files.get(name=uploaded_file_obj.name)
                    if f_info.state == "ACTIVE":
                        break
                    time.sleep(2)
            media_part = uploaded_file_obj

    except Exception as e:
        logger.error(f"Gagal menyiapkan part media untuk Gemini: {e}", exc_info=True)
        return f"Gagal membaca file {media_kind}: {str(e)}"

    # Prompt instruksi multimodal terpadu
    role_instruction = get_role_context_instruction(agent_id, agent_name, project_workspace)
    effective_user_query = user_prompt.strip() if user_prompt and user_prompt.strip() else f"Tolong periksa dan analisis {media_kind} yang saya kirim ini."

    full_multimodal_prompt = f"""{role_system_prompt.strip()}

=== INSTRUKSI ANALISIS {media_kind.upper()} OLEH {agent_name.upper()} ===
{role_instruction}

Pertanyaan / Pesan dari User:
"{effective_user_query}"

Panduan Format Output:
- Awali dengan sapaan khas Anda dan konfirmasi bahwa Anda telah melihat {media_kind} yang dikirim.
- Gunakan format Markdown yang rapi (headings, bullet points, kode tebal `code`).
- Berikan analisis visual yang tajam, spesifik, dan actionable (dapat langsung ditindaklanjuti).
- Jika user mengirim screenshot error / bug, berikan langkah perbaikan teknis yang konkrit.
- Jika user mengirim bukti transfer (Lisa), berikan rekap data mutasi yang terbaca jelas."""

    contents_payload = [media_part, full_multimodal_prompt]

    # Eksekusi dengan model fallback
    last_error = None
    for model_name in MULTIMODAL_MODELS:
        try:
            logger.info(f"Mencoba analisis multimodal dengan model: {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=contents_payload,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=2048,
                )
            )
            if response and response.text:
                result_text = response.text.strip()
                logger.info(f"✅ Analisis multimodal berhasil menggunakan model: {model_name}")
                return result_text
        except Exception as e:
            logger.warning(f"Model {model_name} gagal ({e}), mencoba model fallback...")
            last_error = e

    return f"Maaf, tidak dapat menyelesaikan analisis {media_kind} saat ini: {str(last_error)}"
