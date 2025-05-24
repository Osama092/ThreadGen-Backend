// Import necessary modules for testing
const request = require('supertest');
const app = require('../../server'); // Your Express app
const { client } = require('../../mongodb'); // MongoDB client (will be mocked)
const rabbitmq = require('../../utils/rabbitmq'); // RabbitMQ utility (will be mocked)
const axios = require('axios'); // Axios for API calls (will be mocked)
const { ObjectId } = require('mongodb'); // ObjectId for mocking MongoDB IDs

// Mock MongoDB client
jest.mock('../../mongodb', () => ({
  client: {
    db: jest.fn().mockReturnThis(),
    collection: jest.fn().mockReturnThis(),
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  connectToDatabase: jest.fn().mockResolvedValue(),
}));

// Mock RabbitMQ
jest.mock('../../utils/rabbitmq', () => ({
  getChannelForRoute: jest.fn(),
}));

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

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

    // Setup default axios mocks
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('api.clerk.dev')) {
        return Promise.resolve({
          data: {
            email_addresses: [{ email_address: 'test@example.com' }]
          }
        });
      }
      if (url.includes('/subscription')) {
        return Promise.resolve({
          data: {
            isSubbed: false
          }
        });
      }
      return Promise.reject(new Error('Unexpected axios call'));
    });
  });

  test('should successfully process video generation request for basic user', async () => {
    // Setup mocks for successful flow
    const mockApiKeyDoc = { 
      api_key: mockApiKey, 
      user_id: mockUserId, 
      n_uses: 5 // Under the default limit of 100
    };
    
    client.findOne
      .mockResolvedValueOnce(mockApiKeyDoc) // API key lookup
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready', _id: new ObjectId() }); // Thread lookup
    
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId }); // Request insertion
    client.findOneAndUpdate.mockResolvedValueOnce({ 
      value: { ...mockApiKeyDoc, n_uses: 6 } // Updated usage count
    }); // API key usage update

    let capturedConsumerCallback;
    let capturedRouteCorrelationId;

    // Mock for channel.consume
    mockChannel.consume.mockImplementationOnce((replyQueueName, consumerCb) => {
      capturedConsumerCallback = consumerCb;
    });

    // Mock for channel.sendToQueue
    mockChannel.sendToQueue.mockImplementationOnce((queueName, messageBuffer, options) => {
      capturedRouteCorrelationId = options.correlationId;

      if (capturedConsumerCallback) {
        setTimeout(() => {
          capturedConsumerCallback({
            content: Buffer.from(JSON.stringify({ 
              status: 'success', 
              videoUrl: 'http://example.com/video.mp4' 
            })),
            properties: { correlationId: capturedRouteCorrelationId },
          });
        }, 100);
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
      remainingTries: 94, // 100 - 6 (after increment)
    });

    // Verify Clerk API was called
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `https://api.clerk.dev/v1/users/${mockUserId}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer')
        })
      })
    );

    // Verify RabbitMQ interactions
    expect(rabbitmq.getChannelForRoute).toHaveBeenCalledWith('generate');
    expect(mockChannel.sendToQueue).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  test('should successfully process video generation request for unlimited user', async () => {
    // Mock subscribed user with unlimited plan
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('api.clerk.dev')) {
        return Promise.resolve({
          data: {
            email_addresses: [{ email_address: 'premium@example.com' }]
          }
        });
      }
      if (url.includes('/subscription')) {
        return Promise.resolve({
          data: {
            isSubbed: true,
            subscriptionData: {
              data: {
                items: [{
                  product: { id: 'pro_01j83fwqv84197bhntf28ts527' } // Ultimate plan
                }]
              }
            }
          }
        });
      }
      return Promise.reject(new Error('Unexpected axios call'));
    });

    const mockApiKeyDoc = { 
      api_key: mockApiKey, 
      user_id: mockUserId, 
      n_uses: 500 // High usage but unlimited plan
    };
    
    client.findOne
      .mockResolvedValueOnce(mockApiKeyDoc) // API key lookup
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready', _id: new ObjectId() }); // Thread lookup
    
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId });
    client.findOneAndUpdate.mockResolvedValueOnce({ 
      value: { ...mockApiKeyDoc, n_uses: 501 }
    });

    let capturedConsumerCallback;
    mockChannel.consume.mockImplementationOnce((replyQueueName, consumerCb) => {
      capturedConsumerCallback = consumerCb;
    });

    mockChannel.sendToQueue.mockImplementationOnce((queueName, messageBuffer, options) => {
      if (capturedConsumerCallback) {
        setTimeout(() => {
          capturedConsumerCallback({
            content: Buffer.from(JSON.stringify({ 
              status: 'success', 
              videoUrl: 'http://example.com/video.mp4' 
            })),
            properties: { correlationId: options.correlationId },
          });
        }, 100);
      }
    });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText });

    expect(response.status).toBe(200);
    expect(response.body.remainingTries).toBe('unlimited');
  });

  test('should return 429 if usage limit exceeded for basic user', async () => {
    const mockApiKeyDoc = { 
      api_key: mockApiKey, 
      user_id: mockUserId, 
      n_uses: 100 // At the limit
    };
    
    client.findOne.mockResolvedValueOnce(mockApiKeyDoc);

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(429);

    expect(response.body).toEqual({
      error: 'Usage limit exceeded',
      message: 'You have reached the maximum number of API calls (100). Please upgrade your plan or contact support.',
      currentUsage: 100,
      limit: 100,
      isSubscribed: false
    });
  });

  test('should return 429 if usage limit exceeded for subscribed user', async () => {
    // Mock subscribed user with mid-tier plan (500 limit)
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('api.clerk.dev')) {
        return Promise.resolve({
          data: {
            email_addresses: [{ email_address: 'midtier@example.com' }]
          }
        });
      }
      if (url.includes('/subscription')) {
        return Promise.resolve({
          data: {
            isSubbed: true,
            subscriptionData: {
              data: {
                items: [{
                  product: { id: 'pro_01j82nzbtjmtzpyv2yp5b36stz' } // Mid-tier plan
                }]
              }
            }
          }
        });
      }
      return Promise.reject(new Error('Unexpected axios call'));
    });

    const mockApiKeyDoc = { 
      api_key: mockApiKey, 
      user_id: mockUserId, 
      n_uses: 500 // At the mid-tier limit
    };
    
    client.findOne.mockResolvedValueOnce(mockApiKeyDoc);

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(429);

    expect(response.body).toEqual({
      error: 'Usage limit exceeded',
      message: 'You have reached the maximum number of API calls (500). Please upgrade your plan or contact support.',
      currentUsage: 500,
      limit: 500,
      isSubscribed: true
    });
  });

  test('should return 400 if required fields are missing', async () => {
    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName }) // ttsText is missing
      .expect(400);

    expect(response.body).toEqual({ error: 'Missing required fields' });
    expect(client.db).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId, n_uses: 5 }) // Valid API key
      .mockResolvedValueOnce(null); // Thread not found

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: 'invalid_thread', ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Invalid threadName' });
  });

  test('should return 403 if user does not have access to thread', async () => {
    const otherUserId = new ObjectId();
    
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId, n_uses: 5 })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: otherUserId, status: 'ready' });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(403);

    expect(response.body).toEqual({ error: 'You do not have access to this thread' });
  });

  test('should return 400 if thread status is pending', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId, n_uses: 5 })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'pending' });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(400);

    expect(response.body).toEqual({ error: 'Thread is still pending' });
  });

  test('should handle Clerk API errors gracefully', async () => {
    // Mock Clerk API failure
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('api.clerk.dev')) {
        return Promise.reject(new Error('Clerk API error'));
      }
      return Promise.resolve({ data: { isSubbed: false } });
    });

    const mockApiKeyDoc = { 
      api_key: mockApiKey, 
      user_id: mockUserId, 
      n_uses: 5 
    };
    
    client.findOne
      .mockResolvedValueOnce(mockApiKeyDoc)
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready', _id: new ObjectId() });
    
    client.insertOne.mockResolvedValueOnce({ insertedId: mockRequestId });
    client.findOneAndUpdate.mockResolvedValueOnce({ 
      value: { ...mockApiKeyDoc, n_uses: 6 }
    });

    let capturedConsumerCallback;
    mockChannel.consume.mockImplementationOnce((replyQueueName, consumerCb) => {
      capturedConsumerCallback = consumerCb;
    });

    mockChannel.sendToQueue.mockImplementationOnce((queueName, messageBuffer, options) => {
      if (capturedConsumerCallback) {
        setTimeout(() => {
          capturedConsumerCallback({
            content: Buffer.from(JSON.stringify({ 
              status: 'success', 
              videoUrl: 'http://example.com/video.mp4' 
            })),
            properties: { correlationId: options.correlationId },
          });
        }, 100);
      }
    });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText });

    // Should still work with default limits when Clerk API fails
    expect(response.status).toBe(200);
    expect(response.body.remainingTries).toBe(94); // Default 100 limit - 6 usage
  });

  test('should return 202 if RabbitMQ response times out', async () => {
    client.findOne
      .mockResolvedValueOnce({ api_key: mockApiKey, user_id: mockUserId, n_uses: 5 })
      .mockResolvedValueOnce({ thread_name: mockThreadName, user_id: mockUserId, status: 'ready', _id: new ObjectId() });

    // Simulate RabbitMQ consumer never calling back
    mockChannel.consume.mockImplementationOnce((queue, callback) => {
      // Do nothing to simulate timeout
    });

    const response = await request(app)
      .post('/generate-video')
      .send({ apiKey: mockApiKey, threadName: mockThreadName, ttsText: mockTtsText })
      .expect(202);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'processing',
        message: 'Video generation started. This may take some time.',
        requestId: expect.any(String),
        remainingTries: 95, // 100 - 5 current usage
      })
    );
  }, 35000);
});