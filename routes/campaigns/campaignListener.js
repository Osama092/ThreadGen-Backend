const { client } = require('../../mongodb');
const { ObjectId } = require('mongodb');
const { getChannelForRoute } = require('../../utils/rabbitmq');

async function startCampaignListener() {
    try {
        console.log('[Campaign Listener] Starting up...');
        
        // Get channel using the existing rabbitmq module
        const queueName = 'Campaign_completion';
        const channel = await getChannelForRoute(queueName);
        
        // Declare the queue for receiving responses
        await channel.assertQueue(queueName, { durable: true });
        
        console.log(`[Campaign Listener] Waiting for campaign completion messages on ${queueName}`);
        
        // Set up consumer
        channel.consume(queueName, async (msg) => {
            if (!msg) return;
            
            try {
                // Parse the response
                const response = JSON.parse(msg.content.toString());
                const correlationId = msg.properties.correlationId;
                
                console.log(`[Campaign Listener] Received completion message with correlationId: ${correlationId}`);
                
                if (response.status === 'success') {
                    const { campaignId, ttsText, video_url } = response;
                    
                    if (!campaignId || !ttsText) {
                        console.error('[Campaign Listener] Missing required fields in response:', response);
                        channel.ack(msg);
                        return;
                    }
                    
                    // Ensure video_url is not just whitespace
                    const validVideoUrl = video_url && video_url.trim() ? video_url : "";
                    
                    // Convert campaignId string to ObjectId
                    const campaignObjectId = new ObjectId(campaignId);
                    
                    // Update the database
                    const database = client.db('flowgen_db');
                    const collection = database.collection('campaigns');
                    
                    // Update the specific TTS item in the campaign
                    const result = await collection.updateOne(
                        {
                            _id: campaignObjectId, // Use _id which is the actual field name
                            'tts_text_list.text': ttsText // Find the exact ttsText inside the array
                        },
                        {
                            $set: {
                                'tts_text_list.$.status': 'ready',
                                'tts_text_list.$.video_url': validVideoUrl
                            }
                        }
                    );
                    
                    if (result.matchedCount > 0) {
                        console.log(`[Campaign Listener] Updated ttsText status to 'ready' for campaign: ${campaignId}`);
                        
                        // Check if all TTS items in this campaign are now ready
                        const campaign = await collection.findOne({ _id: campaignObjectId });
                        
                        if (campaign && campaign.tts_text_list) {
                            const allItemsReady = campaign.tts_text_list.every(item => item.status === 'ready');
                            const anyItemFailed = campaign.tts_text_list.some(item => item.status === 'failed');
                            
                            // Determine the campaign status based on item statuses
                            let newCampaignStatus = campaign.status; // Default to current status
                            
                            if (allItemsReady) {
                                newCampaignStatus = 'ready';
                                console.log(`[Campaign Listener] All items ready, updating campaign status to 'ready' for: ${campaignId}`);
                            } else if (anyItemFailed) {
                                newCampaignStatus = 'partial';
                                console.log(`[Campaign Listener] Some items failed, updating campaign status to 'partial' for: ${campaignId}`);
                            }
                            
                            // Update the campaign status if it changed
                            if (newCampaignStatus !== campaign.status) {
                                await collection.updateOne(
                                    { _id: campaignObjectId },
                                    { $set: { status: newCampaignStatus } }
                                );
                            }
                        }
                    } else {
                        console.log(`[Campaign Listener] No campaign found with campaign id: ${campaignId}`);
                    }
                } else {
                    console.error(`[Campaign Listener] Received non-success status: ${response.status}`);
                    // Handle failed items by updating their status
                    const { campaignId, ttsText, error } = response;
                    
                    if (campaignId && ttsText) {
                        const campaignObjectId = new ObjectId(campaignId);
                        const database = client.db('flowgen_db');
                        const collection = database.collection('campaigns');
                        
                        // Update the item status to failed
                        await collection.updateOne(
                            {
                                _id: campaignObjectId,
                                'tts_text_list.text': ttsText
                            },
                            {
                                $set: {
                                    'tts_text_list.$.status': 'failed',
                                    'tts_text_list.$.error': error || 'Unknown error'
                                }
                            }
                        );
                        
                        console.log(`[Campaign Listener] Updated ttsText status to 'failed' for campaign: ${campaignId}`);
                        
                        // Check if all items are now processed (either ready or failed)
                        const campaign = await collection.findOne({ _id: campaignObjectId });
                        
                        if (campaign && campaign.tts_text_list) {
                            const allItemsProcessed = campaign.tts_text_list.every(
                                item => item.status === 'ready' || item.status === 'failed'
                            );
                            
                            const allItemsReady = campaign.tts_text_list.every(item => item.status === 'ready');
                            const anyItemFailed = campaign.tts_text_list.some(item => item.status === 'failed');
                            
                            // Determine final campaign status
                            let newStatus = campaign.status;
                            
                            if (allItemsProcessed) {
                                if (allItemsReady) {
                                    newStatus = 'ready';
                                } else if (anyItemFailed) {
                                    if (campaign.tts_text_list.some(item => item.status === 'ready')) {
                                        newStatus = 'partial';
                                    } else {
                                        newStatus = 'failed';
                                    }
                                }
                                
                                // Update campaign status if changed
                                if (newStatus !== campaign.status) {
                                    await collection.updateOne(
                                        { _id: campaignObjectId },
                                        { $set: { status: newStatus } }
                                    );
                                    console.log(`[Campaign Listener] Updated campaign status to '${newStatus}' for: ${campaignId}`);
                                }
                            }
                        }
                    }
                }
                
                // Acknowledge the message
                channel.ack(msg);
            } catch (error) {
                console.error('[Campaign Listener] Error processing message:', error);
                // For critical errors like parsing issues, don't requeue
                channel.nack(msg, false, false);
            }
        });
        
        console.log('[Campaign Listener] Ready and listening for messages');
        
        return true;
    } catch (error) {
        console.error('[Campaign Listener] Error starting campaign listener:', error);
        return false;
    }
}
module.exports = { startCampaignListener };