const { client } = require('../../mongodb');

const addRequest = async (req, res) => {
  try {
    const requiredFields = ['user_id', 'thread_name', 'tts_text'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const { user_id, thread_name, tts_text } = req.body;

    const database = client.db('flowgen_db');
    const collection = database.collection('requests');
    

    const newRequest = {
      user_id: user_id,
      thread_name: thread_name,
      tts_text: tts_text,
      created_at: new Date(),
    };

    const result = await collection.insertOne(newRequest);
    console.log("Inserted Requsest:", result.insertedId);



    

    res.status(201).json({ _id: result.insertedId, ...newRequest });
  } catch (error) {
    console.error('Error inserting request:', error);
    res.status(500).send('Error inserting request');
  }
};

module.exports = { addRequest };