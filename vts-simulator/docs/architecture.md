# VTS Simulator Architecture DFD

This document describes the current implementation in `simulator.js`, `websocket-server.js`, and `client.js`.

## Scope and Components

- **Vehicle simulator**: generates 10 synthetic vehicle locations, moves them every 10 seconds, and emits `vehicle.location` events.
- **Redis**: runs at `localhost:6380`; holds each vehicle's latest location under `vts:vehicle:<imei>` for 20 seconds and relays live events on `vts:vehicle:locations`.
- **WebSocket gateway**: subscribes to the Redis channel and broadcasts received events to connected WebSocket clients on port `8080`.
- **WebSocket client**: connects to `ws://localhost:8080` and displays received messages.

The simulator and gateway are separate Node.js processes. Redis is their shared integration point. The DFD reflects the current local-development configuration; it does not assume a browser, API server, authentication layer, or durable event store.

## Level 0: Context DFD

```mermaid
flowchart LR
    sim["Vehicle Simulator"]
    redis[("Redis")]
    gateway["WebSocket Gateway"]
    client["WebSocket Client"]

    sim -->|"Latest location: SET key with 20 s expiry"| redis
    sim -->|"vehicle.location event: PUBLISH"| redis
    redis -->|"Published channel messages"| gateway
    gateway -->|"connection.established and vehicle events"| client
    client -.->|"WebSocket connection; inbound messages are logged only"| gateway
```

## Level 1: Process and Data-Store DFD

```mermaid
flowchart LR
    subgraph simulatorProcess["1. Vehicle Simulator Process"]
        vehicleState["In-memory vehicle state\n10 generated vehicles"]
        update["1.1 Move vehicles and create events\nevery 10 seconds"]
        vehicleState --> update
    end

    subgraph redisBoundary["Redis at localhost:6380"]
        latestStore[("D1 Latest-location keys\nvts:vehicle:<imei>\nTTL: 20 seconds")]
        channel["P1 Redis Pub/Sub\nvts:vehicle:locations"]
    end

    subgraph gatewayProcess["2. WebSocket Gateway Process"]
        subscriber["2.1 Subscribe and parse Redis events"]
        fanout["2.2 Broadcast to open WebSocket clients"]
        connectedClients[("D2 In-memory connected-client set")]
        subscriber --> fanout
        connectedClients --> fanout
    end

    subgraph clientProcess["3. WebSocket Client"]
        receive["3.1 Receive and display JSON messages"]
    end

    update -->|"Vehicle JSON, keyed by IMEI"| latestStore
    update -->|"Serialized vehicle.location event"| channel
    channel -->|"Published message"| subscriber
    fanout -->|"JSON event to each open connection"| receive
    clientProcess -.->|"Connect to ws://localhost:8080; inbound payloads only logged by gateway"| gatewayProcess
```

## Level 2: Vehicle-Location Event Flow

```mermaid
sequenceDiagram
    participant Timer as Simulator timer
    participant Sim as Vehicle simulator
    participant Cache as Redis latest-location store
    participant Bus as Redis Pub/Sub channel
    participant Gateway as WebSocket gateway
    participant Client as WebSocket client

    Timer->>Sim: Trigger batch (first batch immediately, then every 10 s)
    loop Each of 10 vehicles
        Sim->>Sim: Move coordinates and create timestamped event
        Sim->>Cache: SET vts:vehicle:<imei> JSON EX 20
        Cache-->>Sim: Write result
        Sim->>Bus: PUBLISH vts:vehicle:locations event JSON
        Bus-->>Gateway: Deliver message to active subscriber
        Gateway->>Gateway: Parse JSON and select OPEN clients
        Gateway-->>Client: Send vehicle.location event
    end
```

### Event and Storage Contracts

The published event has this shape:

```json
{
  "event": "vehicle.location",
  "data": {
    "imei": "35693803564001",
    "vehicleNumber": "MH12AB0001",
    "latitude": 18.5204,
    "longitude": 73.8567,
    "timestamp": "ISO-8601 timestamp"
  }
}
```

The Redis key stores only the `data` object, while Pub/Sub carries the full event envelope. The write to the latest-location key happens before publishing the event.

### Current Behavior and Boundaries

- Redis Pub/Sub is a live relay, not a durable queue: disconnected consumers do not receive missed events later.
- The gateway broadcasts events to every open client; there is no per-vehicle filtering or acknowledgement flow.
- The WebSocket client does not send application commands. Any inbound message is logged by the gateway only.
- The latest-location keys expire after 20 seconds. They are not read by the gateway or client in the current implementation.
- The simulator catches and logs processing errors per vehicle; the gateway catches malformed Redis messages. No retry, replay, or persistence beyond the expiring keys is implemented.
- The current configuration uses local Redis and an unencrypted `ws://` connection. Authentication and authorization are not implemented in these files.