const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '/requests.json');
let clients = [];
let clientId = 0;

const sseRequests = (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send('Email parameter is required');
  }



  // Update the global email

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const id = clientId++;
  const client = { id, email, res, timestamp: new Date() };
  clients.push(client);

  const data = fs.readFileSync(filePath, 'utf8');
  const jsonData = JSON.parse(data);
  const filteredData = jsonData.filter(request => request.email === email);
  console.log('Sending initial data to new client:', filteredData);

  res.write(`data: ${JSON.stringify(filteredData)}\n\n`);

  console.log('Connected clients:', clients.map(client => client.id));

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== id);
    clearInterval(keepAlive);
    console.log('Remaining clients:', clients.map(client => client.id));
  });
};

const sendNewDataToClient = (email, updatedData) => {
  const client = clients.find(c => c.email === email);
  if (client) {
    client.res.write(`data: ${JSON.stringify(updatedData)}\n\n`);
  }
};

module.exports = { sseRequests, sendNewDataToClient };
