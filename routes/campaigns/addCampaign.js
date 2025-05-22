const { client } = require('../../mongodb');
const { ObjectId } = require('mongodb');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const { v4: uuidv4 } = require('uuid');

const addCampaign = async (req, res) => {
  try {
    const requiredFields = [
      'campaign_name',
      'campaign_description',
      'user_id',
      'thread_name',
      'tts_text_list',
      'apikey'
    ];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const { campaign_name, campaign_description, thread_name, user_id, tts_text_list, apikey } = req.body;

    if (!Array.isArray(tts_text_list)) {
      return res.status(400).send("tts_text_list must be an array.");
    }

    const processedTTSList = tts_text_list.map(text => ({
      text,
      status: "pending",
      video_url: ""
    }));

    const database = client.db('flowgen_db');
    const apikeyCollection = database.collection('api_keys');
    const campaignCollection = database.collection('campaigns');
    const threadCollection = database.collection('flows');

    // Check if API key belongs to the user
    const validApiKey = await apikeyCollection.findOne({
      api_key: apikey,
      user_id: user_id
    });

    if (!validApiKey) {
      return res.status(403).send("Invalid API key for the given user.");
    }

    // Check if the thread exists for this user
    const existingThread = await threadCollection.findOne({
      thread_name: thread_name,
      user_id: user_id
    });

    if (!existingThread) {
      return res.status(404).send("Thread not found or does not belong to the specified user.");
    }

    if (existingThread.status !== "ready") {
      return res.status(400).send(`Thread "${thread_name}" exists but is not ready. Current status: "${existingThread.status}".`);
    }


    // Check for campaign name uniqueness
    const existingCampaign = await campaignCollection.findOne({
      campaign_name: { $regex: `^${campaign_name}$`, $options: 'i' },
      user_id: user_id
    });


    if (existingCampaign) {
      return res.status(400).send("A campaign with this name already exists for this user.");
    }

    const newCampaign = {
      campaign_name,
      campaign_description,
      user_id,
      used_thread: thread_name,
      tts_text_list: processedTTSList,
      status: "pending",
      created_at: new Date(),
    };

    const result = await campaignCollection.insertOne(newCampaign);
    console.log("Inserted campaign ID:", result.insertedId);

    await apikeyCollection.updateOne(
      { api_key: apikey, user_id: user_id },
      { $inc: { n_uses: processedTTSList.length } }
    );

    const channel = await getChannelForRoute('generate');
    await channel.assertQueue('generate', { durable: true });
    const correlationId = uuidv4();

    // Track if all messages were sent successfully
    let allMessagesSent = true;

    // Process each TTS item
    const sendPromises = processedTTSList.map(({ text }) => {
      const requestData = {
        user_id: user_id,
        thread: thread_name,
        ttsText: text,
        source: 'campaign',
        campaignId: result.insertedId
      };
      
      // Send to queue and track success
      return channel.sendToQueue(
        'generate',
        Buffer.from(JSON.stringify(requestData)),
        {
          replyTo: 'Campaign_completion', // Fixed typo in replyTo
          correlationId: correlationId,
        }
      );
    });

    // Ensure all messages were sent successfully
    const sendResults = await Promise.all(sendPromises);
    allMessagesSent = sendResults.every(result => result === true);

    if (allMessagesSent) {
      console.log('All messages were successfully sent to the queue!');
      return res.status(201).json({ 
        _id: result.insertedId, 
        ...newCampaign,
        message: 'Campaign created and processing started'
      });
    } else {
      throw new Error('Failed to send some requests to RabbitMQ');
    }
  } catch (error) {
    console.error('Error inserting campaign:', error);
    res.status(500).send('Error inserting campaign');
  }
};

module.exports = { addCampaign };