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

// Close the MongoDB client when the application is terminated
process.on('SIGINT', async () => {
  closeChangeStream();
  await client.close();
  console.log("MongoDB client closed.");
  process.exit(0);
});

module.exports = { 
  connectToDatabase, 
  startChangeStream,
  closeChangeStream,
  client 
};