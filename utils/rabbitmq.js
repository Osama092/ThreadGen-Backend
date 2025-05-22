const amqp = require('amqplib');

let connection = null;
let channels = {}; 

const rabbitmqUrl = process.env.RABBITMQ_URI || 'amqp://localhost'; // Use env var
// Connects to RabbitMQ and returns the connection
async function connectRabbitMQ() {
  if (connection) return connection; 

  try {
    connection = await amqp.connect(rabbitmqUrl);
    console.log('RabbitMQ connected');
    return connection;
  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err);
    throw err;
  }
}

// Gets a channel for a specific route (if it doesn't exist, it creates one)
async function getChannelForRoute(route) {
  if (channels[route]) return channels[route]; 

  const connection = await connectRabbitMQ(); 
  const channel = await connection.createChannel(); 
  channels[route] = channel; 
  console.log(`Channel created for route: ${route}`);
  return channel;
}

module.exports = { getChannelForRoute };
