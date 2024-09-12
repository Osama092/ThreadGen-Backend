const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { sendNewDataToClient } = require('./sseRequest');

const filePath = path.join(__dirname, './requests.json');

const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};
const addRandomRequest = (req, res) => {
  try {
    const apiKey = req.body.apiKey;
    if (!apiKey) {
      return res.status(400).send('API key parameter is required');
    }

    const apiKeysPath = path.join(__dirname, '../apiKeys/apiKeys.json');
    let apiKeysData;
    try {
      apiKeysData = fs.readFileSync(apiKeysPath, 'utf8');
    } catch (err) {
      throw new Error(`Error reading API keys file: ${err.message}`);
    }

    const apiKeysJson = JSON.parse(apiKeysData);

    const apiKeyEntry = apiKeysJson.find(key => key.apiKey === apiKey);
    if (!apiKeyEntry) {
      return res.status(401).send('Invalid API key');
    }

    const email = apiKeyEntry.email;

    let data;
    try {
      data = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`Error reading requests file: ${err.message}`);
    }

    const jsonData = JSON.parse(data);

    const randomRequest = {
      id: uuidv4(),
      flow: generateRandomString(5),
      user: generateRandomString(5),
      email: 'tempuer0999@gmail.com',
      sent_date: new Date().toLocaleDateString('en-GB').replace(/\//g, ' '),
      tts_text: generateRandomString(10),
    };

    jsonData.push(randomRequest);
    try {
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    } catch (err) {
      throw new Error(`Error writing requests file: ${err.message}`);
    }

    sendNewDataToClient(email, [randomRequest]);

    res.status(201).json({ message: 'Random request added successfully!' });
  } catch (error) {
    console.error('Error adding random request:', error);
    res.status(500).json({ message: 'Error adding random request' });
  }
};

module.exports = { addRandomRequest };
