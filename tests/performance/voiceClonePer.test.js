// tests/performance/voiceClonePer.test.js

const { performance } = require('perf_hooks');
const path = require('path');
const { Writable, Readable } = require('stream'); // For type clarity and use in fs mock

// Define a performance threshold (e.g., 5 seconds)
const PERFORMANCE_THRESHOLD_MS = 5000;

// ----- MOCKS -----

// 1. Mock rabbitmq
const mockSendToQueue = jest.fn().mockReturnValue(true); // Default to true
const mockAssertQueue = jest.fn().mockResolvedValue(true); // Mock as resolved
const mockGetChannelForRoute = jest.fn().mockResolvedValue({
    assertQueue: mockAssertQueue,
    sendToQueue: mockSendToQueue,
});

// Adjust the path here to be correct relative to this test file's location.
// If tests are in 'project_root/tests/performance/' and utils is in 'project_root/utils/',
// the path should be '../../../utils/rabbitmq'.
jest.mock('../../utils/rabbitmq', () => ({ // CORRECTED PATH (ASSUMPTION)
    getChannelForRoute: mockGetChannelForRoute,
}));


// 2. Mock 'fs' (File System)
const originalFs = jest.requireActual('fs'); // For setup/teardown if needed

jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    // IMPORTANT: Require 'stream' inside the mock factory for fs streams
    const { Readable: ActualReadable, Writable: ActualWritable } = require('stream');

    return {
        ...actualFs, // Use actual fs for things not explicitly mocked (like existsSync if not mocked below)
        mkdirSync: jest.fn((dirPath, options) => {
            // console.log(`Mock fs.mkdirSync called for: ${dirPath}`);
            if (!actualFs.existsSync(dirPath)) {
                 actualFs.mkdirSync(dirPath, { recursive: true, ...options }); // Ensure recursive for safety
            }
        }),
        // Provide promises interface if your code uses it (e.g. fs.promises.mkdir)
        promises: {
            mkdir: jest.fn(async (dirPath, options) => {
                // console.log(`Mock fs.promises.mkdir called for: ${dirPath}`);
                 if (!actualFs.existsSync(dirPath)) {
                    actualFs.mkdirSync(dirPath, { recursive: true, ...options });
                }
            }),
            rename: jest.fn().mockResolvedValue(undefined),
            unlink: jest.fn().mockResolvedValue(undefined),
            // Add other fs.promises methods if used by cloneVoice.js
        },
        createReadStream: jest.fn(filePath => {
            // console.log(`Mock fs.createReadStream for: ${filePath}`);
            const readable = new ActualReadable();
            readable._read = () => {}; // No-op _read
            // Simulate some data then end
            process.nextTick(() => {
                readable.push(Buffer.from('dummy audio data for stream processing'));
                readable.push(null); // End of stream
            });
            return readable;
        }),
        createWriteStream: jest.fn(filePath => {
            // console.log(`Mock fs.createWriteStream for: ${filePath}`);
            const writable = new ActualWritable();
            writable._write = (chunk, encoding, callback) => {
                // Simulate successful write
                callback();
            };
            // Emit 'finish' shortly after to simulate stream completion for pipeline
            process.nextTick(() => writable.emit('finish'));
            return writable;
        }),
        unlinkSync: jest.fn(filePath => {
            // console.log(`Mock fs.unlinkSync: ${filePath}`);
        }),
        existsSync: jest.fn((pathToCheck) => {
            // Default mock for existsSync, can be overridden in tests if needed
            // console.log(`Mock fs.existsSync called for: ${pathToCheck}`);
            return false; // Or actualFs.existsSync(pathToCheck) if you want real checks for some paths
        }),
    };
});

// Import the module to test *after* setting up mocks.
// Adjust the path to your cloneVoice.js file.
// If tests are in 'project_root/tests/performance/' and cloneVoice.js is in 'project_root/routes/users/',
// the path should be '../../../routes/users/cloneVoice.js'.
const { audioCloning } = require('../../routes/users/cloneVoice.js'); // CORRECTED PATH (ASSUMPTION)


// ----- TEST SUITE -----
describe('cloneVoice.js Performance Test', () => {
    let mockReq;
    let mockRes;
    let next;

    // Adjusted paths assuming test is in 'tests/performance' relative to project root
    const baseUserTempDir = path.resolve(__dirname, '../../UserData/temp');
    const multerTempDir = path.resolve(__dirname, '../../tempUserData');

    beforeAll(() => {
        // Create actual directories if needed for setup (e.g., multer writing a temp file before test)
        if (!originalFs.existsSync(baseUserTempDir)) {
            originalFs.mkdirSync(baseUserTempDir, { recursive: true });
        }
        if (!originalFs.existsSync(multerTempDir)) {
            originalFs.mkdirSync(multerTempDir, { recursive: true });
        }
    });

    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mock call history and implementations

        const uniqueFileName = `temp_upload_${Date.now()}.mp3`;
        const tempFilePath = path.join(multerTempDir, uniqueFileName);

        // If cloneVoice relies on the temp file existing from multer, create a dummy one
        // For this test, we'll assume the fs.createReadStream mock handles it.
        // originalFs.writeFileSync(tempFilePath, 'dummydata');

        mockReq = {
            headers: {
                'content-type': 'multipart/form-data; boundary=---TESTBOUNDARY---'
            },
            body: {
                user_id: 'perfTestUser123',
                user_name: 'Performance Tester',
            },
            file: {
                path: tempFilePath, // Path where multer would have put the file
                originalname: 'test_audio_original.mp3',
                mimetype: 'audio/mpeg',
                size: 12345,
                fieldname: 'voice_sample', // Often included by multer
                // destination: multerTempDir, // Often included by multer
                filename: uniqueFileName,    // Often included by multer
            },
            // If cloneVoice.js uses req.app.get('io') for socket.io
            // app: { get: jest.fn().mockReturnValue({ emit: jest.fn() }) }
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            headersSent: false, // To simulate Express res object state
        };
        next = jest.fn(); // Mock for Express error handling
    });

    afterAll(() => {
        // Clean up directories created for testing if they are temporary.
        // Use originalFs for this.
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

        // Ensure this specific mock implementation is used for this test
        mockSendToQueue.mockImplementationOnce((queue, message, options) => {
            // console.log('TEST DEBUG: mockSendToQueue custom implementation CALLED!');
            if (rabbitMqMessageSentResolve) {
                rabbitMqMessageSentResolve();
            }
            return true; // Consistent with original mock (sendToQueue returns boolean)
        });

        // If fs.existsSync is important for logic paths in cloneVoice
        // you might need to specify its behavior for certain paths:
        // const fs = require('fs'); // Get the mocked fs
        // fs.existsSync.mockImplementation(p => {
        //    if (p === path.join(baseUserTempDir, `Performance Tester_perfTestUser123`)) return false; // e.g., dir does not exist first
        //    return originalFs.existsSync(p); // fallback for other paths
        // });


        const startTime = performance.now();

        // Assuming audioCloning is an async function or returns a Promise
        // because it involves file operations and async RabbitMQ calls via pipeline
        await audioCloning(mockReq, mockRes, next);

        // Now, wait for the sendToQueue to have been called (which resolves the promise)
        await rabbitMqMessageSentPromise;

        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(`Time taken for audioCloning (until RabbitMQ sendToQueue called): ${duration.toFixed(3)} ms`);

        expect(next).not.toHaveBeenCalled(); // Ensure no errors were passed to next()
        expect(mockRes.status).toHaveBeenCalledWith(202);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Audio cloning request accepted', // Or whatever your success message is
            status: 'pending', // Or your actual status
            // correlationId: expect.any(String) // If you return correlationId
        }));

        expect(mockGetChannelForRoute).toHaveBeenCalledWith('cloning');
        // Assertions on assertQueue might depend on how often getChannelForRoute is called
        // If it's called once, assertQueue is called once.
        if (mockGetChannelForRoute.mock.calls.length > 0) {
             expect(mockAssertQueue).toHaveBeenCalledWith('cloning', { durable: true });
        }
        expect(mockSendToQueue).toHaveBeenCalled(); // Confirms the mock was called

        // Further assertions on the message content
        if (mockSendToQueue.mock.calls.length > 0) {
            const sentMessageBuffer = mockSendToQueue.mock.calls[0][1];
            const sentMessage = JSON.parse(sentMessageBuffer.toString());
            expect(sentMessage.user_id).toBe('perfTestUser123');
            expect(sentMessage.user_name).toBe('Performance Tester');
            expect(sentMessage.audio_path).toBeDefined();
            // expect(sentMessage.correlationId).toBeDefined(); // if part of payload
        }

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

    }, 10000); // 10-second timeout
});