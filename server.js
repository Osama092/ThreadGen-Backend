const express = require('express');
const cors = require('cors');
const fs = require('fs');

const { getRequests } = require('./requests/getRequests.js');
const { deleteRequest } = require('./requests/deleteRequest.js');
const { sseRequests } = require('./requests/sseRequest.js');
const { addRandomRequest } = require('./requests/addRequest.js');

const { getKeys } = require('./apiKeys/getKeys.js');
const { deleteKey } = require('./apiKeys/deleteKey.js');
const { addApiKey } = require('./apiKeys/addKey.js');

const { getFlows } = require('./flows/getFlows.js');

const { getBills } = require('./bills/getBill.js');
const { getSubscriptions } = require('./bills/getSubcription.js');
const { deleteBill } = require('./bills/deleteBill.js');



const app = express();

const PORT = 5000;

app.use(cors()); // Ensure cors is defined and used
app.use(express.json());




//Main dashbord
app.delete('/requests/:id', deleteRequest);
app.get('/sse-requests', sseRequests);
app.post('/add-random-request', addRandomRequest);

//Api keys
app.get('/api-keys', getKeys);
app.delete('/api-keys/:id', deleteKey);
app.post('/api-keys', addApiKey);


//Bill
app.get('/bills/:user', getBills);
app.delete('/bills/:id', deleteBill);
app.get('/subscriptions', getSubscriptions);

//Flows
app.get('/flows', getFlows);



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // Export the app for testing
