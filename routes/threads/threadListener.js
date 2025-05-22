// flows/threadListener.js
const { client } = require('../../mongodb');
const { getChannelForRoute } = require('../../utils/rabbitmq'); // Assuming you have a function to get the RabbitMQ channel

async function startThreadListener() {
    try {
        console.log('[Thread Listener] Starting up...');
        
        // Get channel using the existing rabbitmq module
        const queueName = 'thread_completion';
        const channel = await getChannelForRoute(queueName);
        
        // Declare the queue for receiving responses
        await channel.assertQueue(queueName, { durable: true });
        
        console.log(`[Thread Listener] Waiting for thread completion messages on ${queueName}`);
        
        // Set up consumer
        channel.consume(queueName, async (msg) => {
            if (!msg) return;
            
            try {
                // Parse the response
                const response = JSON.parse(msg.content.toString());
                const correlationId = msg.properties.correlationId;
                
                console.log(`[Thread Listener] Received completion message with correlationId: ${correlationId}`);
                
                if (response.status === 'success') {
                    // Update the database - mark the thread as ready
                    const database = client.db('flowgen_db');
                    const collection = database.collection('flows');
                    
                    // Update the thread status to ready
                    const result = await collection.updateOne(
                        { correlation_id: correlationId },
                        { $set: { status: 'ready', updated_at: new Date() } }
                    );
                    
                    if (result.matchedCount > 0) {
                        console.log(`[Thread Listener] Updated thread status to 'ready' for correlation ID: ${correlationId}`);
                    } else {
                        console.log(`[Thread Listener] No thread found with correlation ID: ${correlationId}`);
                    }
                } else {
                    console.log(`[Thread Listener] Received non-success status: ${response.status}`);
                }
                
                // Acknowledge the message
                channel.ack(msg);
            } catch (error) {
                console.error('[Thread Listener] Error processing message:', error);
                channel.nack(msg, false, true);
            }
        });
        
        console.log('[Thread Listener] Ready and listening for messages');
        
        return true;
    } catch (error) {
        console.error('[Thread Listener] Error starting thread listener:', error);
        return false;
    }
}

module.exports = { startThreadListener };