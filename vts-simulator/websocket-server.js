// ==========================================
// VTS WebSocket Gateway
// Redis Pub/Sub -> WebSocket Clients
// ==========================================

const { createClient } = require("redis");
const WebSocket = require("ws");

// ==========================================
// Configuration
// ==========================================

const REDIS_URL = "redis://localhost:6380";

const REDIS_CHANNEL =
  "vts:vehicle:locations";

const WEBSOCKET_PORT = 8080;

// ==========================================
// Redis Subscriber
// ==========================================

const redisSubscriber = createClient({
  url: REDIS_URL
});

redisSubscriber.on("error", (error) => {
  console.error("Redis Error:", error);
});

// ==========================================
// WebSocket Server
// ==========================================

const wss = new WebSocket.Server({
  port: WEBSOCKET_PORT
});

// ==========================================
// Connected Clients
// ==========================================

const clients = new Set();

// ==========================================
// Client Connection
// ==========================================

wss.on("connection", (ws, request) => {

  console.log("\n==========================================");
  console.log("New WebSocket Client Connected");
  console.log("==========================================");

  clients.add(ws);

  console.log(
    `Connected Clients: ${clients.size}`
  );

  // Send connection acknowledgement
  ws.send(
    JSON.stringify({
      event: "connection.established",
      message: "Connected to VTS WebSocket Gateway"
    })
  );

  // ========================================
  // Client Message
  // ========================================

  ws.on("message", (message) => {

    console.log(
      "Client Message:",
      message.toString()
    );
  });

  // ========================================
  // Client Disconnect
  // ========================================

  ws.on("close", () => {

    clients.delete(ws);

    console.log(
      `WebSocket Client Disconnected`
    );

    console.log(
      `Connected Clients: ${clients.size}`
    );
  });

  // ========================================
  // WebSocket Error
  // ========================================

  ws.on("error", (error) => {

    console.error(
      "WebSocket Error:",
      error.message
    );

    clients.delete(ws);
  });
});

// ==========================================
// Broadcast to all clients
// ==========================================

function broadcast(data) {

  const message =
    JSON.stringify(data);

  clients.forEach((client) => {

    if (
      client.readyState === WebSocket.OPEN
    ) {

      client.send(message);
    }
  });

  console.log(
    `Broadcasted to ${clients.size} clients`
  );
}

// ==========================================
// Connect Redis
// ==========================================

async function start() {

  console.log("==========================================");
  console.log("       VTS WEBSOCKET GATEWAY");
  console.log("==========================================");

  console.log(
    `Redis      : ${REDIS_URL}`
  );

  console.log(
    `Redis Channel : ${REDIS_CHANNEL}`
  );

  console.log(
    `WebSocket  : ws://localhost:${WEBSOCKET_PORT}`
  );

  console.log("==========================================");

  // Connect Redis
  await redisSubscriber.connect();

  console.log("Redis connected");

  // ========================================
  // Subscribe to Redis channel
  // ========================================

  await redisSubscriber.subscribe(
    REDIS_CHANNEL,
    (message) => {

      try {

        const event =
          JSON.parse(message);

        console.log(
          "\nRedis Event Received:"
        );

        console.log(event);

        // Send event to every WebSocket client
        broadcast(event);

      } catch (error) {

        console.error(
          "Invalid Redis message:",
          error.message
        );
      }
    }
  );

  console.log(
    `Subscribed to ${REDIS_CHANNEL}`
  );

  console.log(
    `WebSocket server running on port ${WEBSOCKET_PORT}`
  );
}

// ==========================================
// Start
// ==========================================

start().catch((error) => {

  console.error(
    "WebSocket Gateway failed:",
    error
  );

  process.exit(1);
});