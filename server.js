const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const { getRequests } = require('./requests/getRequests.js');
const { deleteRequest } = require('./requests/deleteRequest.js');
const { sseRequests } = require('./requests/sseRequest.js');
const { addRandomRequest } = require('./requests/addRequest.js');

const { getKeys } = require('./apiKeys/getKeys.js');
const { deleteKey } = require('./apiKeys/deleteKey.js');
const { addApiKey } = require('./apiKeys/addKey.js');

const { getFlows } = require('./flows/getFlows.js');

const { getBills } = require('./bills/getBill.js');
const { deleteBill } = require('./bills/deleteBill.js');

const { getSubscriptions } = require('./paddle/userSubbed.js')
const { getPrices } = require('./paddle/getPrices.js'); // Import the function
const { generateVideo } = require('./apiKeys/genVideo.js'); // Import the function

const { audioCloning } = require('./users/cloneVoice.js'); // Import the function
const { updateSubscription } = require('./paddle/updateSub.js'); // Import the function

const { updatePaymentMethodTransaction } = require('./paddle/updatePayment.js'); // Import the function


const app = express();

const PORT = 5000;

app.use(cors()); // Ensure cors is defined and used
app.use(express.json());
app.use(bodyParser.json());




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
app.get('/subscription', getSubscriptions);

//Flows
app.get('/flows', getFlows);


app.post('/subscriptions', getSubscriptions);
app.get('/prices', getPrices); // Use the function for this route

app.post('/subscriptions/:id/update-payment-method-transaction', updatePaymentMethodTransaction); // Use the function for this route



app.patch('/subscriptions/:subscription_id', updateSubscription); // Use the function for this route


app.post('/generate-video', generateVideo); // Use the function for this route

app.post('/audio-cloning/:id', audioCloning); // Use the function for this route


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // Export the app for testing
