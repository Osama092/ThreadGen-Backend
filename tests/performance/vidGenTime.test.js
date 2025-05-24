// tests/performance/vidGenTime.test.js
const request = require('supertest');
const app = require('../../server'); // Ensure this path is correct
const { ObjectId } = require('mongodb'); // For creating mock ObjectId instances

// 1. Declare the object holding the mock functions at the top.
const mockDbOperations = {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    // Add any other DB methods used by genVideo.js if necessary
};

// 2. Mock the mongodb module.
jest.mock('../../mongodb', () => {
    // This factory is hoisted.
    // It can reference 'mockDbOperations' because it's defined in an outer scope
    // and will be initialized before any test code (like genVideo.js) calls client.db().collection().
    return {
        connectToDatabase: jest.fn().mockResolvedValue(true),
        closeDatabaseConnection: jest.fn().mockResolvedValue(undefined),
        client: {
            db: jest.fn().mockReturnThis(), // Allows chaining like client.db().collection()
            collection: jest.fn(() => mockDbOperations), // collection() returns our mockDbOperations object
        },
        // No need to export mockDbOperations from here, access it directly in tests.
    };
});

// --- Real RabbitMQ ---
// We need the actual RabbitMQ utility.
// It's important that utils/rabbitmq.js doesn't have a top-level require of the mongodb module
// that would cause issues with the mock order, but typically utils are self-contained or import at function scope.
const { connectRabbitMQ, closeRabbitMQ } = require('../../utils/rabbitmq');

describe('POST /generate-video Performance (with Real RabbitMQ and Worker)', () => {
    // Move test data to module scope so it's accessible everywhere
    const testUserId = new ObjectId(); 
    const testApiKey = 'perf_test_api_key_real_rmq';
    const testThreadName = 'perf_test_thread_real_rmq';
    const testThreadId = new ObjectId(); 
    const mockRequestId = new ObjectId();
    const iterations = 3; // Define iterations at module scope

    // Single beforeEach block with proper mock setup
    beforeEach(() => {
        // Reset all mocks
        mockDbOperations.findOne.mockReset();
        mockDbOperations.insertOne.mockReset();
        mockDbOperations.updateOne.mockReset();

        // Configure findOne to handle different queries using mockImplementation
        mockDbOperations.findOne.mockImplementation(async (query) => {
            if (query.api_key && query.api_key === testApiKey) {
                // Simulating API Key Check
                return { 
                    api_key: testApiKey, 
                    user_id: testUserId 
                };
            }
            if (query.thread_name && query.thread_name === testThreadName) {
                // Simulating Thread Check
                return { 
                    _id: testThreadId,
                    thread_name: testThreadName, 
                    user_id: testUserId, 
                    status: 'ready' 
                };
            }
            return null; // Default for any other findOne call
        });

        // Configure insertOne to always simulate success for the 'requests' collection
        mockDbOperations.insertOne.mockResolvedValue({ insertedId: mockRequestId });
        
        // Configure updateOne to always simulate success for updating API key usage
        mockDbOperations.updateOne.mockResolvedValue({ modifiedCount: 1 });
    });

    afterAll(async () => {
        try {
            await closeRabbitMQ(); 
        } catch (error) {
            console.warn('Error closing RabbitMQ:', error);
        }
        
        try {
            const mongodb = require('../../mongodb');
            await mongodb.closeDatabaseConnection(); 
        } catch (error) {
            console.warn('Error closing MongoDB:', error);
        }
    }, 30000);

    it('should measure the time for API validation, RabbitMQ send, worker processing (10s), and RabbitMQ receive for video URL', async () => {
        let totalDuration = 0;

        for (let i = 0; i < iterations; i++) {
            const ttsText = `Performance test iteration ${i}. Time is ${new Date().toISOString()}`;
            const currentRequestBody = {
                apiKey: testApiKey,
                threadName: testThreadName,
                ttsText: ttsText
            };

            const startTime = process.hrtime();

            const response = await request(app)
                .post('/generate-video')
                .send(currentRequestBody);

            const endTime = process.hrtime(startTime);
            const durationMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
            totalDuration += durationMs;

            console.log(`Iteration ${i+1}: Status ${response.status}, Duration ${durationMs.toFixed(2)}ms, Body:`, response.body);

            // Assertions
            expect(response.status).toBe(200); 
            expect(response.body.status).toBe('success');
            expect(response.body.video).toBe('https://www.w3schools.com/html/mov_bbb.mp4'); 
            expect(response.body.fallback_video).toBe('https://stream.mux.com/DS00Spx1CV902MCtPj5WknGlR102V5HFkDe/high.mp4');
            expect(response.body.requestId).toBe(mockRequestId.toString()); 

            // Verify DB calls - Note: these will accumulate across iterations
            // So we check that they were called at least the expected number of times
            expect(mockDbOperations.findOne).toHaveBeenCalledWith({ api_key: testApiKey });
            expect(mockDbOperations.findOne).toHaveBeenCalledWith({ thread_name: testThreadName });
            expect(mockDbOperations.insertOne).toHaveBeenCalledWith(expect.objectContaining({
                user_id: testUserId,
                thread_name: testThreadName,
                tts_text: ttsText
            }));
            expect(mockDbOperations.updateOne).toHaveBeenCalledWith({ api_key: testApiKey }, { $inc: { n_uses: 1 } });
        }

        const averageDurationMs = totalDuration / iterations;
        console.log(`Average /generate-video round trip time (including 10s worker delay) over ${iterations} iterations: ${averageDurationMs.toFixed(2)} ms`);
        expect(averageDurationMs).toBeGreaterThan(10000); 

    }, 60000 * iterations); // Now 'iterations' is in scope here
});