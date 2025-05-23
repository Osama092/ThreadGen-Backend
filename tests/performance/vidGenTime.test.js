// tests/performance/vidGen.performance.test.js
const request = require('supertest');
const app = require('../../server'); // Ensure this path is correct
const { connectToDatabase, closeDatabaseConnection } = require('../../mongodb'); // Ensure this path is correct
const { connectRabbitMQ, closeRabbitMQ, getChannelForRoute } = require('../../utils/rabbitmq'); // Ensure this path is correct

// Mock RabbitMQ
jest.mock('../../utils/rabbitmq', () => {
    const originalModule = jest.requireActual('../../utils/rabbitmq');
    return {
        ...originalModule,
        getChannelForRoute: jest.fn().mockResolvedValue({
            assertQueue: jest.fn().mockResolvedValue(undefined),
            sendToQueue: jest.fn().mockReturnValue(true), // Simulate successful send
            consume: jest.fn(),
            ack: jest.fn(),
        }),
    };
});

describe('POST /vidgen Performance', () => {
    beforeAll(async () => {
        await connectToDatabase();
        await connectRabbitMQ();
    }, 20000); 

    afterAll(async () => {
        await closeRabbitMQ();
        await closeDatabaseConnection();
    }, 20000); // Increased timeout for teardown

    it('should measure the time taken to accept and dispatch a video generation request', async () => {
        const iterations = 10; // Number of times to run the test for averaging
        let totalDuration = 0;

       
        const requestBody = {
            user_id: 'testUser123',
            script: 'This is a test script for video generation.',
            selected_voice: 'test_voice_id_or_name',
            campaignName: 'Test Campaign Performance',
            bgMusic_id: "test_music_id"
        };

        for (let i = 0; i < iterations; i++) {
            const uniqueUserId = `user_vid_perf_${i}`;
            const currentRequestBody = {
                ...requestBody,
                user_id: uniqueUserId,
                campaignName: `Test Campaign Performance ${i}`
            };

            const startTime = process.hrtime();

            const response = await request(app)
                .post('/vidgen') // Or your actual video generation endpoint
                .send(currentRequestBody);

            const endTime = process.hrtime(startTime);
            const durationMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
            totalDuration += durationMs;

            expect(response.status).toBe(202); // Assuming 202 for accepted async task
            expect(response.body.message).toBe('Video generation request received'); // Or your actual success message

        }

        const averageDurationMs = totalDuration / iterations;
        console.log(`Average /vidgen request initiation time over ${iterations} iterations: ${averageDurationMs.toFixed(2)} ms`);

    });
});