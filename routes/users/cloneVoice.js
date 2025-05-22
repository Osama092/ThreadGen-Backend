// audioCloningHandler.js
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getChannelForRoute } = require('../../utils/rabbitmq');

// Create a temporary storage configuration for initial upload
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use a dedicated temp directory that's separate from user directories
    const tempDir = path.join(__dirname, '../../tempUserData');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Extract original file extension
    const fileExtension = path.extname(file.originalname);
    
    // Generate a unique filename while preserving the original extension
    const filename = `temp_upload_${Date.now()}${fileExtension}`;
    req.uploadFilename = filename;
    cb(null, filename);
  }
});

// File filter for audio files only
const fileFilter = (req, file, cb) => {
  file.mimetype.startsWith('audio/') 
    ? cb(null, true) 
    : cb(new Error('Only audio files are allowed!'), false);
};

const upload = multer({ 
  storage: tempStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const uploadMiddleware = upload.single('audio');

const audioCloning = async (req, res) => {
  
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
        return res.status(400).json({ error: 'No audio file uploaded' });
      }

      // Verify required fields are present
      if (!req.body.user_id) {
        return res.status(400).json({ error: 'Missing required field: user_id' });
      }
      
      if (!req.body.user_name) {
        return res.status(400).json({ error: 'Missing required field: user_name' });
      }

      // Extract user fields
      const user_id = req.body.user_id;
      const user_name = req.body.user_name;
      
      // Now that we have the form fields, create the user directory
      const baseDir = path.join(__dirname, '../../UserData/temp');
      const userDir = path.join(baseDir, `${user_name}_${user_id}`);
      
      // Check if directory already exists
      if (!fs.existsSync(userDir)) {
        console.log(`Creating directory: ${userDir}`);
        fs.mkdirSync(userDir, { recursive: true });
      } else {
        console.log(`Directory already exists: ${userDir}`);
      }
      
      // Move the file from temp directory to user directory
      const tempFilePath = req.file.path;
      const finalFilename = `voice_sample_${Date.now()}${path.extname(req.file.originalname)}`;
      const finalFilePath = path.join(userDir, finalFilename);
      
      // Create a read stream from the temporary file
      const readStream = fs.createReadStream(tempFilePath);
      // Create a write stream to the new location
      const writeStream = fs.createWriteStream(finalFilePath);
      
      // Pipe the file to the new location
      readStream.pipe(writeStream);
      
      // Handle completion of the file move
      writeStream.on('finish', async () => {
        // Delete the temporary file
        fs.unlinkSync(tempFilePath);
        
        console.log(`File moved from ${tempFilePath} to ${finalFilePath}`);
        
        try {
          // Connect to RabbitMQ and prepare the channel
          const channel = await getChannelForRoute('cloning');
          await channel.assertQueue('cloning', { durable: true });

          // Generate a correlation ID for this request
          const correlationId = uuidv4();

          // Create the request payload with required fields
          const requestData = {
            user_id,
            user_name,
            audio_path: finalFilePath
          };

          // Send the message to the RabbitMQ queue
          let thread_result = channel.sendToQueue(
            'cloning',
            Buffer.from(JSON.stringify(requestData)),
            {
              correlationId: correlationId,
              replyTo: 'cloning_completion'  // Specify the reply-to queue
            }
          );

          if (!thread_result) {
            throw new Error('Failed to send request to RabbitMQ');
          }
            
          console.log(`Request sent to cloning service with correlation ID: ${correlationId}`);
        } catch (error) {
          console.error('Error in RabbitMQ handling:', error);
        }
      });
      
      writeStream.on('error', (error) => {
        console.error('Error moving file:', error);
        // If we fail to move the file, don't delete the original
      });
      
      // Send immediate response without waiting for file move or RabbitMQ response
      res.status(202).json({ 
        message: 'Audio cloning request accepted',
        status: 'pending',
        file_details: {
          filename: finalFilename,
          path: finalFilePath,
          user_id,
          user_name
        }
      });

    } catch (error) {
      console.error('Error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
};

module.exports = { audioCloning };