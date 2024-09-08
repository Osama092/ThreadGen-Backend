const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');


function sendNewDataToClient(email, updatedData) {
  console.log('Sending new data to client:', email, updatedData);
  const client = clients.find(c => c.email === email);
  if (client) {
    client.res.write(`data: ${JSON.stringify(updatedData)}\n\n`);
  }
}

const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};




const addRequest = (req, res) => {
  const filePath = path.join(__dirname, 'requests.json');

  try {
    const email = req.body.email
    if (!email) {
      return res.status(400).send('Email parameter is required');
    }
    // Read the existing data
    const data = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    const randomRequest = {
      id: uuidv4(),
      flow: generateRandomString(5),
      user: generateRandomString(5),
      sent_date: new Date().toLocaleDateString('en-GB').replace(/\//g, ' '),
      tts_text: generateRandomString(10)
    };

    jsonData.push(randomRequest);

    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));

    sendNewDataToClient(email, [randomRequest]); // Only send to originating client

    res.status(201).json({ message: 'Random request added successfully!' });


  } catch (error) {
    console.error('Failed to add random request:', error);
    res.status(500).json({ error: 'Failed to add random request' });
  }


};

module.exports = { addRequest };