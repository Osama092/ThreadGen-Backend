const { client } = require('../../mongodb');

const getThreads = async (req, res) => {
  try {
    const database = client.db('flowgen_db'); // Replace with your database name
    const collection = database.collection('flows'); // Use the "flows" collection
    console.log("Connected to the collection: flows");

    const data = await collection.find({}).toArray(); // Fetch all documents in the collection
    console.log("Fetched data:", data);

    res.json(data);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).send('Error fetching data');
  }
};

module.exports = { getThreads };
