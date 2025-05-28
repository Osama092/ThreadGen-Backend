const { client } = require('../../mongodb');

const getUserById = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ message: 'user_id is required in params' });
    }

    const database = client.db('flowgen_db');
    const collection = database.collection('users');

    const user = await collection.findOne({ user_id: user_id });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error retrieving user:', error);
    res.status(500).json({ message: 'Error retrieving user' });
  }
};

module.exports = { getUserById };
