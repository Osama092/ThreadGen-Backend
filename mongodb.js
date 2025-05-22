const { MongoClient, ServerApiVersion } = require('mongodb');

// MongoDB connection URI
const uri = process.env.MONGODB_URI

// Create a new MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let changeStream;

async function connectToDatabase() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log("Connected to MongoDB!");

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return false;
  }
}

// SSE Logic
async function startChangeStream(onChange) {
  try {
    // Ensure client is connected
    if (!client.topology || !client.topology.isConnected()) {
      await connectToDatabase();
    }

    const db = client.db('flowgen_db');
    const collection = db.collection('requests');
    
    // Configure the change stream pipeline to watch for inserts
    const pipeline = [
      { $match: { 'operationType': 'insert' } }
    ];

    // Watch the collection for inserts specifically
    changeStream = collection.watch(pipeline, { fullDocument: 'updateLookup' });
   
    changeStream.on('change', (change) => {
      // We're specifically watching for inserts, so we can directly use fullDocument
      if (change.fullDocument) {
        onChange(change.fullDocument);
      }
    });

    console.log("Started watching MongoDB 'requests' collection for new messages...");
    return changeStream;
  } catch (error) {
    console.error("Error starting change stream:", error);
    return null;
  }
}
// Function to close change stream
function closeChangeStream() {
  if (changeStream) {
    changeStream.close();
    console.log("Change stream closed.");
  }
}

async function closeDatabaseConnection() {
  try {
    // Check if the client exists and is connected
    if (client && typeof client.close === 'function') {
      // Check if topology exists and is connected, for more robust check with newer driver versions
      // This check might vary slightly depending on the MongoDB driver version
      const isConnected = client.topology && client.topology.isConnected();
      if (isConnected) {
        await client.close();
        console.log("MongoDB client closed via explicit call.");
      } else if (!isConnected && client.topology) {
        // If topology exists but says not connected, perhaps it's already closing or closed
        console.log("MongoDB client was not connected, no action taken for closeDatabaseConnection or already closed.");
      } else {
         // If no topology, it might be an older client or not initialized properly
         // Still try to close if the close method exists.
         await client.close();
         console.log("MongoDB client closed (no topology info).");
      }
    }
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
  }
}

// SIGINT handler should also use closeDatabaseConnection if desired for consistency
process.on('SIGINT', async () => {
  closeChangeStream();
  await closeDatabaseConnection(); // Use the new function
  // await client.close(); // Original line
  // console.log("MongoDB client closed."); // Original line
  process.exit(0);
});




module.exports = { 
  connectToDatabase, 
  startChangeStream,
  closeChangeStream,
  client,
  closeDatabaseConnection
};