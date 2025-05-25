// userController.js
const { client } = require('../../mongodb');

const patchKey = async (req, res) => {
  const { key } = req.params;

  try {
    const database = client.db('flowgen_db');
    const collection = database.collection('api_keys');

    const result = await collection.updateOne(
      { api_key: key },
      { $set: { deleted: true } } 
    );

    if (result.matchedCount === 1) {
      if (result.modifiedCount === 1) {
        return res.status(200).json({ message: 'API key marked as deleted successfully' });
      } else {
        return res.status(200).json({ message: 'API key was already marked as deleted' });
      }
    } else {
      return res.status(404).json({ message: 'API key not found' });
    }
  } catch (error) {
    console.error('Error marking API key as deleted:', error);
    return res.status(500).json({ message: 'Error marking API key as deleted' });
  }
};

module.exports = { patchKey };