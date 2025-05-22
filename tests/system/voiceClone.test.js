const request = require('supertest');
const app = require('../../server'); // This assumes your app is properly exported

describe('POST /clone-audio', () => {

    it('should return 202 Accepted and a success message', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .field('user_id', 'user_123')
            .field('user_name', 'Jest User')
            .attach('audio', Buffer.from('fake audio content'), {
                filename: 'test.mp3',
                contentType: 'audio/mpeg',
            });

        expect(response.status).toBe(202);
        expect(response.body.message).toBe('Audio cloning request accepted');
        expect(response.body.status).toBe('pending');
        expect(response.body.file_details).toMatchObject({
            filename: expect.any(String),
            user_id: 'user_123',
            user_name: 'Jest User'
        });
    });

    it('should return 400 Bad Request when required fields are missing', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .attach('audio', Buffer.from('fake audio content'), {
                filename: 'test.mp3',
                contentType: 'audio/mpeg',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing required field: user_id');
    });

    it('should return 400 Bad Request when audio file is missing', async () => {
        const response = await request(app)
            .post('/clone-audio')
            .field('user_id', 'user_123')
            .field('user_name', 'Jest User');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('No audio file uploaded');
    });
});