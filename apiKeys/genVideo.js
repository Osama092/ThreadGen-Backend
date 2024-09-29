// videoHandler.js
const fs = require('fs');
const path = require('path');

const generateVideo = (req, res) => {
    const { apiKey, flowId, ttsText } = req.body;

    if (!apiKey || !flowId || !ttsText) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Read and parse apiKey.json
    const apiKeyPath = path.join(__dirname, 'apiKeys.json');
    const apiKeyData = JSON.parse(fs.readFileSync(apiKeyPath, 'utf8'));

    // Read and parse flow.json
    const flowPath = path.join(__dirname, '../flows/flows.json');
    const flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));

    // Check if apiKey exists in apiKey.json
    const apiKeyExists = apiKeyData.some(entry => entry.apiKey === apiKey);
    if (!apiKeyExists) {
        return res.status(400).json({ error: 'Invalid apiKey' });
    }

    // Check if flowId exists in flow.json
    const flowIdExists = flowData.some(entry => entry.id === flowId);
    if (!flowIdExists) {
        return res.status(400).json({ error: 'Invalid flowId' });
    }

    // Return the specified URL
    const videoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
    res.json({ video: videoUrl });
};

module.exports = { generateVideo };
