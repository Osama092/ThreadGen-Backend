// tests/unites/addTranscript.test.js

process.env.MONGODB_URI = 'mongodb://localhost:27017/jest_test_db_dummy';

const { ObjectId } = require('mongodb');
const path =require('path'); // Ensure path is imported

// Mock dependencies at the top. Paths relative to this test file.
jest.mock('fs');
jest.mock('uuid', () => ({ v4: jest.fn() }));

// Corrected path: If rabbitmq.js is at project_root/utils/rabbitmq.js
jest.mock('../../utils/rabbitmq', () => ({
    getChannelForRoute: jest.fn(),
}), { virtual: true });

// Corrected path: If mongodb.js is at project_root/mongodb.js
jest.mock('../../mongodb', () => ({
    client: {
        db: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({ findOne: jest.fn() }),
        }),
    },
}), { virtual: true });

// NOTE: We will use jest.doMock('multer', ...) inside the test blocks where it's needed,
// so we don't put a jest.mock('multer', ...) at the top level here.

describe('uploadThread - Unit Tests', () => {
    let mockReq;
    let mockRes;
    let fsMock;
    let rabbitmqMockModule;
    let mockRabbitMqChannelInstance;
    let mongodbMockClient;
    let mockMongoCollection;
    let uuidMock;
    let uploadThread; // Will be re-required in tests

    beforeEach(() => {
        jest.resetModules(); // Reset modules to allow re-requiring with fresh mocks

        fsMock = require('fs');
        fsMock.existsSync.mockReturnValue(true);
        fsMock.unlinkSync.mockReturnValue(undefined);
        fsMock.mkdirSync.mockReturnValue(undefined);

        uuidMock = require('uuid');
        uuidMock.v4
            .mockReturnValueOnce('mock-uuid-for-filename-123')
            .mockReturnValueOnce('mock-correlation-id-456')
            .mockReturnValueOnce('mock-reply-queue-uuid-789');

        rabbitmqMockModule = require('../../utils/rabbitmq');
        mockRabbitMqChannelInstance = {
            assertQueue: jest.fn().mockResolvedValue({ queue: 'mock-reply-queue' }),
            sendToQueue: jest.fn().mockReturnValue(true),
            consume: jest.fn(),
            ack: jest.fn(),
        };
        rabbitmqMockModule.getChannelForRoute.mockResolvedValue(mockRabbitMqChannelInstance);

        mongodbMockClient = require('../../mongodb').client;
        mockMongoCollection = mongodbMockClient.db().collection();
        mockMongoCollection.findOne.mockResolvedValue(null);

        mockReq = {
            headers: { 'content-type': 'multipart/form-data; boundary=---TESTBOUNDARY---' },
            body: { user_id: 'testUser123', user_name: 'Test User', flow_name: 'Test Flow' },
            file: { path: '/mocked/temp/file.mp4', originalname: 'video.mp4', mimetype: 'video/mp4', size: 102400 },
            uniqueFilename: 'mock-uuid-for-filename-123.mp4'
        };
        fsMock.existsSync.mockImplementation(p => p === mockReq.file.path);
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn(), headersSent: false };
    });

    test('should upload, send to RabbitMQ, process successful transcription reply, and delete temp file', async () => {
        let capturedConsumerCallback;
        mockRabbitMqChannelInstance.consume.mockImplementation((replyQueue, callback) => {
            capturedConsumerCallback = callback;
        });

        // Dynamically mock multer for this test
        let actualHandlerLogic; // To capture the callback from uploadThread.js
        jest.doMock('multer', () => {
            const mockSingle = jest.fn().mockImplementation(fieldName => (req, res, nextCallback) => {
                // This is our mocked `uploadMiddleware` (the result of multer().single())
                req.file = mockReq.file; // Simulate multer adding file to req
                req.uniqueFilename = mockReq.uniqueFilename;
                actualHandlerLogic = nextCallback; // Capture the actual logic handler
                actualHandlerLogic(null);      // Execute it with no multer error
            });

            const mMulter = jest.fn(() => ({ // This is the mock for `multer()` call
                single: mockSingle,
            }));

            // Attach static methods like diskStorage to the mock multer function itself
            mMulter.diskStorage = jest.fn(options => {
                // Minimal mock for diskStorage, just needs to be a function
                // console.log('Mock multer.diskStorage called with options:', options);
                return {
                    _handleFile: jest.fn(),
                    _removeFile: jest.fn(),
                }; // Return a dummy storage object
            });
            return mMulter;
        });

        // Re-require the module under test *after* jest.doMock('multer', ...)
        uploadThread = require('../../routes/threads/threadUpload.js').uploadThread; // ADJUST PATH HERE

        await uploadThread(mockReq, mockRes);

        // Assertions
        const expectedCorrelationId = 'mock-correlation-id-456'; // Second uuid mock call
        const expectedReplyQueueName = `response-mock-reply-queue-uuid-789`;

        expect(rabbitmqMockModule.getChannelForRoute).toHaveBeenCalledWith('transcript');
        expect(mockRabbitMqChannelInstance.assertQueue).toHaveBeenCalledWith('transcript', { durable: true });
        expect(mockRabbitMqChannelInstance.assertQueue).toHaveBeenCalledWith(expectedReplyQueueName, { exclusive: true });
        // ... (rest of your assertions from the working version)
        expect(mockRabbitMqChannelInstance.sendToQueue).toHaveBeenCalledWith(
            'transcript',
            expect.any(Buffer),
            expect.objectContaining({
                correlationId: expectedCorrelationId,
                replyTo: expectedReplyQueueName,
            })
        );
        const sentMessage = JSON.parse(mockRabbitMqChannelInstance.sendToQueue.mock.calls[0][1].toString());
        expect(sentMessage).toEqual(expect.objectContaining({
            user_id: 'testUser123',
            flow_name: 'Test Flow',
            temp_file_path: mockReq.file.path,
        }));

        expect(capturedConsumerCallback).toBeInstanceOf(Function);
        const mockTranscriptionServiceReply = { transcript: "Test successful.", language_code: "en-US" };
        const rabbitMqReplyMsg = {
            properties: { correlationId: expectedCorrelationId },
            content: Buffer.from(JSON.stringify(mockTranscriptionServiceReply)),
        };

        await capturedConsumerCallback(rabbitMqReplyMsg);

        expect(fsMock.unlinkSync).toHaveBeenCalledWith(mockReq.file.path);
        expect(mockRabbitMqChannelInstance.ack).toHaveBeenCalledWith(rabbitMqReplyMsg);
        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Thread uploaded successfully and transcription started',
            transcript: "Test successful."
        }));
    });

    test('should return 400 if thread name already exists for the same user', async () => {
        mockMongoCollection.findOne.mockResolvedValue({
            _id: new ObjectId(),
            thread_name: 'Test Flow',
            user_id: 'testUser123',
        });

        // Dynamically mock multer for this test as well
        let actualHandlerLogic;
        jest.doMock('multer', () => {
            const mockSingle = jest.fn().mockImplementation(fieldName => (req, res, nextCallback) => {
                req.file = mockReq.file;
                req.uniqueFilename = mockReq.uniqueFilename;
                actualHandlerLogic = nextCallback;
                actualHandlerLogic(null); // No multer error
            });
            const mMulter = jest.fn(() => ({ single: mockSingle }));
            mMulter.diskStorage = jest.fn(options => ({ _handleFile: jest.fn(), _removeFile: jest.fn() }));
            return mMulter;
        });
        uploadThread = require('../../routes/threads/threadUpload.js').uploadThread; // ADJUST PATH HERE

        await uploadThread(mockReq, mockRes);

        expect(mockMongoCollection.findOne).toHaveBeenCalledWith({
            thread_name: { $regex: `^${mockReq.body.flow_name}$`, $options: 'i' }
        });
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Thread name already exists. Please choose a different name.' });
        expect(fsMock.unlinkSync).toHaveBeenCalledWith(mockReq.file.path);
        expect(rabbitmqMockModule.getChannelForRoute).not.toHaveBeenCalled();
    });
});