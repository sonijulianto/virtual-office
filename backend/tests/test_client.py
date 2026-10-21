"""
Client Simulator: Berperan sebagai Unreal Engine 5 untuk menguji Socket.IO & LangGraph.
"""

import sys
import asyncio
import socketio

# Socket.IO Async Client
sio = socketio.AsyncClient()

SERVER_URL = "http://localhost:8000"


@sio.event
async def connect():
    print("\n✅ [Client] Berhasil terhubung ke server Socket.IO:", SERVER_URL)


@sio.event
async def disconnect():
    print("\n❌ [Client] Terputus dari server.")


@sio.event
async def system_notification(data):
    print(f"🔔 [System Notification]: {data.get('message')}")


@sio.event
async def agent_response(data):
    print("\n" + "=" * 60)
    print("🤖 [RESPON DITERIMA DARI AI KANTOR]")
    print(f" Agen ID    : {data.get('agent_id')}")
    print(f" Nama Agen  : {data.get('agent_name')}")
    print(f" Ucapan     : \"{data.get('text')}\"")
    print(f" Animasi UE : 🎭 {data.get('animation_trigger')}")
    print(f" Aksi       : {data.get('action_type')}")
    print("=" * 60 + "\n")


async def run_automated_test():
    """
    Menjalankan simulasi pertanyaan otomatis untuk memverifikasi routing.
    """
    print("🚀 Menjalankan Automated Verification Test...")
    await asyncio.sleep(1)

    # Test 1: Sapaan ke Resepsionis
    test_1 = {
        "user_id": "player_1",
        "target_agent": "auto",
        "message": "Halo selamat pagi! Di mana ruang rapat utama?",
        "room_location": "Lobby"
    }
    print(f"📤 [Test 1] Mengirim: '{test_1['message']}' (Lokasi: {test_1['room_location']})")
    await sio.emit("user_message", test_1)
    await asyncio.sleep(2)

    # Test 2: Pertanyaan ke Project Manager
    test_2 = {
        "user_id": "player_1",
        "target_agent": "auto",
        "message": "Bagaimana progres sprint dan deadline project kita minggu ini?",
        "room_location": "Meeting Room"
    }
    print(f"📤 [Test 2] Mengirim: '{test_2['message']}' (Lokasi: {test_2['room_location']})")
    await sio.emit("user_message", test_2)
    await asyncio.sleep(2)

    # Test 3: Eksplisit target ke Resepsionis
    test_3 = {
        "user_id": "player_1",
        "target_agent": "receptionist",
        "message": "Bisa tunjukkan di mana toilet dan kafetaria?",
        "room_location": "Hallway"
    }
    print(f"📤 [Test 3] Mengirim (target eksplit: receptionist): '{test_3['message']}'")
    await sio.emit("user_message", test_3)
    await asyncio.sleep(2)

    print("🏁 Selesai Automated Test!")


async def main():
    try:
        await sio.connect(SERVER_URL, socketio_path="socket.io")
    except Exception as e:
        print(f"❌ Gagal menyambung ke server {SERVER_URL}: {e}")
        print("💡 Pastikan server backend sudah berjalan terlebih dahulu!")
        return

    # Jika ada argumen '--interactive', masuk ke mode interaktif CLI
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        print("🎮 Masuk ke mode interaktif. Ketik pesan Anda (atau 'exit' untuk keluar):")
        loop = asyncio.get_running_loop()
        while True:
            user_input = await loop.run_in_executor(None, input, "Anda: ")
            if user_input.strip().lower() in ["exit", "quit", "q"]:
                break
            if not user_input.strip():
                continue
            await sio.emit("user_message", {
                "user_id": "player_1",
                "target_agent": "auto",
                "message": user_input,
                "room_location": "Lobby"
            })
            await asyncio.sleep(1)
    else:
        await run_automated_test()

    await sio.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
