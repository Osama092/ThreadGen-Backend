const { client } = require('../../mongodb');

const addUser = async (req, res) => {
  try {
    const requiredFields = ['user_id', "full_name"];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const { user_id, full_name } = req.body;

    const database = client.db('flowgen_db');
    const collection = database.collection('users');

    // **Check if user already exists**
    const existingUser = await collection.findOne({ user_id: user_id });
    if (existingUser) {
      console.log("user clone status", existingUser.voice_cloned);
      console.log("User already exists with user_id:", user_id);
      return res.status(400).json({
        message: 'User already exists.',
        voice_cloned: existingUser.voice_cloned
      });
    }
    

    const newUser = {
      user_id: user_id,
      user_name: full_name,
      voice_cloned: false,
      created_at: new Date(),
    };

    const result = await collection.insertOne(newUser);
    console.log("Inserted user ID:", result.insertedId);

    res.status(201).json({ _id: result.insertedId, ...newUser });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).send('Error inserting user');
  }
};

module.exports = { addUser };