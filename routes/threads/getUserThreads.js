const { client } = require('../../mongodb');

const getUserThreads = async (req, res) => {
  try {
    const { user_id } = req.query;

    console.log("Received request to get user threads for user_id:", user_id);

    if (!user_id) {
      return res.status(400).send('User ID is required');
    }

    const database = client.db('flowgen_db');
    const collection = database.collection('flows');
    console.log("Connected to the collection: flows");

    const data = await collection.find({ user_id }).toArray(); 
    console.log(`Fetched data for user ${user_id}:`, data);

    res.json(data);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).send('Error fetching data');
  }
};

module.exports = { getUserThreads };