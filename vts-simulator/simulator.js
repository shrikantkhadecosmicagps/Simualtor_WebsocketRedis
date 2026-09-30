// ==========================================
// VTS Vehicle Simulator
// Node.js + Redis + DynamoDB
// ==========================================

const { createClient } = require("redis");

const {
  DynamoDBClient
} = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  PutCommand
} = require("@aws-sdk/lib-dynamodb");

// ==========================================
// Configuration
// ==========================================

const VEHICLE_COUNT = 10;
const INTERVAL = 10_000; // 10 seconds
const REDIS_TTL = 20;    // 20 seconds

const REDIS_URL = "redis://localhost:6380";

const REDIS_CHANNEL = "vts:vehicle:locations";

const DYNAMODB_ENDPOINT = "http://localhost:8000";
const DYNAMODB_TABLE = "VehicleLocations";

// ==========================================
// Different starting locations
// ==========================================

const LOCATIONS = [
  { latitude: 18.5204, longitude: 73.8567 }, // Pune Central
  { latitude: 18.6298, longitude: 73.7997 }, // Pimpri
  { latitude: 18.5913, longitude: 73.7389 }, // Hinjawadi
  { latitude: 18.5987, longitude: 73.7707 }, // Wakad
  { latitude: 18.5596, longitude: 73.7799 }, // Baner
  { latitude: 18.5074, longitude: 73.8077 }, // Kothrud
  { latitude: 18.5463, longitude: 73.9033 }, // Kalyani Nagar
  { latitude: 18.5679, longitude: 73.9143 }, // Viman Nagar
  { latitude: 18.5089, longitude: 73.9259 }, // Hadapsar
  { latitude: 18.6366, longitude: 73.8465 }  // Bhosari
];

// ==========================================
// Movement configuration
// ==========================================

const MOVEMENT = {
  latitude: 0.001,
  longitude: 0.001
};

// ==========================================
// Redis Client
// ==========================================

const redis = createClient({
  url: REDIS_URL
});

redis.on("error", (error) => {
  console.error("Redis Error:", error);
});

// ==========================================
// DynamoDB Client
// ==========================================

const dynamoClient = new DynamoDBClient({
  region: "ap-south-1",

  // DynamoDB Local
  endpoint: DYNAMODB_ENDPOINT,

  // Dummy credentials are enough for DynamoDB Local
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});

const dynamoDB =
  DynamoDBDocumentClient.from(dynamoClient);

// ==========================================
// Generate dummy IMEI
// ==========================================

function generateIMEI(index) {

  return `35693803564${String(index).padStart(3, "0")}`;

}

// ==========================================
// Generate vehicles
// ==========================================

function createVehicles() {

  const vehicles = [];

  for (let i = 0; i < VEHICLE_COUNT; i++) {

    const location = LOCATIONS[i];

    vehicles.push({

      imei: generateIMEI(i + 1),

      vehicleNumber:
        `MH${String(12 + i).padStart(2, "0")}AB${String(
          i + 1
        ).padStart(4, "0")}`,

      latitude: location.latitude,

      longitude: location.longitude,

      directionLatitude:
        Math.random() > 0.5 ? 1 : -1,

      directionLongitude:
        Math.random() > 0.5 ? 1 : -1
    });
  }

  return vehicles;
}

// ==========================================
// Move vehicle
// ==========================================

function moveVehicle(vehicle) {

  const latitudeChange =
    Math.random() *
    MOVEMENT.latitude *
    vehicle.directionLatitude;

  const longitudeChange =
    Math.random() *
    MOVEMENT.longitude *
    vehicle.directionLongitude;

  vehicle.latitude += latitudeChange;

  vehicle.longitude += longitudeChange;

  // Randomly change latitude direction
  if (Math.random() < 0.2) {
    vehicle.directionLatitude *= -1;
  }

  // Randomly change longitude direction
  if (Math.random() < 0.2) {
    vehicle.directionLongitude *= -1;
  }
}

// ==========================================
// Create location event
// ==========================================

function createLocationEvent(vehicle) {

  moveVehicle(vehicle);

  return {

    event: "vehicle.location",

    data: {

      imei: vehicle.imei,

      vehicleNumber: vehicle.vehicleNumber,

      latitude: Number(
        vehicle.latitude.toFixed(6)
      ),

      longitude: Number(
        vehicle.longitude.toFixed(6)
      ),

      timestamp: new Date().toISOString()
    }
  };
}

// ==========================================
// Store vehicle in Redis
// ==========================================

async function storeVehicle(event) {

  const vehicle = event.data;

  const key =
    `vts:vehicle:${vehicle.imei}`;

  await redis.set(
    key,
    JSON.stringify(vehicle),
    {
      EX: REDIS_TTL
    }
  );

  console.log(
    `REDIS SET  | ${vehicle.imei} | TTL ${REDIS_TTL}s`
  );
}

// ==========================================
// Publish vehicle event
// ==========================================

async function publishVehicle(event) {

  await redis.publish(
    REDIS_CHANNEL,
    JSON.stringify(event)
  );

  console.log(
    `REDIS PUB  | ${event.data.imei}`
  );
}

// ==========================================
// Store vehicle location in DynamoDB
// ==========================================

async function storeVehicleHistory(event) {

  const vehicle = event.data;

  await dynamoDB.send(
    new PutCommand({

      TableName: DYNAMODB_TABLE,

      Item: {

        // Partition Key
        imei: vehicle.imei,

        // Sort Key
        timestamp: vehicle.timestamp,

        vehicleNumber:
          vehicle.vehicleNumber,

        latitude:
          vehicle.latitude,

        longitude:
          vehicle.longitude

      }

    })
  );

  console.log(
    `DYNAMODB   | ${vehicle.imei} | ${vehicle.timestamp}`
  );
}

// ==========================================
// Process vehicle
// ==========================================

async function processVehicle(vehicle) {

  const event =
    createLocationEvent(vehicle);

  // ----------------------------------------
  // 1. Store latest location in Redis
  // ----------------------------------------

  await storeVehicle(event);

  // ----------------------------------------
  // 2. Publish live event through Redis
  // ----------------------------------------

  await publishVehicle(event);

  // ----------------------------------------
  // 3. Store historical location
  // ----------------------------------------

  await storeVehicleHistory(event);

  console.log(
    `LOCATION   | ${event.data.latitude}, ${event.data.longitude}`
  );
}

// ==========================================
// Send all vehicles
// ==========================================

async function sendVehicleLocations() {

  console.log("\n");

  console.log(
    "=========================================="
  );

  console.log(
    `Location Update - ${new Date().toISOString()}`
  );

  console.log(
    "=========================================="
  );

  for (const vehicle of vehicles) {

    try {

      await processVehicle(vehicle);

    } catch (error) {

      console.error(
        `Vehicle ${vehicle.imei} failed:`,
        error.message
      );

    }
  }
}

// ==========================================
// Initialize vehicles
// ==========================================

const vehicles = createVehicles();

// ==========================================
// Start simulator
// ==========================================

async function start() {

  console.log(
    "=========================================="
  );

  console.log(
    "        VTS VEHICLE SIMULATOR"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Vehicles : ${VEHICLE_COUNT}`
  );

  console.log(
    `Interval : ${INTERVAL / 1000} seconds`
  );

  console.log(
    `Redis TTL: ${REDIS_TTL} seconds`
  );

  console.log(
    `Redis    : ${REDIS_URL}`
  );

  console.log(
    `Channel  : ${REDIS_CHANNEL}`
  );

  console.log(
    `DynamoDB : ${DYNAMODB_ENDPOINT}`
  );

  console.log(
    `Table    : ${DYNAMODB_TABLE}`
  );

  console.log(
    "=========================================="
  );

  // ========================================
  // Connect Redis
  // ========================================

  console.log(
    "Connecting to Redis..."
  );

  await redis.connect();

  console.log(
    "Redis connected"
  );

  console.log(
    "DynamoDB Local configured"
  );

  console.log(
    "Simulator started"
  );

  // ========================================
  // First update immediately
  // ========================================

  await sendVehicleLocations();

  // ========================================
  // Continue every 10 seconds
  // ========================================

  setInterval(
    sendVehicleLocations,
    INTERVAL
  );
}

// ==========================================
// Start
// ==========================================

start().catch((error) => {

  console.error(
    "Simulator failed:",
    error
  );

  process.exit(1);

});