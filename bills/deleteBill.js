const fs = require('fs');
const path = require('path');

const deleteBill = (req, res) => {
    const filePath = path.join(__dirname, 'bills.json');
    const billId = req.params.id;
  
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.status(500).json({ error: 'Failed to read data file' });
        return;
      }
  
      let bills = JSON.parse(data);
      const initialLength = bills.length;
      bills = bills.filter(bill => bill.id !== billId);
  
      if (bills.length === initialLength) {
        res.status(404).json({ error: 'Bill not found' });
        return;
      }
  
      fs.writeFile(filePath, JSON.stringify(bills, null, 2), 'utf8', (writeErr) => {
        if (writeErr) {
          res.status(500).json({ error: 'Failed to write data file' });
        } else {
          res.json({ message: 'Bill deleted successfully' });
        }
      });
    });
};
  
module.exports = { deleteBill };