const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const { client } = require('../../mongodb');

const generateVideo = async (req, res) => {
    const { apiKey, threadName, ttsText } = req.body;
    console.log('Received request to generate video:', req.body);
    if (!apiKey || !threadName || !ttsText) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        
        const database = client.db('flowgen_db');
        const apiKeysCollection = database.collection('api_keys');
        console.log("Connected to the collection: api_keys");
    
        const apiKeyDoc = await apiKeysCollection.findOne({ api_key: apiKey });

        if (!apiKeyDoc) {
            return res.status(400).json({ error: 'Invalid apiKey' });
        } else {
            console.log('API Key found:', apiKeyDoc);
        }


        
        // Step 2: Find the thread in the flows collection and verify user ownership
        const flowsCollection = database.collection('flows');
        const threadDoc = await flowsCollection.findOne({ thread_name: threadName });
        
        if (!threadDoc) {
            return res.status(400).json({ error: 'Invalid threadName' });
        } else {
            console.log('Thread found:', threadDoc);
        }
        
        // Verify the thread belongs to the user
        if (threadDoc.user_id.toString() !== apiKeyDoc.user_id.toString()) {
            return res.status(403).json({ error: 'You do not have access to this thread' });
        }

        if (threadDoc.status == "pending") {
            return res.status(400).json({ error: 'Thread is still pending' });
        }

        // Connect to RabbitMQ and prepare the channel
        const channel = await getChannelForRoute('generate');
        await channel.assertQueue('generate', { durable: true });
        
        // Create a response queue with a unique name
        const replyQueueName = `response-${uuidv4()}`;
        await channel.assertQueue(replyQueueName, { exclusive: true });
        
        // Generate a correlation ID for this request
        const correlationId = uuidv4();
        
        // Create the request payload with minimal required fields
        const requestData = {
            user: apiKeyDoc.user_id,
            thread: threadDoc._id,
            ttsText: ttsText,
            source: 'video_player'
        };
        
        const requestTimeout = setTimeout(() => {
            // Send a response to avoid client timeout
            if (!res.headersSent) {
                res.status(202).json({ 
                    status: 'processing', 
                    message: 'Video generation started. This may take some time.',
                    requestId: correlationId
                });
            }
        }, 30000);

        // Set up a consumer for the response
        channel.consume(replyQueueName, async (msg) => {
            if (msg && msg.properties.correlationId === correlationId) {
                clearTimeout(requestTimeout); // Clear the timeout if response received
                try {
                    const response = JSON.parse(msg.content.toString());
                    
                    // If response is successful, add the request to the requests collection
                    if (response.status === 'success' || response.success) {
                        try {
                            // Add request to requests collection
                            const requestsCollection = database.collection('requests');
                            const newRequest = {
                                user_id: apiKeyDoc.user_id,
                                thread_name: threadName,
                                tts_text: ttsText,
                                created_at: new Date(),
                            };
                            
                            const requestResult = await requestsCollection.insertOne(newRequest);
                            console.log("Inserted Request:", requestResult.insertedId);

                            await apiKeysCollection.updateOne(
                                { api_key: apiKey },
                                { $inc: { n_uses: 1 } }
                            );
                            
                            // Add the request ID to the response
                            response.requestId = requestResult.insertedId;
                        } catch (requestError) {
                            console.error('Error adding request record:', requestError);
                            // Continue with the response even if request logging fails
                        }
                    }
                    
                    // Only send response if it hasn't been sent yet
                    if (!res.headersSent) {
                        res.json(response);
                    }
                } catch (parseError) {
                    console.error('Error parsing response:', parseError);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Error processing video response' });
                    }
                } finally {
                    channel.ack(msg);
                }
            }
        }, { noAck: false });

        // Send the message to the RabbitMQ queue
        channel.sendToQueue(
            'generate',
            Buffer.from(JSON.stringify(requestData)),
            {
                correlationId: correlationId,
                replyTo: replyQueueName
            }
        );
        
        console.log(`Request sent to generation service with correlation ID: ${correlationId}`);
        
        // Note: We're not sending the response here, it will be sent when we receive the response from RabbitMQ or when the timeout occurs
    } catch (error) {
        console.error('Error in video generation process:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = { generateVideo };