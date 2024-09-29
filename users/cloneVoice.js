// audioCloningHandler.js
const fs = require('fs');
const path = require('path');

const audioCloning = (req, res) => {
    const email = req.params.id;
    const { text } = req.body;

    if (!email || !text) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Read and parse user.json
    const userPath = path.join(__dirname, 'users.json');
    const userData = JSON.parse(fs.readFileSync(userPath, 'utf8'));

    // Find user by userId
    const user = userData.find(entry => entry.email === email);
    if (!user) {
        return res.status(400).json({ error: 'Invalid email' });
    }

    // Set cloned variable to true
    user.cloned = true;

    // Save updated user.json
    fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));

    res.json({ message: 'User cloned variable set to true' });
};

module.exports = { audioCloning };
