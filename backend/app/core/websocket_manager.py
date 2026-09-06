import logging
import json
from typing import List, Set, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger("medikiosk.websocket")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("New WebSocket client connected. Total active connections: %d", len(self.active_connections))
        # Send initial handshake / welcome packet
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "message": "Connected to MediKiosk Emergency Alert Stream",
            "active_clients": len(self.active_connections)
        })

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected. Total active connections: %d", len(self.active_connections))

    async def broadcast_json(self, data: Dict[str, Any]):
        """
        Broadcasts JSON data to all active WebSocket clients.
        Automatically purges any dead or disconnected sockets.
        """
        if not self.active_connections:
            logger.info("No active WebSocket clients connected to receive alert: %s", data.get("type"))
            return

        dead_connections = []
        logger.info("Broadcasting '%s' to %d clients...", data.get("type", "EVENT"), len(self.active_connections))

        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning("Error sending WebSocket message to client: %s. Marking for removal.", e)
                dead_connections.append(connection)

        for dead in dead_connections:
            self.active_connections.discard(dead)

    def active_count(self) -> int:
        return len(self.active_connections)

# Global singleton
ws_manager = ConnectionManager()
