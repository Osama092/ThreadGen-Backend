// users/cloneListener.js
const { client } = require('../../mongodb');
const { getChannelForRoute } = require('../../utils/rabbitmq');

async function startCloneListener() {
    try {
        console.log('[Clone Listener] Starting up...');
        
        // Get channel using the existing rabbitmq module
        const queueName = 'cloning_completion';
        const channel = await getChannelForRoute(queueName);
        
        // Declare the queue for receiving responses
        await channel.assertQueue(queueName, { durable: true });
        
        console.log(`[Clone Listener] Waiting for voice cloning completion messages on ${queueName}`);
        
        // Set up consumer
        channel.consume(queueName, async (msg) => {
            if (!msg) return;
            
            try {
                // Parse the response
                const response = JSON.parse(msg.content.toString());
                const correlationId = msg.properties.correlationId;
                
                console.log(`[Clone Listener] Received completion message with correlationId: ${correlationId}`);
                
                if (response.status === 'success') {
                    const { user_id } = response;
                    
                    if (!user_id) {
                        console.error('[Clone Listener] Missing user_id in response');
                        channel.ack(msg);
                        return;
                    }
                    
                    // Update the database - mark the voice as cloned for this user
                    const database = client.db('flowgen_db');
                    const collection = database.collection('users');
                    
                    // Update the user document
                    const result = await collection.updateOne(
                        { user_id },  // Match by clerk_id which equals user_id
                        { $set: { voice_cloned: true, updated_at: new Date() } }
                    );
                    
                    if (result.matchedCount > 0) {
                        console.log(`[Clone Listener] Updated voice_cloned status to 'true' for user: ${user_id}`);
                    } else {
                        console.log(`[Clone Listener] No user found with clerk_id: ${user_id}`);
                    }
                } else {
                    console.log(`[Clone Listener] Received non-success status: ${response.status}`);
                }
                
                // Acknowledge the message
                channel.ack(msg);
            } catch (error) {
                console.error('[Clone Listener] Error processing message:', error);
                channel.nack(msg, false, true);
            }
        });
        
        console.log('[Clone Listener] Ready and listening for messages');
        
        return true;
    } catch (error) {
        console.error('[Clone Listener] Error starting clone listener:', error);
        return false;
    }
}

module.exports = { startCloneListener };