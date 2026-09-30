const WebSocket = require("ws");

const ws = new WebSocket(
  "ws://localhost:8080"
);

ws.on("open", () => {
  console.log(
    "Connected to VTS WebSocket"
  );
});

ws.on("message", (message) => {

  console.log(
    "Received:",
    JSON.parse(message)
  );

});

ws.on("close", () => {

  console.log(
    "Disconnected"
  );

});