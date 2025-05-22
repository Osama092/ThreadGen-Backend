const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const fs = require('fs');
const path = require('path');

const ccGen = async (req, res) => {
    // Extract request body
    const { user_id, user_name, flow_name, video_path, config_path } = req.body;

    if (!user_id || !user_name || !flow_name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let configFilePath;
        let videoFilePath;

        // If paths are provided directly (from threadUpload), use them
        if (config_path && video_path) {
            configFilePath = config_path;
            videoFilePath = video_path;
        } else {
            // Otherwise construct paths using the new directory structure
            const baseDir = path.join(__dirname, '../../UserData/temp', `${user_name}_${user_id}`);
            const flowDir = path.join(baseDir, flow_name);
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(flowDir)) {
                fs.mkdirSync(flowDir, { recursive: true });
            }
            
            configFilePath = path.join(flowDir, 'config.json');
            videoFilePath = path.join(flowDir, 'video.mp4');
        }
        
        // Initialize empty config if it doesn't exist
        if (!fs.existsSync(configFilePath)) {
            const configData = {};
            fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 2));
        }
        
        // Connect to RabbitMQ and prepare the channel
        const channel = await getChannelForRoute('transcript');
        await channel.assertQueue('transcript', { durable: true });
        
        // Create a response queue with a unique name
        const replyQueueName = `response-${uuidv4()}`;
        await channel.assertQueue(replyQueueName, { exclusive: true });
        
        // Generate a correlation ID for this request
        const correlationId = uuidv4();
        
        // Create the request payload with required fields
        const requestData = {
            user_id,
            user_name,
            flow_name,
            video_path: videoFilePath,
            config_path: configFilePath
        };

        // Set up a consumer for the response
        channel.consume(replyQueueName, async (msg) => {
            if (msg.properties.correlationId === correlationId) {
                try {
                    const response = JSON.parse(msg.content.toString());
                    
                    // Update the config file with the transcription result
                    if (requestData.config_path && fs.existsSync(requestData.config_path)) {
                        // Store the stt_names content
                        if (response.stt_names) {
                            fs.writeFileSync(requestData.config_path, JSON.stringify(response.stt_names, null, 2));
                        }
                    }
                    
                    res.json(response);
                } catch (parseError) {
                    console.error('Error parsing response:', parseError);
                    
                    // Update config with error
                    if (requestData.config_path && fs.existsSync(requestData.config_path)) {
                        const configData = JSON.parse(fs.readFileSync(requestData.config_path));
                        configData.error = 'Error processing transcript response';
                        fs.writeFileSync(requestData.config_path, JSON.stringify(configData, null, 2));
                    }
                    
                    res.status(500).json({ error: 'Error processing transcript response' });
                } finally {
                    channel.ack(msg);
                }
            }
        });

        // Send the message to the RabbitMQ queue
        let thread_result = channel.sendToQueue(
            'transcript',
            Buffer.from(JSON.stringify(requestData)),
            {
                correlationId: correlationId,
                replyTo: replyQueueName
            }
        );

        if (!thread_result) {
            throw new Error('Failed to send request to RabbitMQ');
        }
        
        console.log(`Request sent to transcription service with correlation ID: ${correlationId}`);

    } catch (error) {
        console.error('Error in transcription service:', error);
        
        // Update config with error if paths available
        const configPath = req.body.config_path || (req.body.user_id && req.body.user_name && req.body.flow_name ? 
            path.join(__dirname, '../../UserData/temp', `${req.body.user_name}_${req.body.user_id}`, req.body.flow_name, 'config.json') : 
            null);
            
        if (configPath && fs.existsSync(configPath)) {
            try {
                const configData = JSON.parse(fs.readFileSync(configPath));
                configData.error = error.message || 'Internal server error';
                fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
            } catch (configError) {
                console.error('Error updating config file:', configError);
            }
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { ccGen };