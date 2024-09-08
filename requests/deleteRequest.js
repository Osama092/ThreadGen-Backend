const fs = require('fs');
const path = require('path');

const deleteRequest = (req, res) => {
    const filePath = path.join(__dirname, 'requests.json');
    const requestId = req.params.id;
  
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.status(500).json({ error: 'Failed to read data file' });
        return;
      }
  
      let requests = JSON.parse(data);
      const initialLength = requests.length;
      requests = requests.filter(request => request.id !== requestId);
  
      if (requests.length === initialLength) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
  
      fs.writeFile(filePath, JSON.stringify(requests, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
          res.status(500).json({ error: 'Failed to write data file' });
        } else {
          res.json({ message: 'Request deleted successfully' });
        }
      });
    });
};
  
module.exports = { deleteRequest };