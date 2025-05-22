// tests/performance/voiceClonePer.test.js
// This script uses Jest-like syntax for mocking and test structure.

const { performance } = require('perf_hooks');
const path = require('path');
// const fs = require('fs'); // fs will be mocked by Jest
const { Writable, Readable } = require('stream'); // Keep this here for type clarity if needed outside mocks, though Jest handles mock scope

// ----- FILE TO TEST -----
// Assuming cloneVoice.js is structured to be required and its dependencies are managed.

// ----- MOCKS -----

// 1. Mock '../../utils/rabbitmq'
const mockSendToQueue = jest.fn().mockReturnValue(true);
const mockAssertQueue = jest.fn().mockResolvedValue(true);
const mockGetChannelForRoute = jest.fn().mockResolvedValue({
    assertQueue: mockAssertQueue,
    sendToQueue: mockSendToQueue,
});

// Adjust the path here to be correct relative to this test file's location
// For example, if cloneVoice.js is in 'routes/users/' and this test is in 'tests/performance/',
// and rabbitmq.js is in 'utils/', the path might be '../../../utils/rabbitmq'
// Or, if your Jest config handles moduleNameMapper, that could also resolve it.
// For this example, I'll assume a relative path that might work if 'utils' is a sibling to 'tests'.
// **YOU MUST ADJUST THIS PATH BASED ON YOUR ACTUAL PROJECT STRUCTURE**
jest.mock('../../utils/rabbitmq', () => ({
    getChannelForRoute: mockGetChannelForRoute,
}), { virtual: true });


// 2. Mock 'fs' (File System)
const originalFs = jest.requireActual('fs');

jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    // IMPORTANT: Require 'stream' inside the mock factory
    const { Readable, Writable } = require('stream');

    return {
        ...actualFs, // Use actual fs for things not explicitly mocked
        mkdirSync: jest.fn((dirPath, options) => {
            // console.log(`Mock fs.mkdirSync: ${dirPath}`);
            if (!actualFs.existsSync(dirPath)) {
                 actualFs.mkdirSync(dirPath, options);
            }
        }),
        createReadStream: jest.fn(filePath => {
            // console.log(`Mock fs.createReadStream for: ${filePath}`);
            const readable = new Readable();
            readable._read = () => {};
            readable.push(Buffer.from('dummy audio data for stream processing'));
            readable.push(null);
            return readable;
        }),
        createWriteStream: jest.fn(filePath => {
            // console.log(`Mock fs.createWriteStream for: ${filePath}`);
            const writable = new Writable();
            writable._write = (chunk, encoding, callback) => {
                callback();
            };
            process.nextTick(() => writable.emit('finish'));
            return writable;
        }),
        unlinkSync: jest.fn(filePath => {
            // console.log(`Mock fs.unlinkSync: ${filePath}`);
        }),
        existsSync: actualFs.existsSync,
    };
});

// Import the module to test *after* setting up mocks.
// **ADJUST THE PATH TO YOUR cloneVoice.js FILE**
// e.g., const { audioCloning } = require('../../routes/users/cloneVoice.js');
const { audioCloning } = require('../../routes/users/cloneVoice.js'); // Assuming cloneVoice.js is in 'routes/users/' relative to project root

// ----- TEST SUITE -----
describe('cloneVoice.js Performance Test', () => {

    let mockReq;
    let mockRes;
    // Paths used by cloneVoice.js internally - ensure mocks or actual fs can handle them
    const baseUserTempDir = path.join(__dirname, '../../../UserData/temp'); // Adjusted path assuming test is in 'tests/performance'
    const multerTempDir = path.join(__dirname, '../../../tempUserData'); // Adjusted path for multer's temp

    beforeAll(() => {
        // Create actual directories if cloneVoice.js (or its mocks) rely on their existence
        // The fs.mkdirSync mock above will handle calls from cloneVoice.js
        // But if multer itself (not mocked here) needs a dir before our fs mock is active for it,
        // then originalFs might be needed here. For now, assuming mkdirSync mock is sufficient.
        if (!originalFs.existsSync(baseUserTempDir)) {
            originalFs.mkdirSync(baseUserTempDir, { recursive: true });
        }
        if (!originalFs.existsSync(multerTempDir)) {
            originalFs.mkdirSync(multerTempDir, { recursive: true });
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();

        const uniqueFileName = `temp_upload_${Date.now()}.mp3`;
        mockReq = {
            headers: { // Added headers to fix 'transfer-encoding' error
                'content-type': 'multipart/form-data; boundary=---TESTBOUNDARY---'
            },
            body: {
                user_id: 'perfTestUser123',
                user_name: 'Performance Tester',
            },
            file: {
                path: path.join(multerTempDir, uniqueFileName), // multer uses this path for the temp file
                originalname: 'test_audio_original.mp3',
                mimetype: 'audio/mpeg',
                size: 12345,
            },
            uploadFilename: uniqueFileName
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            headersSent: false,
        };
    });

    afterAll(() => {
        // Optional: Clean up directories created in beforeAll if they are temporary
        // For now, this is commented out; decide based on your needs.
        /*
        if (originalFs.existsSync(baseUserTempDir)) {
            originalFs.rmSync(baseUserTempDir, { recursive: true, force: true });
        }
        if (originalFs.existsSync(multerTempDir)) {
            originalFs.rmSync(multerTempDir, { recursive: true, force: true });
        }
        */
    });

    test('should measure time until RabbitMQ message is sent', async () => {
        let rabbitMqMessageSentResolve;
        const rabbitMqMessageSentPromise = new Promise(resolve => {
            rabbitMqMessageSentResolve = resolve;
        });

        mockSendToQueue.mockImplementation((queue, message, options) => {
            rabbitMqMessageSentResolve();
            return true;
        });

        const startTime = performance.now();

        audioCloning(mockReq, mockRes);

        await rabbitMqMessageSentPromise; // Wait for sendToQueue to be called

        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(`Time taken for audioCloning (until RabbitMQ sendToQueue called): ${duration.toFixed(3)} ms`);

        expect(mockRes.status).toHaveBeenCalledWith(202);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Audio cloning request accepted',
            status: 'pending',
        }));
        expect(mockGetChannelForRoute).toHaveBeenCalledWith('cloning');
        expect(mockAssertQueue).toHaveBeenCalledWith('cloning', { durable: true });
        expect(mockSendToQueue).toHaveBeenCalled();

        const sentMessageBuffer = mockSendToQueue.mock.calls[0][1];
        const sentMessage = JSON.parse(sentMessageBuffer.toString());
        expect(sentMessage.user_id).toBe('perfTestUser123');
        expect(sentMessage.user_name).toBe('Performance Tester');
        expect(sentMessage.audio_path).toBeDefined();
    }, 10000); // Increased timeout to 10 seconds just in case, default is 5s
});