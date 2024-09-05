const fs = require('fs');
const path = require('path');

const deleteKey = (req, res) => {
    const filePath = path.join(__dirname, 'apiKeys.json');
    const keyId = req.params.id;
  
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.status(500).json({ error: 'Failed to read data file' });
        return;
      }
  
      let keys = JSON.parse(data);
      const initialLength = keys.length;
      keys = keys.filter(key => key.id !== keyId);
  
      if (keys.length === initialLength) {
        res.status(404).json({ error: 'Key not found' });
        return;
      }
  
      fs.writeFile(filePath, JSON.stringify(keys, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
          res.status(500).json({ error: 'Failed to write data file' });
        } else {
          res.json({ message: 'Api key deleted successfully' });
        }
      });
    });
};
  
module.exports = { deleteKey };