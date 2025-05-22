// threadUpload.js
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');
const { client } = require('../../mongodb');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store all uploads in a single temp directory
    const tempDir = path.join(__dirname, '../tempUserData');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Use UUID to prevent filename collisions
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    req.uniqueFilename = uniqueFilename;
    cb(null, uniqueFilename);
  }
});

// Simple file filter that checks common video file extensions
const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  
  const videoExtensions = [
    '.mp4', '.avi', '.mov', '.wmv', '.flv', 
    '.webm', '.mkv', '.3gp', '.m4v', '.ogg'
  ];
  
  if (videoExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed! Accepted extensions: ' + videoExtensions.join(', ')), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const uploadMiddleware = upload.single('video');

const uploadThread = async (req, res) => {
  console.log("Headers:", req.headers);
  
  uploadMiddleware(req, res, async function(err) {
    // Log received data
    console.log("Form data received:", {
      body: req.body,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    
    // Handle errors
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('Unknown error:', err);
      return res.status(500).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      // Extract values with fallbacks
      const userId = req.body.user_id || 'default_user';
      const userName = req.body.user_name || 'default_name';
      const flowName = req.body.flow_name || 'default_flow';
      
      console.log("Thread values:", { userId, userName, flowName });

      // Check if a thread with this name already exists
      const database = client.db('flowgen_db');
      const collection = database.collection('flows');

      // Check if thread with this name already exists
      const existingThread = await collection.findOne({
        thread_name: { $regex: `^${flowName}$`, $options: 'i' }
      });

      // If thread exists and belongs to a different user, reject the request
      if (existingThread && existingThread.user_id.toString() == userId) {
        // Clean up the temp file since we're rejecting the request
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.log(`Thread name "${flowName}" already exists for user ${userId}.`);
        return res.status(400).json({ error: 'Thread name already exists. Please choose a different name.' });
      }

      // Get the temporary file path
      const tempFilePath = req.file.path;
      const originalExtension = path.extname(req.file.originalname);
      
      // Generate a correlation ID for tracking this request
      const correlationId = uuidv4();
      
      // Connect to RabbitMQ and send the transcription request
      try {
        const channel = await getChannelForRoute('transcript');
        await channel.assertQueue('transcript', { durable: true });
        
        // Create a response queue with a unique name
        const replyQueueName = `response-${uuidv4()}`;
        await channel.assertQueue(replyQueueName, { exclusive: true });
        
        // Create the request payload with all necessary information
        const requestData = {
          user_id: userId,
          user_name: userName,
          flow_name: flowName,
          temp_file_path: tempFilePath,
          original_filename: req.file.originalname,
          original_extension: originalExtension
        };

        // Set up a consumer for the response
        channel.consume(replyQueueName, (msg) => {
          if (msg.properties.correlationId === correlationId) {
            try {
              const response = JSON.parse(msg.content.toString());
              
              // After successful processing by Python service, delete the temp file
              try {
                if (fs.existsSync(tempFilePath)) {
                  fs.unlinkSync(tempFilePath);
                  console.log(`Temporary file deleted: ${tempFilePath}`);
                }
              } catch (deleteError) {
                console.warn(`Warning: Could not delete temporary file: ${tempFilePath}`, deleteError);
              }
              
              // Send success response to client
              res.status(201).json({
                message: 'Thread uploaded successfully and transcription started',
                details: { 
                  user_id: userId, 
                  user_name: userName, 
                  flow_name: flowName 
                },
                ...response
              });
              
            } catch (parseError) {
              console.error('Error parsing response:', parseError);
              res.status(500).json({ error: 'Error processing transcript response' });
            } finally {
              channel.ack(msg);
            }
          }
        });

        // Send the message to the RabbitMQ queue
        const sent = channel.sendToQueue(
          'transcript',
          Buffer.from(JSON.stringify(requestData)),
          {
            correlationId: correlationId,
            replyTo: replyQueueName
          }
        );

        if (!sent) {
          throw new Error('Failed to send request to RabbitMQ');
        }
        
        console.log(`Request sent to transcription service with correlation ID: ${correlationId}`);
        
        // Don't respond here - wait for the RabbitMQ response
        
      } catch (mqError) {
        console.error('RabbitMQ Error:', mqError);
        
        // Clean up the temp file in case of error
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          console.warn('Error cleaning up temporary file:', cleanupError);
        }
        
        res.status(500).json({ error: 'Error sending file for processing' });
      }
      
    } catch (error) {
      console.error('Error uploading thread:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error uploading thread: ' + error.message });
      }
    }
  });
};

module.exports = { uploadThread };