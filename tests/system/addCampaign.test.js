// Import necessary modules for testing
const request = require('supertest'); // Supertest for making HTTP requests
const app = require('../../server'); // Your Express app
const { client } = require('../../mongodb'); // MongoDB client (will be mocked)
const rabbitmq = require('../../utils/rabbitmq'); // RabbitMQ utility (will be mocked)
const { ObjectId } = require('mongodb'); // ObjectId for mocking MongoDB IDs

// Mock the entire mongodb module to control database interactions
jest.mock('../../mongodb', () => ({
    client: {
        db: jest.fn().mockReturnThis(), // Mock db() to return 'this' for chaining
        collection: jest.fn().mockReturnThis(), // Mock collection() to return 'this' for chaining
        findOne: jest.fn(), // Mock findOne method
        insertOne: jest.fn(), // Mock insertOne method
        updateOne: jest.fn(), // Mock updateOne method
    },
    connectToDatabase: jest.fn(() => Promise.resolve()), // Mock connectToDatabase
}));

// Mock the entire rabbitmq module to control message queue interactions
jest.mock('../../utils/rabbitmq', () => ({
    getChannelForRoute: jest.fn(), // Mock getChannelForRoute
}));

describe('Campaigns Endpoint System Test - /campaigns/add-campaign', () => {
    let mockChannel; // Variable to hold the mocked RabbitMQ channel

    // Before each test, reset mocks and set up common mock behaviors
    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mock calls and instances

        // Mock RabbitMQ channel and its methods
        mockChannel = {
            assertQueue: jest.fn(() => Promise.resolve()), // Mock assertQueue
            sendToQueue: jest.fn(() => true), // Mock sendToQueue to return true for success
        };
        // Ensure getChannelForRoute returns our mocked channel
        rabbitmq.getChannelForRoute.mockResolvedValue(mockChannel);

        // Mock MongoDB client behavior
        client.db.mockReturnThis(); // Ensure db() returns the mock client itself
        client.collection.mockReturnThis(); // Ensure collection() returns the mock client itself
    });

    // Test case for successful campaign creation and message sending
    test('should successfully create a campaign and send messages to RabbitMQ', async () => {
        const mockUserId = new ObjectId(); // Use ObjectId for internal representation
        const mockUserIdString = mockUserId.toString(); // Use string for API calls/DB queries
        const mockApiKey = 'valid_api_key_123';
        const mockThreadName = 'existing_thread_for_user';
        const mockCampaignId = new ObjectId();
        const mockTtsList = ['Text 1 for video', 'Text 2 for video'];

        // Mock MongoDB findOne calls
        client.findOne
            .mockResolvedValueOnce({ // For apikeyCollection.findOne
                api_key: mockApiKey,
                user_id: mockUserIdString, // Return user_id as string
            })
            .mockResolvedValueOnce({ // For threadCollection.findOne
                _id: new ObjectId(),
                thread_name: mockThreadName,
                user_id: mockUserIdString, // Return user_id as string
                status: 'ready', // Thread must be ready
            })
            .mockResolvedValueOnce(null); // For campaignCollection.findOne (no existing campaign with same name)

        // Mock MongoDB insertOne call for campaign
        client.insertOne.mockResolvedValueOnce({ insertedId: mockCampaignId });

        // Mock MongoDB updateOne call for api_keys (increment n_uses)
        client.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'My New Campaign',
                campaign_description: 'A description of my new campaign',
                user_id: mockUserIdString, // Send user_id as string
                thread_name: mockThreadName,
                tts_text_list: mockTtsList,
                apikey: mockApiKey,
            })
            .expect(201); // Expect 201 Created

        // Assertions for response body
        expect(response.body).toEqual(
            expect.objectContaining({
                _id: mockCampaignId.toString(),
                campaign_name: 'My New Campaign',
                campaign_description: 'A description of my new campaign',
                user_id: mockUserIdString, // Expect user_id as string
                used_thread: mockThreadName,
                tts_text_list: [
                    { text: 'Text 1 for video', status: 'pending', video_url: '' },
                    { text: 'Text 2 for video', status: 'pending', video_url: '' },
                ],
                status: 'pending',
                message: 'Campaign created and processing started',
            })
        );
        expect(response.body.created_at).toBeDefined(); // Check that created_at exists

        // Verify MongoDB interactions
        expect(client.db).toHaveBeenCalledWith('flowgen_db');
        expect(client.collection).toHaveBeenCalledWith('api_keys');
        expect(client.collection).toHaveBeenCalledWith('campaigns');
        expect(client.collection).toHaveBeenCalledWith('flows');

        // Verify findOne calls for API key, thread, and existing campaign check
        // Ensure user_id is passed as string in expectations
        expect(client.findOne).toHaveBeenCalledWith({ api_key: mockApiKey, user_id: mockUserIdString });
        expect(client.findOne).toHaveBeenCalledWith({ thread_name: mockThreadName, user_id: mockUserIdString });
        expect(client.findOne).toHaveBeenCalledWith({
            campaign_name: { $regex: `^My New Campaign$`, $options: 'i' },
            user_id: mockUserIdString,
        });

        // Verify insertOne call for the new campaign
        expect(client.insertOne).toHaveBeenCalledWith(
            expect.objectContaining({
                campaign_name: 'My New Campaign',
                user_id: mockUserIdString, // Expect user_id as string
                tts_text_list: [
                    { text: 'Text 1 for video', status: 'pending', video_url: '' },
                    { text: 'Text 2 for video', status: 'pending', video_url: '' },
                ],
                status: 'pending',
            })
        );

        // Verify updateOne call for API key usage
        expect(client.updateOne).toHaveBeenCalledWith(
            { api_key: mockApiKey, user_id: mockUserIdString }, // Expect user_id as string
            { $inc: { n_uses: mockTtsList.length } }
        );

        // Verify RabbitMQ interactions
        expect(rabbitmq.getChannelForRoute).toHaveBeenCalledWith('generate');
        expect(mockChannel.assertQueue).toHaveBeenCalledWith('generate', { durable: true });

        // Verify sendToQueue calls for each TTS item
        expect(mockChannel.sendToQueue).toHaveBeenCalledTimes(mockTtsList.length);
        mockTtsList.forEach((text, index) => {
            expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
                'generate',
                Buffer.from(JSON.stringify({
                    user_id: mockUserIdString, // Expect user_id as string
                    thread: mockThreadName,
                    ttsText: text,
                    source: 'campaign',
                    campaignId: mockCampaignId.toString(),
                })),
                {
                    replyTo: 'Campaign_completion',
                    correlationId: expect.any(String),
                }
            );
        });
    });

    // Test case for missing required fields
    test('should return 400 if required fields are missing', async () => {
        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Test Campaign',
                // campaign_description is missing
                user_id: new ObjectId().toString(),
                thread_name: 'some_thread',
                tts_text_list: ['text'],
                apikey: 'some_key',
            })
            .expect(400);

        expect(response.text).toBe('Missing required fields: campaign_description');
        expect(client.db).not.toHaveBeenCalled(); // No database interaction if validation fails early
    });

    // Test case for tts_text_list not being an array
    test('should return 400 if tts_text_list is not an array', async () => {
        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Test Campaign',
                campaign_description: 'Desc',
                user_id: new ObjectId().toString(),
                thread_name: 'some_thread',
                tts_text_list: 'not_an_array', // Invalid type
                apikey: 'some_key',
            })
            .expect(400);

        expect(response.text).toBe('tts_text_list must be an array.');
        expect(client.db).not.toHaveBeenCalled();
    });

    // Test case for invalid API key for the given user
    test('should return 403 if API key is invalid for the user', async () => {
        client.findOne.mockResolvedValueOnce(null); // Mock no valid API key found

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Test Campaign',
                campaign_description: 'Desc',
                user_id: new ObjectId().toString(),
                thread_name: 'some_thread',
                tts_text_list: ['text'],
                apikey: 'invalid_key',
            })
            .expect(403);

        expect(response.text).toBe('Invalid API key for the given user.');
        expect(client.collection).toHaveBeenCalledWith('api_keys');
        // Removed expect(client.collection).not.toHaveBeenCalledWith('flows'); as 'flows' collection is initialized early
        expect(client.findOne).not.toHaveBeenCalledWith(expect.objectContaining({ thread_name: 'some_thread' })); // Ensure thread lookup doesn't happen
    });

    // Test case for thread not found or not belonging to the user
    test('should return 404 if thread not found or does not belong to user', async () => {
        const mockUserId = new ObjectId();
        client.findOne
            .mockResolvedValueOnce({ api_key: 'valid_key', user_id: mockUserId.toString() }) // Valid API key
            .mockResolvedValueOnce(null); // No thread found

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Test Campaign',
                campaign_description: 'Desc',
                user_id: mockUserId.toString(),
                thread_name: 'non_existent_thread',
                tts_text_list: ['text'],
                apikey: 'valid_key',
            })
            .expect(404);

        expect(response.text).toBe('Thread not found or does not belong to the specified user.');
        expect(client.collection).toHaveBeenCalledWith('api_keys');
        expect(client.collection).toHaveBeenCalledWith('flows');
        // Removed expect(client.collection).not.toHaveBeenCalledWith('campaigns'); as 'campaigns' collection is initialized early
        expect(client.findOne).not.toHaveBeenCalledWith(expect.objectContaining({ campaign_name: 'Test Campaign' })); // Ensure campaign lookup doesn't happen
    });

    // Test case for thread not being in 'ready' status
    test('should return 400 if thread is not ready', async () => {
        const mockUserId = new ObjectId();
        client.findOne
            .mockResolvedValueOnce({ api_key: 'valid_key', user_id: mockUserId.toString() }) // Valid API key
            .mockResolvedValueOnce({ _id: new ObjectId(), thread_name: 'pending_thread', user_id: mockUserId.toString(), status: 'pending' }); // Thread is pending

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Test Campaign',
                campaign_description: 'Desc',
                user_id: mockUserId.toString(),
                thread_name: 'pending_thread',
                tts_text_list: ['text'],
                apikey: 'valid_key',
            })
            .expect(400);

        expect(response.text).toBe('Thread "pending_thread" exists but is not ready. Current status: "pending".');
        expect(client.collection).toHaveBeenCalledWith('api_keys');
        expect(client.collection).toHaveBeenCalledWith('flows');
        // Removed expect(client.collection).not.toHaveBeenCalledWith('campaigns');
        expect(client.findOne).not.toHaveBeenCalledWith(expect.objectContaining({ campaign_name: 'Test Campaign' })); // Ensure campaign lookup doesn't happen
    });

    // Test case for campaign name already existing for the user
    test('should return 400 if campaign name already exists for the user', async () => {
        const mockUserId = new ObjectId();
        client.findOne
            .mockResolvedValueOnce({ api_key: 'valid_key', user_id: mockUserId.toString() }) // Valid API key
            .mockResolvedValueOnce({ _id: new ObjectId(), thread_name: 'existing_thread', user_id: mockUserId.toString(), status: 'ready' }) // Valid thread
            .mockResolvedValueOnce({ _id: new ObjectId(), campaign_name: 'Existing Campaign' }); // Existing campaign found

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Existing Campaign', // Duplicate name
                campaign_description: 'Desc',
                user_id: mockUserId.toString(),
                thread_name: 'existing_thread',
                tts_text_list: ['text'],
                apikey: 'valid_key',
            })
            .expect(400);

        expect(response.text).toBe('A campaign with this name already exists for this user.');
        expect(client.collection).toHaveBeenCalledWith('api_keys');
        expect(client.collection).toHaveBeenCalledWith('flows');
        expect(client.collection).toHaveBeenCalledWith('campaigns');
        expect(client.insertOne).not.toHaveBeenCalled(); // No campaign insertion
    });

    // Test case for RabbitMQ sendToQueue failure
    test('should return 500 if RabbitMQ fails to send all messages', async () => {
        const mockUserId = new ObjectId();
        const mockApiKey = 'valid_api_key_fail';
        const mockThreadName = 'existing_thread_fail';
        const mockCampaignId = new ObjectId();
        const mockTtsList = ['Text 1', 'Text 2'];

        // Mock MongoDB findOne calls
        client.findOne
            .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId.toString() })
            .mockResolvedValueOnce({ _id: new ObjectId(), thread_name: mockThreadName, user_id: mockUserId.toString(), status: 'ready' })
            .mockResolvedValueOnce(null);

        // Mock MongoDB insertOne call for campaign
        client.insertOne.mockResolvedValueOnce({ insertedId: mockCampaignId });

        // Mock MongoDB updateOne call for api_keys (increment n_uses)
        client.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

        // Mock sendToQueue to return false for one message, simulating failure
        mockChannel.sendToQueue.mockImplementationOnce(() => true); // First message succeeds
        mockChannel.sendToQueue.mockImplementationOnce(() => false); // Second message fails

        const response = await request(app)
            .post('/campaigns/add-campaign')
            .send({
                campaign_name: 'Campaign with RabbitMQ Failure',
                campaign_description: 'Desc',
                user_id: mockUserId.toString(),
                thread_name: mockThreadName,
                tts_text_list: mockTtsList,
                apikey: mockApiKey,
            })
            .expect(500); // Expect 500 Internal Server Error

        expect(response.text).toBe('Error inserting campaign'); // Generic error message from catch block
        expect(mockChannel.sendToQueue).toHaveBeenCalledTimes(mockTtsList.length); // Still attempts to send all
    });
});
