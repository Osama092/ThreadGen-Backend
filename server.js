const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { getRequests } = require('./requests/getRequests.js');
const { deleteRequest } = require('./requests/deleteRequest.js');
const { addRequest } = require('./requests/addRequest.js'); 

const { getKeys } = require('./apiKeys/getKeys.js');
const { deleteKey } = require('./apiKeys/deleteKey.js');
const { addApiKey } = require('./apiKeys/addKey.js');

const { getFlows } = require('./flows/getFlows.js');
const { getFlowsById } = require('./flows/getFlowsById.js');


const app = express();

const PORT = 5000;

app.use(cors()); // Ensure cors is defined and used
app.use(express.json());

const filePath = path.join(__dirname, './requests/requests.json');

let clients = [];
let clientId = 0;

app.get('/sse-requests', (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send('Email parameter is required');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Assign a unique identifier to the client (e.g., using email)
  const id = clientId++;
  const client = { id, email, res, timestamp: new Date() };
  clients.push(client);

  // Send initial data on connection
  const data = fs.readFileSync(filePath, 'utf8');
  const jsonData = JSON.parse(data);
  console.log('Sending initial data to new client:', jsonData);

  res.write(`data: ${JSON.stringify(jsonData)}\n\n`);

  console.log('Connected clients:', clients.map(client => client.id));
  console.log('Client details:', clients);

  // Heartbeat to keep the connection alive
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  // Handle client disconnection
  req.on('close', () => {
    clients = clients.filter(c => c.id !== id);
    clearInterval(keepAlive);
    console.log('Remaining clients:', clients.map(client => client.id));
  });
});

function sendNewDataToClient(email, updatedData) {
  console.log('Sending new data to client:', email, updatedData);
  const client = clients.find(c => c.email === email);
  if (client) {
    client.res.write(`data: ${JSON.stringify(updatedData)}\n\n`);
  }
}

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}


app.post('/add-random-request', (req, res) => {
  try {
    const email = req.body.email;
    if (!email) {
      return res.status(400).send('Email parameter is required');
    }

    // Read the existing data
    const data = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    // Create a new request with a random 5-character string
    const randomRequest = { 
      id: uuidv4(),
      flow: generateRandomString(5),
      user: generateRandomString(5),
      sent_date: new Date().toLocaleDateString('en-GB').replace(/\//g, ' '),
      tts_text: generateRandomString(10)
     };

    // Add the new request to the data
    jsonData.push(randomRequest);

    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));

    // Notify only the originating SSE client about the updated data
    sendNewDataToClient(email, [randomRequest]); // Only send to originating client
    
    // Respond with a success message
    res.status(201).json({ message: 'Random request added successfully!' });
  } catch (error) {
    console.error('Error adding random request:', error);
    res.status(500).json({ message: 'Error adding random request' });
  }
}
);


//Main dashbord
app.get('/requests', getRequests);
app.delete('/requests/:id', deleteRequest);
app.post('/requests', addRequest);

//Api keys
app.get('/api-keys', getKeys);
app.delete('/api-keys/:id', deleteKey);
app.post('/api-keys', addApiKey);



app.get('/flows', getFlows);



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});