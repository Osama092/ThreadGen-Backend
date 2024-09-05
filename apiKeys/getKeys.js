const fs = require('fs');
const path = require('path');

const getKeys = (req, res) => {
  const filePath = path.join(__dirname, 'apiKeys.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data file' });
    } else {
      res.json(JSON.parse(data));
    }
  });
};

module.exports = { getKeys };