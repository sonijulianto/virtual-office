# AI Kantor Virtual 3D (Unreal Engine 5 + LangGraph + Socket.IO)

Sistem Kantor Virtual 3D interaktif di mana avatar AI NPC (Resepsionis, Project Manager, dll.) ditenagai oleh multi-agent framework **LangGraph** dengan model **Gemini Flash**, dan terhubung secara real-time ke **Unreal Engine 5** melalui **Socket.IO**.

---

## 📁 Struktur Direktori

```
kantor_virtual_3d/
├── backend/                       # Backend Python (FastAPI + Socket.IO + LangGraph)
│   ├── app/
│   │   ├── agents/               # Logika Multi-Agent LangGraph
│   │   │   ├── roles/            # Agen spesifik (Sarah - Resepsionis, Budi - Manager)
│   │   │   ├── supervisor.py     # Router Supervisor
│   │   │   ├── state.py          # State manajemen percakapan & kantor
│   │   │   └── graph.py          # Alur StateGraph yang terkompilasi
│   │   ├── schemas/              # Pydantic schema kontrak data UE5
│   │   ├── config.py             # Konfigurasi aplikasi & LLM
│   │   ├── socket_server.py      # Async Socket.IO event handler
│   │   └── main.py               # Entrypoint server ASGI/FastAPI
│   ├── tests/
│   │   └── test_client.py        # Simulator Unreal Engine via Python
│   ├── requirements.txt          # Dependensi Python
│   └── .env.example              # Template variabel lingkungan
└── unreal/
    └── README.md                 # Panduan konfigurasi plugin & Blueprint di UE5
```

---

## 🚀 Panduan Menjalankan Backend

### 1. Masuk ke folder backend & aktifkan Virtual Environment
```bash
cd backend
source .venv/bin/activate
```

### 2. Konfigurasi API Key (Opsional / Recommended)
Salin `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi `GEMINI_API_KEY` Anda di dalam `.env`.
*(Catatan: Jika API key belum diisi, backend otomatis menggunakan Mock Mode cerdas sehingga Anda tetap bisa melakukan testing tanpa hambatan!)*

### 3. Jalankan Server
```bash
python3 -m app.main
```
Server akan berjalan di `http://localhost:8000`.

---

## 🧪 Menguji Komunikasi (Tanpa Buka Unreal Engine Dulu)

Buka terminal baru di folder `backend`:
```bash
# Uji coba otomatis:
./.venv/bin/python3 tests/test_client.py

# Uji coba interaktif (bisa chat langsung dari terminal):
./.venv/bin/python3 tests/test_client.py --interactive
```

---

## 🎮 Integrasi ke Unreal Engine 5

Silakan baca panduan lengkap pada [unreal/README.md](unreal/README.md) untuk setup plugin `SocketIOClient-Unreal` dan konfigurasi Blueprint di UE5.
