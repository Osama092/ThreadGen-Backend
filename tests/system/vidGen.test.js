// Import necessary modules for testing
const request = require('supertest');
const app = require('../../server');
const { client } = require('../../mongodb');
const rabbitmq = require('../../utils/rabbitmq');
const { ObjectId } = require('mongodb');

// Mock MongoDB client
jest.mock('../../mongodb', () => ({
  client: {
    db: jest.fn().mockReturnThis(),
    collection: jest.fn().mockReturnThis(),
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
  },
  connectToDatabase: jest.fn().mockResolvedValue(),
}));

// Mock RabbitMQ
jest.mock('../../utils/rabbitmq', () => ({
  getChannelForRoute: jest.fn(),
}));

describe('Video Generation Endpoint - /generate-video', () => {
  let mockChannel;
  let mockUserId;
  let mockApiKey;
  let mockThreadName;
  let mockTtsText;
  let mockRequestId;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup common test data
    mockUserId = new ObjectId();
    mockApiKey = 'test_api_key';
    mockThreadName = 'test_thread';
    mockTtsText = 'Test video content';
    mockRequestId = new ObjectId();
    
    // Setup RabbitMQ mock
    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue(),
      sendToQueue: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
    };
    rabbitmq.getChannelForRoute.mockResolvedValue(mockChannel);
  });

  test('should successfully process video generation request', async () => {
    // Setup mocks for successful flow
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready' });
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId });
    client.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    // Mock RabbitMQ response
    mockChannel.consume.mockImplementationOnce((queue, callback) => {
      setTimeout(() => {
        callback({
          content: Buffer.from(JSON.stringify({ status: 'success', videoUrl: 'http://example.com/video.mp4' })),
          properties: { correlationId: 'test-correlation-id' },
        });
      }, 100);
    });

    // Make request
    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(200);

    // Verify response
    expect(response.body).toEqual({
      status: 'success',
      videoUrl: 'http://example.com/video.mp4',
      requestId: mockRequestId.toString(),
    });

    // Verify message sent to queue
    expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
      'generate',
      expect.any(Buffer),
      expect.objectContaining({
        correlationId: expect.any(String),
        replyTo: expect.stringMatching(/^response-.+$/),
      })
    );
  });

  test('should return 400 if required fields are missing', async () => {
    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName })
      .expect(400);

    expect(response.body).toEqual({ error: 'Missing required fields' });
    expect(client.db).not.toHaveBeenCalled();
  });

  test('should return 400 if API key is invalid', async () => {
    client.findOne.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: 'invalid_key', threadName: mockThreadName, ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Invalid apiKey' });
  });

  test('should return 400 if thread name is invalid', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: 'invalid_thread', ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Invalid threadName' });
  });

  test('should return 403 if user does not have access to thread', async () => {
    const otherUserId = new ObjectId();
    
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: otherUserId, status: 'ready' });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(403);

    expect(response.body).toEqual({ error: 'You do not have access to this thread' });
  });

  test('should return 400 if thread status is pending', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'pending' });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Thread is still pending' });
  });

  test('should return 202 if RabbitMQ response times out', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready' });
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId });
    client.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    // Don't call the callback to simulate timeout
    mockChannel.consume.mockImplementation(() => {});

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(202);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'processing',
        message: 'Video generation started. This may take some time.',
        requestId: expect.any(String),
      })
    );
  }, 35000); // Maintain timeout for this specific test
});