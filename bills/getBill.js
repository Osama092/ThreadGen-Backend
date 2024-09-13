const fs = require('fs');
const path = require('path');

const getBills = (req, res) => {
  const { user } = req.params; 
  const filePath = path.join(__dirname, 'bills.json');
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data file' });
    } else {
      const bills = JSON.parse(data);
      const userBills = bills.filter(sub => sub.user === user);
      
      if (userBills.length > 0) {
        res.json(userBills);
      } else {
        res.status(404).json({ error: 'Subscription not found' });
      }
    }
  });
};

module.exports = { getBills };