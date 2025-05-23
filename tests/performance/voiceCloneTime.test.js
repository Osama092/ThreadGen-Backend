// osama092/threadgen-backend/ThreadGen-Backend-879a1be31574b09daa8105d73434a1ed5b070341/tests/system/voiceClone.performance.test.js
const request = require('supertest');
const app = require('../../server'); // Ensure this path is correct
const { connectToDatabase, closeDatabaseConnection } = require('../../mongodb'); // Ensure this path is correct
const { connectRabbitMQ, closeRabbitMQ, getChannelForRoute } = require('../../utils/rabbitmq'); // Ensure this path is correct
const fs = require('fs');
const path = require('path');

// Mock RabbitMQ to prevent actual message sending during tests
jest.mock('../../utils/rabbitmq', () => {
    const originalModule = jest.requireActual('../../utils/rabbitmq');
    return {
        ...originalModule,
        getChannelForRoute: jest.fn().mockResolvedValue({
            assertQueue: jest.fn().mockResolvedValue(undefined),
            sendToQueue: jest.fn().mockReturnValue(true),
            consume: jest.fn(),
            ack: jest.fn(),   
        }),
    };
});


describe('POST /clone-audio Performance', () => {
    beforeAll(async () => {
        await connectToDatabase();
        await connectRabbitMQ();
    }, 20000);

    afterAll(async () => {
        await closeRabbitMQ();
        await closeDatabaseConnection();
    }, 20000);

    it('should measure the time taken to accept and dispatch a voice cloning request', async () => {
        const iterations = 10; // Number of times to run the test for averaging
        let totalDuration = 0;

        for (let i = 0; i < iterations; i++) {
            const startTime = process.hrtime();

            const response = await request(app)
                .post('/clone-audio')
                .field('user_id', `user_perf_test_${i}`)
                .field('user_name', `Perf Test User ${i}`)
                .attach('audio', Buffer.from(`fake audio content ${i}`), {
                    filename: `test_perf_${i}.mp3`,
                    contentType: 'audio/mpeg',
                });

            const endTime = process.hrtime(startTime);
            const durationMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
            totalDuration += durationMs;

            expect(response.status).toBe(202);
            expect(response.body.message).toBe('Audio cloning request accepted');
            expect(response.body.status).toBe('pending');

        }

        const averageDurationMs = totalDuration / iterations;
        console.log(`Average request initiation time over ${iterations} iterations: ${averageDurationMs.toFixed(2)} ms`);

    });
});