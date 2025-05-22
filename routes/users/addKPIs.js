const { client } = require('../../mongodb');

const addKPIs = async (req, res) => {
    try {
        const requiredFields = ['api_key', 'thread_name', 'watch_time', 'play_rate', 'completion_rate', 'replay_rate'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            console.log("Missing required fields:", missingFields);
            return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
        }

        const { api_key, thread_name, watch_time, play_rate, completion_rate, replay_rate } = req.body;

        const database = client.db('flowgen_db');
        const userKpisCollection = database.collection('user_kpis');
        const apiKeysCollection = database.collection('api_keys');

        // Find the API key document
        const existingKey = await apiKeysCollection.findOne({ api_key });

        if (existingKey) {
            console.log("Found API key belonging to user:", existingKey.user_id);
            console.log("Document ID:", existingKey._id);

            // Insert KPI data into the user_kpis collection
            const kpiData = {
                user_id: existingKey.user_id,
                thread_name,
                watch_time,
                play_rate,
                completion_rate,
                replay_rate,
                timestamp: new Date() // Optional: for tracking when the KPI was recorded
            };

            await userKpisCollection.insertOne(kpiData);
            console.log("KPI data inserted successfully");

            return res.status(200).json({ message: 'KPI data saved successfully' });
        } else {
            console.log("API key not found");
            return res.status(404).send("API key not found");
        }
    } catch (error) {
        console.error("Error while processing request:", error);
        return res.status(500).send("Internal Server Error");
    }
};

module.exports = { addKPIs };
