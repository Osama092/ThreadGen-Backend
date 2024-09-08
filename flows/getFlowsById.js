const fs = require('fs');
const path = require('path');

const getFlowsById = (req, res) => {
  const filePath = path.join(__dirname, 'flows.json');
  const flowId = req.params.id; // Assuming the ID is passed as a URL parameter

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data file' });
    } else {
      const flows = JSON.parse(data);
      const flow = flows.find(f => f.id === flowId);

      if (flow) {
        res.json(flow);
      } else {
        res.status(404).json({ error: 'Flow not found' });
      }
    }
  });
};

module.exports = { getFlowsById };