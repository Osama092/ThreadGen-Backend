// userController.js
const { client } = require('../../mongodb');

// Function to generate a random 32-character API key
const generateApiKey = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = '';
  for (let i = 0; i < 32; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    apiKey += characters[randomIndex];
  }
  return apiKey;
};

const addKey = async (req, res) => {
  try {
    const requiredFields = ['user_id']; // Only email is required from the body
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const { user_id } = req.body;

    const database = client.db('flowgen_db'); 
    const collection = database.collection('api_keys'); 

    let apiKey;
    let existingKey = true;

    // Loop until a unique key is generated
    while(existingKey) {
        apiKey = generateApiKey(); // Generate a new API key
      
        // Check if the generated key already exists in the collection
        existingKey = await collection.findOne({ key: apiKey });

        if (existingKey) {
            console.log(`Generated duplicate key: ${apiKey}. Regenerating...`);
            // If found, existingKey will be the document, loop continues
        } else {
            console.log(`Generated unique key: ${apiKey}`);
            // If not found, existingKey will be null, loop terminates
        }
    }


    // Now that we have a unique apiKey, create the document
    const newKey = {
      api_key: apiKey, // Use the unique key found by the loop
      user_id,
      n_uses: 0,
      created_at: new Date()
    };

    const result = await collection.insertOne(newKey); // Insert the unique API key document
    console.log("Inserted with id:", result.insertedId);

    res.status(201).json({ _id: result.insertedId, ...newKey }); // Send the inserted document as JSON
  } catch (error) {
    console.error('Error inserting API key:', error);
    res.status(500).send('Error inserting API key');
  }
};

module.exports = { addKey, generateApiKey };