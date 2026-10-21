# Panduan Integrasi Unreal Engine 5 dengan AI Virtual Office

Dokumen ini menjelaskan langkah demi langkah untuk menghubungkan **Unreal Engine 5** ke backend **Socket.IO & LangGraph** yang sudah kita buat.

---

## 1. Persiapan Plugin di Unreal Engine

Klien Socket.IO standar yang paling stabil untuk Unreal Engine adalah:
👉 **[SocketIOClient-Unreal (oleh getnamo)](https://github.com/getnamo/SocketIOClient-Unreal)**

### Cara Instalasi Plugin:
1. Unduh release terbaru dari repositori GitHub di atas (sesuaikan dengan versi UE Anda, misal UE 5.3 / 5.4 / 5.5).
2. Buat folder `Plugins` di dalam folder proyek Unreal Engine Anda:
   ```
   MyVirtualOfficeProject/
   ├── Content/
   ├── Plugins/
   │   └── SocketIOClient-Unreal/
   └── MyVirtualOfficeProject.uproject
   ```
3. Buka Unreal Editor -> Buka menu **Edit > Plugins**, cari **Socket.IO Client**, dan pastikan checkbox **Enabled** dicentang.
4. Restart Unreal Editor jika diminta.

---

## 2. Membuat Blueprint Komunikasi (`BP_OfficeSocketManager`)

1. Di Content Browser, buat sebuah **Actor Blueprint** baru dan beri nama `BP_OfficeSocketManager`.
2. Buka blueprint tersebut dan tambahkan komponen:
   - Klik **Add Component** -> cari dan pilih **SocketIOClient**.
3. Pada panel **Details** dari komponen `SocketIOClient`:
   - **Server Address**: `http://localhost:8000` (atau IP LAN jika backend berjalan di komputer terpisah).
   - **Socket.io Path**: `/socket.io`
   - **Auto Connect**: Centang `True` (atau panggil fungsi `Connect` pada `Event BeginPlay`).

---

## 3. Menghubungkan Event (Visual Scripting)

### A. Mendengarkan Response AI (`agent_response`)
Di dalam `Event Graph` pada `BP_OfficeSocketManager`:

1. Tarik pin dari `SocketIOClient` -> panggil fungsi **`Bind Event to Event`**.
2. Isi kolom **Event Name** dengan: `agent_response`.
3. Dari delegasi event tersebut, buat Custom Event baru, misal: `OnAgentResponseReceived`.
4. Output dari event ini berupa `SIOJsonValue` atau string JSON.
5. Gunakan node **Get Object Field** / **Json String to SIOJsonObject** untuk membaca properti:
   - `agent_id` (String): ID karakter (misal `receptionist` atau `manager`).
   - `text` (String): Teks ucapan AI.
   - `animation_trigger` (String): Nama animasi (misal `Talk_Friendly`, `Wave`, `Think`).
   - `action_type` (String): `gesture` atau `walk_to`.

---

### B. Memicu Animasi Karakter 3D (MetaHuman / Avatar)

Saat menerima `animation_trigger`:
1. Dapatkan referensi Skeletal Mesh karakter yang sesuai dengan `agent_id` (misalnya Avatar Resepsionis di meja lobi).
2. Panggil node **Play Anim Montage**:
   - Jika `animation_trigger == "Wave"` -> Putar montage lambaian tangan.
   - Jika `animation_trigger == "Talk_Friendly"` -> Putar montage gestur berbicara ramah.
   - Jika `animation_trigger == "Think"` -> Putar montage gestur berpikir / menimbang.
3. Tampilkan teks di atas kepala karakter menggunakan:
   - **Widget Component** (3D UI World Space) dengan Text Block animasi typewriter, atau
   - HUD Chat Box pemain.

---

### C. Mengirim Pesan dari Pemain ke Backend (`user_message`)

Saat pemain menekan Enter pada UI Chat Box atau berinteraksi dengan tombol "Bicara":
1. Buat JSON Object menggunakan node **Construct Json Object**:
   - `Set String Field`:
     - `"user_id"` = `"player_1"`
     - `"target_agent"` = `"auto"` (atau `"receptionist"` jika pemain sedang berinteraksi di meja resepsionis)
     - `"message"` = `[Teks dari TextBox UI]`
     - `"room_location"` = `[Nama area pemain saat ini, misal: "Lobby" / "Meeting Room"]`
2. Tarik pin dari `SocketIOClient` -> panggil node **Emit Object**:
   - **Event Name**: `user_message`
   - **Object**: JSON Object yang baru dibuat.

---

## 4. Skema Ruangan Kantor Virtual 3D yang Direkomendasikan

| Nama Ruangan | Karakter Default | Peran Utama | Trigger Animasi Umum |
| :--- | :--- | :--- | :--- |
| **Lobby Utama** | Sarah (Receptionist) | Menyambut, panduan denah, info umum | `Wave`, `Talk_Friendly` |
| **Meeting Room Alpha** | Budi (Project Manager) | Update sprint, agenda rapat, task board | `Talk_Professional`, `Think` |
| **Developer Workspace** | Agen IT / Coder (Tahap Lanjut) | Diskusi kode & arsitektur teknis | `Type_Keyboard`, `Explain` |
| **Cafeteria** | Avatar Bebas | Ruang istirahat interaktif | `Drink_Coffee`, `Sit` |

---

## 5. Ringkasan Alur Lengkap

```
Pemain di UE5 ketik pesan / bicara
  └──> BP_OfficeSocketManager (Emit: 'user_message')
        └──> Server Python Socket.IO (Port 8000)
              └──> LangGraph Supervisor (Pilih Sarah / Budi)
                    └──> Agen AI Memproses Respon
                          └──> Server Emit: 'agent_response'
                                └──> UE5 Terima Response
                                      ├──> Mainkan Anim Montage
                                      └──> Render Teks di Atas Avatar 3D
```
