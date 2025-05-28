const { client } = require('../../mongodb');

const getKeys = async (req, res) => {
  try {
    const database = client.db('flowgen_db');
    const collection = database.collection('api_keys');
    console.log("Connected to the collection: api_keys");

    // Fetch documents where 'deleted' is not true
    const data = await collection.find({ deleted: { $ne: true } }).toArray();
    console.log("Fetched data keys:", data);

    res.json(data);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).send('Error fetching data');
  }
};

module.exports = { getKeys };