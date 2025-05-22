// userController.js
const { client } = require('../../mongodb');

const deleteKey = async (req, res) => {
  const { key } = req.params; // Extract the key from the request parameters

  try {
    const database = client.db('flowgen_db'); // Replace with your database name
    const collection = database.collection('api_keys'); // Specify the collection

    // Attempt to delete the document with the specified key
    const result = await collection.deleteOne({ api_key: key }); // Use the key for deletion

    if (result.deletedCount === 1) {
      return res.status(200).json({ message: 'API key deleted successfully' });
    } else {
      return res.status(404).json({ message: 'API key not found' });
    }
  } catch (error) {
    console.error('Error deleting API key:', error);
    return res.status(500).json({ message: 'Error deleting API key' });
  }
};

module.exports = { deleteKey }; // Export the deleteKey function