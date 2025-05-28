const { client } = require('../../mongodb');

const getUserApiKeys = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).send('User ID is required');
    }

    const database = client.db('flowgen_db');
    const collection = database.collection('api_keys');
    console.log("Connected to the collection: api_keys");

    // Modified line: Add the filter for 'deleted' field
    const data = await collection.find({ user_id, deleted: { $ne: true } }).toArray();

    console.log(`Fetched data for user ${user_id}:`, data);

    res.json(data);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).send('Error fetching data');
  }
};

module.exports = { getUserApiKeys };