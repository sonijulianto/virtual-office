"""
Socket.IO Server for real-time bidirectional communication with Unreal Engine 5.
"""

import socketio
import logging
from app.schemas.protocol import UserMessagePayload
from app.agents.graph import process_office_interaction

logger = logging.getLogger("socket_server")
logging.basicConfig(level=logging.INFO)

# Inisialisasi Async Socket.IO Server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
)


@sio.event
async def connect(sid, environ):
    """
    Dipanggil saat Unreal Engine 5 berhasil tersambung.
    """
    client_ip = environ.get("REMOTE_ADDR", "unknown")
    logger.info(f"🟢 [Socket.IO] Client terhubung: sid={sid}, ip={client_ip}")
    # Kirim status koneksi awal ke UE5
    await sio.emit("system_notification", {"status": "connected", "message": "Terhubung ke AI Virtual Office Server"}, room=sid)


@sio.event
async def disconnect(sid):
    """
    Dipanggil saat Unreal Engine 5 terputus.
    """
    logger.info(f"🔴 [Socket.IO] Client terputus: sid={sid}")


@sio.event
async def user_message(sid, data):
    """
    Menerima pesan chat/ucapan user dari Unreal Engine 5.
    Expected data:
    {
      "user_id": "player_1",
      "target_agent": "auto" | "receptionist" | "manager",
      "message": "Di mana ruang rapat?",
      "room_location": "Lobby"
    }
    """
    logger.info(f"📩 [Socket.IO] Menerima 'user_message' dari sid={sid}: {data}")

    try:
        # Validasi struktur data
        if isinstance(data, str):
            import json
            data = json.loads(data)

        user_payload = UserMessagePayload(**data)

        # Proses melalui alur multi-agent LangGraph
        agent_response = await process_office_interaction(user_payload)

        # Kirimkan kembali ke Unreal Engine 5
        response_dict = agent_response.model_dump()
        logger.info(f"📤 [Socket.IO] Mengirim 'agent_response' ke sid={sid}: {response_dict}")
        await sio.emit("agent_response", response_dict, room=sid)

    except Exception as e:
        logger.error(f"❌ Error saat memproses user_message: {str(e)}", exc_info=True)
        error_payload = {
            "agent_id": "system",
            "agent_name": "Sistem",
            "text": f"Terjadi kesalahan pemrosesan: {str(e)}",
            "animation_trigger": "Idle",
            "action_type": "idle",
            "target_waypoint": None,
            "audio_url": None,
        }
        await sio.emit("agent_response", error_payload, room=sid)


@sio.event
async def ping_ue(sid, data):
    """
    Heartbeat ping dari Unreal Engine untuk mengecek latensi.
    """
    await sio.emit("pong_ue", {"time": data.get("time")}, room=sid)
