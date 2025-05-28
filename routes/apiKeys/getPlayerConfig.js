const fs = require('fs');
const path = require('path');
const { client } = require('../../mongodb');
const getPlayerConfig = async (req, res) => {
  try {
    const { apiKey, ttsText, threadName } = req.body;

    if (!apiKey || !ttsText || !threadName) {
      return res.status(400).json({ message: "apiKey, ttsText, and threadName are required in the request body" });
    }

    const database = client.db('flowgen_db');

    // Step 1: Find user_id from apiKeys collection
    const apiKeysCollection = database.collection('api_keys');
    const apiKeyDoc = await apiKeysCollection.findOne({ api_key: apiKey });

    if (!apiKeyDoc) {
      return res.status(404).json({ message: "API Key not found" });
    }

    const user_id = apiKeyDoc.user_id;

    // Step 2: Use user_id to find user_name in users collection
    const usersCollection = database.collection('users');
    const userDoc = await usersCollection.findOne({ user_id });

    if (!userDoc) {
      return res.status(404).json({ message: "User not found for the given user_id" });
    }

    const user_name = userDoc.user_name;

    // Step 3: Check if the folder {user_name}_{user_id} exists in userData/temp
    const userFolder = path.join(__dirname, '..','..', 'userData', 'temp', `${user_name}_${user_id}`);
    if (!fs.existsSync(userFolder)) {
      return res.status(404).json({ message: "User folder not found", userFolder });
    }

    // Step 4: Check for a subfolder matching threadName
    const threadFolder = path.join(userFolder, threadName);
    if (!fs.existsSync(threadFolder)) {
      return res.status(404).json({ message: "Thread folder not found", userFolder, threadFolder });
    }

    // Step 5: Check for config.json inside thread folder
    const configPath = path.join(threadFolder, 'config.json');
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({
        message: "config.json not found in the thread folder",
        threadFolder,
        configPath
      });
    }

    // Step 6: Read and return the content of config.json
    const configContent = fs.readFileSync(configPath, 'utf8');
    let configData;
    try {
      configData = JSON.parse(configContent);
    } catch (parseError) {
      return res.status(500).json({ message: "Invalid JSON in config.json", error: parseError.message });
    }

    // Create player directory if it doesn't exist
    const playerDir = path.join(__dirname, '..', 'player');
    if (!fs.existsSync(playerDir)) {
      fs.mkdirSync(playerDir, { recursive: true });
    }

    // Create a new player-config.json file
    const playerConfigPath = path.join(playerDir, 'player-config.json');
    try {
      fs.writeFileSync(playerConfigPath, JSON.stringify(configData, null, 2));
      console.log(`Successfully created player config at ${playerConfigPath}`);
    } catch (writeError) {
      console.error('Error creating player-config.json:', writeError);
      // Don't fail the request if we can't create the file, just continue
    }

    // Return only the configData in the response
    return res.status(200).json(configData);

  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).send('Error fetching config');
  }
};


module.exports = { getPlayerConfig };