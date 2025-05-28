const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { ObjectId } = require('mongodb');
require('dotenv').config();

// Database connection
const { connectToDatabase, client } = require('./mongodb');

// Route handlers - API Keys
const { getKeys } = require('./routes/apiKeys/getKeys.js');
const { deleteKey } = require('./routes/apiKeys/deleteKey.js');
const { addKey } = require('./routes/apiKeys/addKey.js');
const { patchKey } = require('./routes/apiKeys/patchKey.js');
const { getPlayerConfig } = require('./routes/apiKeys/getPlayerConfig.js');
const { generateVideo } = require('./routes/apiKeys/genVideo.js');
const { getUserApiKeys } = require('./routes/apiKeys/getUserApiKeys.js');

// Route handlers - Paddle/Subscription
const { getSubscriptions } = require('./routes/paddle/userSubbed.js');
const { getPrices } = require('./routes/paddle/getPrices.js');
const { updateSubscription } = require('./routes/paddle/updateSub.js');
const { updatePaymentMethodTransaction } = require('./routes/paddle/updatePayment.js');
const { cancelSubscription } = require('./routes/paddle/cancelSub.js');

// Route handlers - Users
const { addUser } = require('./routes/users/addUser');
const { audioCloning } = require('./routes/users/cloneVoice.js');
const { startCloneListener } = require('./routes/users/cloneListener.js');

const { addKPIs } = require('./routes/users/addKPIs.js');
const { getUserKPIs } = require('./routes/users/getUserKPIs.js');
const { getUserById } = require('./routes/users/getUser.js');


// Route handlers - Threads
const { getThreads } = require('./routes/threads/getThreads.js');
const { getUserThreads } = require('./routes/threads/getUserThreads.js');
const { ccGen } = require('./routes/threads/addTranscript.js');
const { uploadThread } = require('./routes/threads/threadUpload.js');
const { addThread } = require('./routes/threads/addThread.js');
const { startThreadListener } = require('./routes/threads/threadListener.js');

// Route handlers - Campaigns
const { addCampaign } = require('./routes/campaigns/addCampaign.js');
const { updateCampaign } = require('./routes/campaigns/editCampaign.js');
const { getCampaignsByUser } = require('./routes/campaigns/getUserCampaigns.js');
const { startCampaignListener } = require('./routes/campaigns/campaignListener.js');

// Route handlers - Requests
const sseRequest = require('./routes/requests/sseRequest.js');
const { addRequest } = require('./routes/requests/addRequest.js');

// Initialize Express app
const app = express();
const PORT = 5000;

// Configure middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true
}));
app.use(express.json());
app.use(bodyParser.json());
app.use('/userData', express.static(path.join(__dirname, 'userData')));
app.use('/player', express.static(path.join(__dirname, 'player')));

// Connect to database (this part is fine to be outside the main module check, as it sets up the client)
connectToDatabase().then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('Error connecting to MongoDB:', err);
});

// API Routes
// User routes
app.post('/users', addUser);
app.get('/users/:user_id', getUserById);

// Thread routes
app.get('/threads', getThreads);
app.get('/threads/get-user-threads', getUserThreads);
app.post('/threads/add-thread', addThread);
app.post('/threads/upload-thread', uploadThread);
app.post('/transcript-video', ccGen);

// API Key routes
app.get('/api-keys', getKeys);
app.post('/api-keys/add-key', addKey);
app.delete('/api-keys/delete-key/:key', deleteKey);
app.get('/api-keys/get-user-api-keys', getUserApiKeys);
app.patch('/api-keys/patch-key/:key', patchKey)
// Campaign routes
app.get('/campaigns/:user_id', getCampaignsByUser);
app.post('/campaigns/add-campaign', addCampaign);
app.put('/campaigns/edit-campaign/:campaign_id', updateCampaign);

// Request - SSE
app.post('/requests/add-request', addRequest);
app.post('/register-user', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) {
    return res.status(400).send("User id is required.");
  }
  console.log(`User ${user_id} registered for SSE.`);
  res.status(200).send("User registered for SSE.");
});

app.get('/requests/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const db = client.db('flowgen_db');
    const collection = db.collection('requests');

    const requestsDocuments = await collection.find({ user_id }).toArray();
    console.log(`Fetched ${requestsDocuments.length} documents for user ${user_id}`);
    res.json(requestsDocuments);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).send("Error fetching requests.");
  }
});

// Subscription routes
app.get('/subscription', getSubscriptions);
app.post('/subscriptions', getSubscriptions);
app.patch('/subscriptions/:subscription_id', updateSubscription);
app.post('/subscriptions/:id/update-payment-method-transaction', updatePaymentMethodTransaction);
app.post('/subscriptions/:id/cancel', cancelSubscription);
app.get('/prices', getPrices);

// Media related
app.post('/generate-video', generateVideo);
app.post('/clone-audio', audioCloning);
app.post('/player-config', getPlayerConfig);
app.post('/player-kpi', addKPIs)
app.post('/player-kpi/get-user-kpis', getUserKPIs);

// Health check
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});
module.exports = app;

if (require.main === module) {
  // Only run listeners and start the server if server.js is run directly (not during tests)
  // Re-connect for direct run, useful if the above connection failed or for clarity
  connectToDatabase().then(() => { 
    console.log('MongoDB connected successfully for direct run');

    sseRequest.initializeSSE(app);
    console.log('SSE system initialized for direct run');

    startThreadListener().then(success => {
      console.log('Thread listener started:', success ? 'success' : 'failed');
    }).catch(err => {
      console.error('Error starting thread listener:', err);
    });

    // MOVED THESE CALLS INSIDE THIS BLOCK
    startCloneListener().then(status => {
      console.log(`Clone listener started: ${status ? 'success' : 'failed'}`);
    }).catch(err => {
      console.error('Error starting clone listener:', err);
    });

    // MOVED THESE CALLS INSIDE THIS BLOCK
    startCampaignListener().then(status => {
      console.log(`Campaign listener started: ${status ? 'success' : 'failed'}`);
    }).catch(err => {
      console.error('Error starting campaign listener:', err);
    });

    const port = 5000;
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }).catch(err => {
    console.error('Error during direct server run setup:', err);
  });
}
