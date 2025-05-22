// osama092/threadgen-backend/ThreadGen-Backend-0f745508f8740e9a5ea964aae7bd5c73d8570f64/utils/rabbitmq.js
const amqp = require('amqplib');

let connection = null;
let channels = {};

const rabbitmqUrl = process.env.RABBITMQ_URI || 'amqp://localhost'; // Use env var

async function connectRabbitMQ() {
  if (connection) return connection;

  try {
    connection = await amqp.connect(rabbitmqUrl);
    console.log('RabbitMQ connected'); // This log should now happen in beforeAll
    
    // Handle connection errors to prevent unhandled rejections
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
      connection = null; // Reset connection
      channels = {};     // Reset channels
    });
    connection.on('close', () => {
      console.log('RabbitMQ connection closed');
      connection = null;
      channels = {};
    });

    return connection;
  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err);
    // connection will remain null, subsequent calls might retry or fail
    throw err; // Re-throw to be caught by caller, e.g., in beforeAll
  }
}

async function getChannelForRoute(route) {
  // Ensure connection exists before trying to create a channel
  if (!connection) {
    await connectRabbitMQ();
  }
  // If connectRabbitMQ failed and threw, connection might still be null
  if (!connection) {
      throw new Error("RabbitMQ connection is not available.");
  }

  if (channels[route]) return channels[route];

  const channel = await connection.createChannel();
  channels[route] = channel;
  console.log(`Channel created for route: ${route}`); // This log should now happen in beforeAll or early in test
  return channel;
}

async function closeRabbitMQ() {
  // Close all channels first
  for (const route in channels) {
    if (channels[route]) {
      try {
        await channels[route].close();
      } catch (err) {
        console.error(`Error closing channel ${route}:`, err);
      }
    }
  }
  channels = {}; // Reset channels object

  if (connection) {
    try {
      await connection.close();
      // 'close' event handler will set connection to null
    } catch (err) {
      console.error('Failed to close RabbitMQ connection:', err);
      connection = null; // Force reset on error too
    }
  }
}

module.exports = { getChannelForRoute, connectRabbitMQ, closeRabbitMQ };