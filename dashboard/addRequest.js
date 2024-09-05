const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');




const addRequest = (req, res) => {
  const filePath = path.join(__dirname, 'requests.json');

  const generateRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const generateRandomText = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const newRequest = {
    id: uuidv4(),
    flow: generateRandomString(5),
    sent_date: new Date().toLocaleDateString('en-GB').replace(/\//g, ' '),
    tts_text: generateRandomText(10)
  };

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data file' });
      return;
    }

    const requests = JSON.parse(data);
    requests.push(newRequest);

    fs.writeFile(filePath, JSON.stringify(requests, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        res.status(500).json({ error: 'Failed to write data file' });
      } else {
        res.json({ message: 'Request added successfully', request: newRequest });
      }
    });
  });
};

module.exports = { addRequest };