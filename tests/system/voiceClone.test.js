// osama092/threadgen-backend/ThreadGen-Backend-0f745508f8740e9a5ea964aae7bd5c73d8570f64/tests/system/voiceClone.test.js
const request = require('supertest');
const app =require('../../server'); //
const { connectToDatabase, closeDatabaseConnection, client: mongoClient } = require('../../mongodb');
const { connectRabbitMQ, closeRabbitMQ } = require('../../utils/rabbitmq');

// Increase Jest timeout for this test suite if needed, especially for beforeAll/afterAll
// jest.setTimeout(30000); // Example: 30 seconds, place at the top of the file

describe('POST /clone-audio', () => {
    beforeAll(async () => {
        // Ensure MongoDB is connected. This will also handle the logs from connectToDatabase.
        await connectToDatabase(); //

        // Ensure RabbitMQ is connected. This will handle logs from connectRabbitMQ.
        try {
            await connectRabbitMQ(); //
        } catch (err) {
            console.error("Failed to connect RabbitMQ in beforeAll for voiceClone.test.js:", err);
            // Depending on test needs, you might want to throw err to fail the suite
        }
    }, 20000); // Increased timeout for beforeAll, e.g., 20 seconds

    afterAll(async () => {
        await closeRabbitMQ(); //
        await closeDatabaseConnection(); //
    }, 20000); // Increased timeout for afterAll

    it('should return 202 Accepted and a success message', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .field('user_id', 'user_123')
            .field('user_name', 'Jest User')
            .attach('audio', Buffer.from('fake audio content'), {
                filename: 'test.mp3',
                contentType: 'audio/mpeg',
            }); //

        expect(response.status).toBe(202); //
        expect(response.body.message).toBe('Audio cloning request accepted'); //
        expect(response.body.status).toBe('pending'); //
        expect(response.body.file_details).toMatchObject({
            filename: expect.any(String),
            user_id: 'user_123',
            user_name: 'Jest User'
        }); //
    });

    it('should return 400 Bad Request when required fields are missing', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .attach('audio', Buffer.from('fake audio content'), {
                filename: 'test.mp3',
                contentType: 'audio/mpeg',
            }); //

        expect(response.status).toBe(400); //
        expect(response.body.error).toBe('Missing required field: user_id'); //
    });

    it('should return 400 Bad Request when audio file is missing', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .field('user_id', 'user_123')
            .field('user_name', 'Jest User'); //

        expect(response.status).toBe(400); //
        expect(response.body.error).toBe('No audio file uploaded'); //
    });
});