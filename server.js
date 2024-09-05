const express = require('express');
const cors = require('cors');
const { getRequests } = require('./dashboard/getRequests.js');
const { deleteRequest } = require('./dashboard/deleteRequest.js');
const { addRequest } = require('./dashboard/addRequest.js'); 

const { getKeys } = require('./apiKeys/getKeys.js');
const { deleteKey } = require('./apiKeys/deleteKey.js');
const { addApiKey } = require('./apiKeys/addKey.js');

const app = express();
const PORT = 5000;

app.use(cors()); // Ensure cors is defined and used


//Main dashbord
app.get('/requests', getRequests);
app.delete('/requests/:id', deleteRequest);
app.post('/requests', addRequest);

//Api keys
app.get('/api-keys', getKeys);
app.delete('/api-keys/:id', deleteKey);
app.post('/api-keys', addApiKey);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});