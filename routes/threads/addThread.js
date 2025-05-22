// flows/addThread.js
const { client } = require('../../mongodb');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const multer = require('multer');

// Configure storage for temporary files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../tempUserData');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Create unique filenames with original extensions
    const fileField = file.fieldname; // 'start_thumbnail', 'pause_thumbnail', or 'end_thumbnail'
    const fileExt = path.extname(file.originalname) || '.png';
    const fileName = `${fileField}_${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Function to verify file type
const fileFilter = (req, file, cb) => {
    // Allow only image file types
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP, or SVG) are allowed'), false);
    }
};

const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for images
});

const addThread = async (req, res) => {
    // Handle file uploads
    const uploadFields = upload.fields([
        { name: 'start_thumbnail', maxCount: 1 },
        { name: 'pause_thumbnail', maxCount: 1 },
        { name: 'end_thumbnail', maxCount: 1 }
    ]);
    
    uploadFields(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: `Unknown error: ${err.message}` });
        }
        
        // Required fields validation
        const requiredFields = [
            'user_id', 'user_name', 'thread_name', 
            'description', 'ttsText', 'color'
        ];
          
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }
        
        // Check if all required files were uploaded
        if (!req.files.start_thumbnail || !req.files.pause_thumbnail || !req.files.end_thumbnail) {
            return res.status(400).json({ error: 'Missing required thumbnail files' });
        }
        
        const {
            user_id, user_name, thread_name, description,
            ttsText, color, smart_pause, subtitle, fast_progress
        } = req.body;

        const smartPause = smart_pause === 'true' || smart_pause === true;
        const fastProgress = fast_progress === 'true' || fast_progress === true;
        const subtitleValue = subtitle === 'true' || subtitle === true;

        console.log('Thumbnail options:', { smartPause, fastProgress, subtitleValue });
        console.log('Received request body:', req.body);
        
        try {
            // Get the temporary file paths
            const startThumbnailPath = req.files.start_thumbnail[0].path;
            const pauseThumbnailPath = req.files.pause_thumbnail[0].path;
            const endThumbnailPath = req.files.end_thumbnail[0].path;
            
            // Store original file extensions for later use by Python service
            const fileExtensions = {
                start: path.extname(req.files.start_thumbnail[0].originalname) || '.png',
                pause: path.extname(req.files.pause_thumbnail[0].originalname) || '.png',
                end: path.extname(req.files.end_thumbnail[0].originalname) || '.png'
            };

            // Generate correlation ID for tracking this request
            const correlationId = uuidv4();
            
            // Prepare the request data for Python service
            const requestData = {
                user_id,
                user_name,
                thread_name,
                description,
                ttsText,
                color,
                smartPause,
                subtitleValue,
                fastProgress,
                correlation_id: correlationId,
                thumbnail_paths: {
                    start: startThumbnailPath,
                    pause: pauseThumbnailPath,
                    end: endThumbnailPath
                },
                file_extensions: fileExtensions
            };
            
            console.log('Request data to be sent:', requestData);

            // Connect to RabbitMQ and prepare channel
            const threadChannel = await getChannelForRoute('thread');
            await threadChannel.assertQueue('thread', { durable: true });
            
            // Create a response queue for immediate confirmation
            const replyQueueName = `thread-response-${uuidv4()}`;
            await threadChannel.assertQueue(replyQueueName, { exclusive: true });
            
            // Set up consumer for the response queue
            threadChannel.consume(replyQueueName, async (msg) => {
                if (msg.properties.correlationId === correlationId) {
                    try {
                        const response = JSON.parse(msg.content.toString());
                        console.log(`Received response from thread service: ${JSON.stringify(response)}`);
                        
                        // Delete temporary files after successful processing
                        try {
                            for (const path of [startThumbnailPath, pauseThumbnailPath, endThumbnailPath]) {
                                if (fs.existsSync(path)) {
                                    fs.unlinkSync(path);
                                    console.log(`Temporary file deleted: ${path}`);
                                }
                            }
                        } catch (deleteError) {
                            console.warn('Warning: Could not delete temporary files:', deleteError);
                        }
                        
                    } catch (parseError) {
                        console.error('Error parsing thread service response:', parseError);
                    } finally {
                        threadChannel.ack(msg);
                    }
                }
            });
            
            // Send message to thread queue
            let thread_result = threadChannel.sendToQueue(
                'thread',
                Buffer.from(JSON.stringify(requestData)),
                { 
                    correlationId, 
                    replyTo: replyQueueName 
                }
            );

            if (!thread_result) {
                throw new Error('Failed to send request to RabbitMQ');
            }
            
            console.log(`Request sent to threading service with correlation ID: ${correlationId}`);

            // Save to MongoDB
            const database = client.db('flowgen_db');
            const collection = database.collection('flows');

            const newThread = {
                user_id,
                thread_name,
                description,
                correlation_id: correlationId,
                status: 'pending',
                created_at: new Date()
            };

            const result = await collection.insertOne(newThread); 
            
            // Send immediate response to client
            res.status(201).json({ 
                message: 'Thread creation started',
                thread_id: result.insertedId,
                correlation_id: correlationId,
                status: 'pending'
            });
            
        } catch (error) {
            console.error('Error creating thread:', error);
            
            // Clean up temporary files in case of error
            if (req.files) {
                for (const fieldName in req.files) {
                    for (const file of req.files[fieldName]) {
                        try {
                            if (fs.existsSync(file.path)) {
                                fs.unlinkSync(file.path);
                                console.log(`Cleaned up temp file: ${file.path}`);
                            }
                        } catch (cleanupError) {
                            console.warn(`Error cleaning up temp file ${file.path}:`, cleanupError);
                        }
                    }
                }
            }
            
            res.status(500).json({ error: 'Error creating thread: ' + error.message });
        }
    });
};

module.exports = { addThread };