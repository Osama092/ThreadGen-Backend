const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const { client } = require('../../mongodb');
const axios = require('axios');

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



        let userLimit = 100; 
        let isSubscribed = false;

        // Fetch user details from Clerk API
        try {
            const clerkResponse = await axios.get(`https://api.clerk.dev/v1/users/${apiKeyDoc.user_id}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`
                }
            });
            
            if (clerkResponse.data && clerkResponse.data.email_addresses && clerkResponse.data.email_addresses.length > 0) {
                const userEmail = clerkResponse.data.email_addresses[0].email_address;
                console.log(`User email: ${userEmail}`);
                
                // Check user subscription status
                try {
                    const subscriptionResponse = await axios.get('http://localhost:5000/subscription', {
                        data: {
                            email: userEmail
                        }
                    });
                    
                    if (subscriptionResponse.data && subscriptionResponse.data.isSubbed !== undefined) {
                        isSubscribed = subscriptionResponse.data.isSubbed;
                        console.log(`User subscription status (isSubbed): ${isSubscribed}`);
                        
                        if (isSubscribed && subscriptionResponse.data.subscriptionData && 
                            subscriptionResponse.data.subscriptionData.data && 
                            subscriptionResponse.data.subscriptionData.data.items && 
                            subscriptionResponse.data.subscriptionData.data.items.length > 0) {
                            
                            const productId = subscriptionResponse.data.subscriptionData.data.items[0].product.id;
                            console.log('product id', productId);
                            
                            // Set limits based on product ID
                            switch (productId) {
                                case 'pro_01j83fwqv84197bhntf28ts527': // Ultimate plan
                                    userLimit = Infinity; // Unlimited
                                    console.log('User has Ultimate plan - unlimited usage');
                                    break;
                                case 'pro_01j82nzbtjmtzpyv2yp5b36stz': // Mid-tier plan
                                    userLimit = 500;
                                    console.log('User has mid-tier plan - 500 usage limit');
                                    break;
                                case 'pro_01j82nweft36pcrgwt9zcek5g2': // Basic plan
                                    userLimit = 100;
                                    console.log('User has basic plan - 100 usage limit');
                                    break;
                                default:
                                    userLimit = 100; // Default to basic limit
                                    console.log('Unknown product ID, defaulting to 100 usage limit');
                            }
                        }
                    }
                } catch (subscriptionError) {
                    console.error('Error fetching subscription status:', subscriptionError.message);
                }
            }
        } catch (clerkError) {
            console.error('Error fetching user details from Clerk:', clerkError.message);
        }

        // Check usage against the determined limit
        if (apiKeyDoc.n_uses >= userLimit) {
            console.log(`User ${apiKeyDoc.user_id} has exceeded their usage limit: ${apiKeyDoc.n_uses}/${userLimit === Infinity ? 'unlimited' : userLimit}`);
            return res.status(429).json({ 
                error: 'Usage limit exceeded', 
                message: `You have reached the maximum number of API calls (${userLimit === Infinity ? 'unlimited' : userLimit}). Please upgrade your plan or contact support.`,
                currentUsage: apiKeyDoc.n_uses,
                limit: userLimit === Infinity ? 'unlimited' : userLimit,
                isSubscribed: isSubscribed
            });
        }

        // Calculate remaining tries
        const remainingTries = userLimit === Infinity ? 'unlimited' : userLimit - apiKeyDoc.n_uses;
        console.log(`User ${apiKeyDoc.user_id} usage check passed: ${apiKeyDoc.n_uses}/${userLimit === Infinity ? 'unlimited' : userLimit}. Remaining tries: ${remainingTries}`);



        
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
                    requestId: correlationId,
                    remainingTries: remainingTries
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

                            // Update API key usage count and get the updated document
                            const updateResult = await apiKeysCollection.findOneAndUpdate(
                                { api_key: apiKey },
                                { $inc: { n_uses: 1 } },
                                { returnDocument: 'after' }
                            );
                            
                            // Log the total API key uses for this user and calculate new remaining tries
                            if (updateResult.value) {
                                const newRemainingTries = userLimit === Infinity ? 'unlimited' : userLimit - updateResult.value.n_uses;
                                console.log(`Total API key uses for user ${apiKeyDoc.user_id}: ${updateResult.value.n_uses}. Remaining tries after this request: ${newRemainingTries}`);
                                
                                // Add the updated remaining tries to the response
                                response.remainingTries = newRemainingTries;
                            }
                            
                            // Add the request ID to the response
                            response.requestId = requestResult.insertedId;
                        } catch (requestError) {
                            console.error('Error adding request record:', requestError);
                            // Continue with the response even if request logging fails
                        }
                    }
                    
                    // Add remaining tries to response if not already added
                    if (!response.remainingTries) {
                        response.remainingTries = remainingTries;
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
        
    } catch (error) {
        console.error('Error in video generation process:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = { generateVideo };