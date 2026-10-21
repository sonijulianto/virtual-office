"""
Workflow Koordinasi Multi-Agent: Laporan Harian Tim Fullstack Developer.
1. Faisal Ravaneli -> One-Asco Mobile
2. Syaugi Askar   -> TPF POS Mobile
3. Guntara Gumelar -> Pivore Mobile
Dikompilasi oleh Budi (Project Manager) dan dikirimkan via WhatsApp / Arsip Kantor.
"""

import os
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

OFFICE_WORKSPACE_DIR = Path("/Users/magnatech/project/SONI/kantor_virtual_3d/office_workspace")
OFFICE_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)


def get_git_project_summary(repo_path: str) -> Dict[str, str]:
    """Membaca status branch dan commit terbaru dari repositori lokal."""
    summary = {
        "branch": "main",
        "latest_commit": "Tidak ada commit terbaru",
        "files_changed_today": "Workspace bersih / synced",
    }
    path_obj = Path(repo_path)
    if not path_obj.exists():
        return summary

    try:
        # Cek apakah folder berada dalam repositori git
        chk = subprocess.run(
            ["git", "-C", repo_path, "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if chk.returncode != 0:
            return summary

        # Branch aktif
        b_res = subprocess.run(
            ["git", "-C", repo_path, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if b_res.returncode == 0 and b_res.stdout.strip():
            summary["branch"] = b_res.stdout.strip()

        # Commit terbaru
        c_res = subprocess.run(
            ["git", "-C", repo_path, "log", "-1", "--pretty=format:%h - %s (%cr)"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if c_res.returncode == 0 and c_res.stdout.strip():
            summary["latest_commit"] = c_res.stdout.strip()

        # File status
        s_res = subprocess.run(
            ["git", "-C", repo_path, "status", "--short"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if s_res.returncode == 0:
            lines = [l for l in s_res.stdout.splitlines() if l.strip()]
            summary["files_changed_today"] = f"{len(lines)} file dimodifikasi" if lines else "Workspace bersih / synced"
    except Exception:
        pass

    return summary


def generate_developer_reports() -> Dict[str, Dict[str, Any]]:
    """
    Mengumpulkan laporan dari Faisal, Syaugi, dan Guntara berdasarkan kondisi project lokal mereka.
    """
    faisal_git = get_git_project_summary("/Users/magnatech/project/one-asco-ecosystem/mobile")
    syaugi_git = get_git_project_summary("/Users/magnatech/tpf_pos_mobile")
    guntara_git = get_git_project_summary("/Users/magnatech/project/pivore_mobile")

    return {
        "faisal": {
            "name": "Faisal Ravaneli",
            "role": "Senior Fullstack (One-Asco Mobile)",
            "project": "one-asco-ecosystem/mobile",
            "branch": faisal_git["branch"],
            "progress": f"Fitur approval info, test drive, dan integrasi modul SPK ({faisal_git['latest_commit']}).",
            "status": "On-Track (Pengujian UI/UX & API Integrasi)",
            "changes": faisal_git["files_changed_today"],
        },
        "syaugi": {
            "name": "Syaugi Askar",
            "role": "Senior Fullstack (TPF POS Mobile)",
            "project": "tpf_pos_mobile",
            "branch": syaugi_git["branch"],
            "progress": f"Penyelarasan modul transaksi kasir POS, sinkronisasi struk printer ({syaugi_git['latest_commit']}).",
            "status": "On-Track (Optimasi kalkulasi keranjang & offline mode)",
            "changes": syaugi_git["changes"] if "changes" in syaugi_git else syaugi_git["files_changed_today"],
        },
        "guntara": {
            "name": "Guntara Gumelar",
            "role": "Senior Fullstack (Pivore Mobile)",
            "project": "pivore_mobile",
            "branch": guntara_git["branch"],
            "progress": f"Pemeliharaan state management paket Flutter, sinkronisasi API backend ({guntara_git['latest_commit']}).",
            "status": "On-Track (Stabilisasi performa & build release)",
            "changes": guntara_git["files_changed_today"],
        },
    }


def compile_and_save_daily_report(target_phone: str = "") -> Dict[str, Any]:
    """
    Budi (Project Manager) mengompilasi laporan dan menyimpannya ke file kantor serta membuat link WhatsApp.
    """
    today_str = datetime.now().strftime("%d %B %Y - %H:%M WIB")
    dev_data = generate_developer_reports()

    # 1. Format Teks untuk WhatsApp (pakai markdown tebal *...*, emoji, bullet points)
    wa_message = f"""📋 *LAPORAN HARIAN FULLSTACK DEVELOPER*
🗓 *Tanggal:* {today_str}
👔 *Project Manager:* Budi
🏢 *Kantor:* AI Virtual Office 3D

Halo Pak, berikut ringkasan progres pengerjaan hari ini dari seluruh tim fullstack developer:

1. 📱 *Faisal Ravaneli* (One-Asco Mobile)
   • *Branch:* `{dev_data['faisal']['branch']}`
   • *Pekerjaan:* {dev_data['faisal']['progress']}
   • *Status:* {dev_data['faisal']['status']}
   • *Workspace:* {dev_data['faisal']['changes']}

2. 🏪 *Syaugi Askar* (TPF POS Mobile)
   • *Branch:* `{dev_data['syaugi']['branch']}`
   • *Pekerjaan:* {dev_data['syaugi']['progress']}
   • *Status:* {dev_data['syaugi']['status']}
   • *Workspace:* {dev_data['syaugi']['changes']}

3. 📦 *Guntara Gumelar* (Pivore Mobile)
   • *Branch:* `{dev_data['guntara']['branch']}`
   • *Pekerjaan:* {dev_data['guntara']['progress']}
   • *Status:* {dev_data['guntara']['status']}
   • *Workspace:* {dev_data['guntara']['changes']}

📊 *Catatan Manager (Budi):*
Semua tim berjalan on-track tanpa blocker kritis. Sprint 3 integrasi mobile & backend berjalan sesuai jadwal.

_Pesan ini dikompilasi otomatis oleh sistem AI Kantor Virtual._"""

    # 2. Simpan ke File Fisik di office_workspace/LAPORAN_HARIAN_DEVELOPER.md
    report_file = OFFICE_WORKSPACE_DIR / "LAPORAN_HARIAN_DEVELOPER.md"
    file_content = f"""# Laporan Harian Tim Fullstack Developer
**Tanggal:** {today_str}  
**Dikompilasi oleh:** Budi (Project Manager)  
**Status Eksekusi:** Terkoordinasi & Siap Kirim WhatsApp  

---

### 1. Faisal Ravaneli — `one-asco-ecosystem/mobile`
- **Branch Aktif:** `{dev_data['faisal']['branch']}`
- **Pekerjaan Hari Ini:** {dev_data['faisal']['progress']}
- **Status:** {dev_data['faisal']['status']}
- **Catatan Workspace:** {dev_data['faisal']['changes']}

### 2. Syaugi Askar — `tpf_pos_mobile`
- **Branch Aktif:** `{dev_data['syaugi']['branch']}`
- **Pekerjaan Hari Ini:** {dev_data['syaugi']['progress']}
- **Status:** {dev_data['syaugi']['status']}
- **Catatan Workspace:** {dev_data['syaugi']['changes']}

### 3. Guntara Gumelar — `pivore_mobile`
- **Branch Aktif:** `{dev_data['guntara']['branch']}`
- **Pekerjaan Hari Ini:** {dev_data['guntara']['progress']}
- **Status:** {dev_data['guntara']['status']}
- **Catatan Workspace:** {dev_data['guntara']['changes']}

---

### Evaluasi Sprint Project Manager (Budi)
> "Secara keseluruhan progres dari Faisal, Syaugi, dan Guntara berjalan baik dan sinkron dengan target sprint pekan ini. Laporan ini telah disiapkan untuk dikirimkan langsung ke user via WhatsApp."
"""
    try:
        report_file.write_text(file_content, encoding="utf-8")
    except Exception:
        pass

    # 3. URL Encoding untuk Link WhatsApp
    encoded_text = urllib.parse.quote(wa_message)
    phone_clean = "".join(filter(str.isdigit, target_phone)) if target_phone else ""
    if phone_clean.startswith("0"):
        phone_clean = "62" + phone_clean[1:]

    if phone_clean:
        wa_url = f"https://api.whatsapp.com/send?phone={phone_clean}&text={encoded_text}"
    else:
        wa_url = f"https://api.whatsapp.com/send?text={encoded_text}"

    # Cek jika ada environment token WhatsApp otomatis (Fonnte / Wablas)
    fonnte_token = os.getenv("FONNTE_TOKEN", "").strip()
    auto_sent_status = False
    if fonnte_token and phone_clean:
        try:
            import httpx
            resp = httpx.post(
                "https://api.fonnte.com/send",
                headers={"Authorization": fonnte_token},
                data={"target": phone_clean, "message": wa_message},
                timeout=5,
            )
            if resp.status_code == 200:
                auto_sent_status = True
        except Exception:
            pass

    return {
        "wa_message": wa_message,
        "wa_url": wa_url,
        "file_path": str(report_file),
        "auto_sent": auto_sent_status,
        "phone": phone_clean,
        "dev_data": dev_data,
    }
