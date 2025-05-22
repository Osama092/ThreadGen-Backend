// Import necessary modules for testing
const request = require('supertest');
const app = require('../../server'); // Your Express app
const { client } = require('../../mongodb'); // MongoDB client (will be mocked)
const rabbitmq = require('../../utils/rabbitmq'); // RabbitMQ utility (will be mocked)
const { ObjectId } = require('mongodb'); // ObjectId for mocking MongoDB IDs

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
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId }) // API key lookup
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready' }); // Thread lookup
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId }); // Request insertion
    client.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }); // API key usage update

    let capturedConsumerCallback;
    let capturedRouteCorrelationId;

    // Mock for channel.consume: Capture the callback that genVideo.js provides.
    // This callback is what genVideo.js uses to process the reply from RabbitMQ.
    mockChannel.consume.mockImplementationOnce((replyQueueName, consumerCb) => {
      capturedConsumerCallback = consumerCb;
    });

    // Mock for channel.sendToQueue: Capture the correlationId used by the route.
    // Then, simulate the worker service replying by invoking the capturedConsumerCallback.
    mockChannel.sendToQueue.mockImplementationOnce((queueName, messageBuffer, options) => {
      capturedRouteCorrelationId = options.correlationId; // Capture the ID used by genVideo.js

      // Ensure the consumer has been set up by genVideo.js before trying to call it
      if (capturedConsumerCallback) {
        // Simulate the async reply from the worker service
        setTimeout(() => {
          capturedConsumerCallback({ // This is like the worker sending a message back
            content: Buffer.from(JSON.stringify({ status: 'success', videoUrl: 'http://example.com/video.mp4' })),
            properties: { correlationId: capturedRouteCorrelationId }, // IMPORTANT: Use the captured ID
          });
        }, 100); // Simulate a quick reply (100ms)
      } else {
        console.error("Test Error: Consumer callback not captured before sendToQueue was called.");
      }
    });

    // Make request
    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText });

    // Verify response
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
      videoUrl: 'http://example.com/video.mp4',
      requestId: mockRequestId.toString(),
    });

    // Verify RabbitMQ interactions
    expect(rabbitmq.getChannelForRoute).toHaveBeenCalledWith('generate');
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('generate', { durable: true });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(expect.stringMatching(/^response-.+$/), { exclusive: true }); // For the reply queue

    expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
      'generate',
      expect.any(Buffer),
      expect.objectContaining({
        correlationId: capturedRouteCorrelationId, // Ensure the captured ID was used
        replyTo: expect.stringMatching(/^response-.+$/),
      })
    );
    // Ensure the message was acknowledged by the consumer logic in genVideo.js
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  test('should return 400 if required fields are missing', async () => {
    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName }) // ttsText is missing
      .expect(400);

    expect(response.body).toEqual({ error: 'Missing required fields' });
    expect(client.db).not.toHaveBeenCalled(); // No DB interaction if validation fails early
  });

  test('should return 400 if API key is invalid', async () => {
    client.findOne.mockResolvedValueOnce(null); // Simulate API key not found

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: 'invalid_key', threadName: mockThreadName, ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Invalid apiKey' });
    expect(client.collection).toHaveBeenCalledWith('api_keys');
  });

  test('should return 400 if thread name is invalid', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId }) // Valid API key
      .mockResolvedValueOnce(null); // Thread not found

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: 'invalid_thread', ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Invalid threadName' });
  });

  test('should return 403 if user does not have access to thread', async () => {
    const otherUserId = new ObjectId(); // A different user ID
    
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId }) // API key lookup for user mockUserId
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: otherUserId, status: 'ready' }); // Thread belongs to otherUserId

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(403);

    expect(response.body).toEqual({ error: 'You do not have access to this thread' });
  });

  test('should return 400 if thread status is pending', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'pending' }); // Thread is pending

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Thread is still pending' });
  });

  test('should return 202 if RabbitMQ response times out', async () => {
    // Mocks for DB lookups
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready' });
    // client.insertOne and client.updateOne are not strictly needed for this path if the 202 is sent first,
    // but it's good to have them mocked if any part of the code before the timeout might call them.

    // Simulate RabbitMQ consumer never calling back
    mockChannel.consume.mockImplementationOnce((queue, callback) => {
      // Do nothing with the callback to simulate no response from the worker
    });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(202); // Route should send 202 after its internal 30s timeout

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'processing',
        message: 'Video generation started. This may take some time.',
        requestId: expect.any(String), // This will be the correlationId generated by the route
      })
    );
  }, 35000); // Jest timeout for this specific test (longer than the route's 30s internal timeout)
});