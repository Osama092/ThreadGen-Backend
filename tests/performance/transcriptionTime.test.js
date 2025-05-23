// tests/performance/threadTranscription.performance.test.js
const request = require('supertest');
const app = require('../../server'); // Ensure this path is correct
const { connectToDatabase, closeDatabaseConnection } = require('../../mongodb'); // Ensure this path is correct
const { connectRabbitMQ, closeRabbitMQ, getChannelForRoute } = require('../../utils/rabbitmq'); // Ensure this path is correct
const fs = require('fs');
const path = require('path');

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

// Mock database operations if your endpoint directly interacts with DB before responding
// For example, if it creates a thread entry immediately:
jest.mock('../../mongodb', () => {
    const originalModule = jest.requireActual('../../mongodb');
    return {
        ...originalModule,
        getDb: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
                insertOne: jest.fn().mockResolvedValue({ insertedId: 'mockThreadId123' }),
                // Add other mocked collection methods if needed by threadUpload.js
            }),
        }),
    };
});


describe('POST /threadupload Transcription Performance', () => {
    beforeAll(async () => {
        await connectToDatabase();
        // RabbitMQ is mocked, but if connectRabbitMQ does more than just getChannel, keep it.
        // Otherwise, direct connection might not be needed if fully mocked.
        await connectRabbitMQ();
    }, 20000);

    afterAll(async () => {
        // Same for closeRabbitMQ
        await closeRabbitMQ();
        await closeDatabaseConnection();
    }, 20000);

    it('should measure the time taken to accept and dispatch a transcription request', async () => {
        const iterations = 10; // Number of times to run the test for averaging
        let totalDuration = 0;

        for (let i = 0; i < iterations; i++) {
            const startTime = process.hrtime();

            // Your threadUpload.js expects 'user_id', 'campaign_id', 'thread_name', and a file
            const response = await request(app)
                .post('/threadupload') // Verify this is the correct endpoint
                .field('user_id', `user_trans_perf_${i}`)
                .field('campaign_id', `campaign_trans_perf_${i}`)
                .field('thread_name', `Performance Test Thread ${i}`)
                .attach('file', Buffer.from(`fake audio/video content ${i}`), { // Use 'file' as per multer in threadUpload.js
                    filename: `perf_test_media_${i}.mp4`, // or .mp3, .wav etc.
                    contentType: 'video/mp4', // or audio/mpeg, etc.
                });

            const endTime = process.hrtime(startTime);
            const durationMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
            totalDuration += durationMs;

            // Based on threadUpload.js, a successful initiation seems to be a 200
            // and returns the thread_id and transcription_status.
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('thread_id');
            expect(response.body.message).toBe('File uploaded and transcription initiated.');
            expect(response.body.transcription_status).toBe('pending');


            // Optional: Cleanup temporary files if created by your route
            // This depends on how 'finalFilePath' is managed in 'routes/threads/threadUpload.js'
            // e.g., if files are stored in UserData/threads/<campaign_id>/<thread_id>/
            // const campaignDir = path.join(__dirname, '../../UserData/threads', `campaign_trans_perf_${i}`);
            // if (fs.existsSync(campaignDir)) {
            //     const threadDir = path.join(campaignDir, response.body.thread_id);
            //     if (fs.existsSync(threadDir)) {
            //         const files = fs.readdirSync(threadDir);
            //         files.forEach(file => fs.unlinkSync(path.join(threadDir, file)));
            //         fs.rmdirSync(threadDir);
            //     }
            //    // Consider if campaignDir should be removed if it becomes empty
            // }
        }

        const averageDurationMs = totalDuration / iterations;
        console.log(`Average /threadupload (transcription initiation) time over ${iterations} iterations: ${averageDurationMs.toFixed(2)} ms`);

        // Optional: Add an assertion for the average duration if you have a benchmark
        // For example: expect(averageDurationMs).toBeLessThan(200); // Expect less than 200ms
    });
});