const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const addApiKey = (req, res) => {
  const filePath = path.join(__dirname, 'apiKeys.json');

  const generateRandomApiKey = (length) => {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const newApiKey = {
    id: uuidv4(),
    apiKey: generateRandomApiKey(32),
    creationDate: new Date().toISOString().split('T')[0],
    nUses: 0
  };

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data file' });
      return;
    }

    const apiKeys = JSON.parse(data);
    apiKeys.push(newApiKey);

    fs.writeFile(filePath, JSON.stringify(apiKeys, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        res.status(500).json({ error: 'Failed to write data file' });
      } else {
        res.json({ message: 'API key added successfully', apiKey: newApiKey });
      }
    });
  });
};

module.exports = { addApiKey };