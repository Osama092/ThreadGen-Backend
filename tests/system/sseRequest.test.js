// Import necessary modules for testing
const request = require('supertest'); // Supertest for making HTTP requests
const app = require('../../server'); // Your Express app
const { client, startChangeStream } = require('../../mongodb'); // MongoDB client and startChangeStream (will be mocked)
const sseRequest = require('../../routes/requests/sseRequest'); // The SSE module itself

// Mock the entire mongodb module to control database interactions
jest.mock('../../mongodb', () => ({
    client: {
        db: jest.fn().mockReturnThis(),
        collection: jest.fn().mockReturnThis(),
        findOne: jest.fn(),
        insertOne: jest.fn(),
        updateOne: jest.fn(),
    },
    connectToDatabase: jest.fn(() => Promise.resolve()),
    // Mock startChangeStream to control when its callback is invoked
    startChangeStream: jest.fn(),
}));

describe('SSE Endpoints System Test', () => {
    let mockRes; // Mock response object for SSE
    let changeStreamCallback; // To hold the callback passed to startChangeStream

    // Before each test, reset mocks and set up common mock behaviors
    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mock calls and instances

        // Reset activeConnections in sseRequest module
        // This is important because activeConnections is a module-level variable
        // and persists between tests if not reset.
        sseRequest.initializeSSE(app); // Re-initialize SSE to clear connections

        // Mock the response object for SSE
        mockRes = {
            setHeader: jest.fn(),
            flushHeaders: jest.fn(),
            write: jest.fn(), // This is where SSE data is sent
            end: jest.fn(),
            status: jest.fn().mockReturnThis(), // For 400 responses
            send: jest.fn(), // For 400 responses
        };

        // Capture the callback passed to startChangeStream
        startChangeStream.mockImplementationOnce((callback) => {
            changeStreamCallback = callback;
        });
    });

    // Test case for successful SSE subscription
    test('should allow a client to subscribe to SSE and receive a welcome message', async () => {
        const userId = 'testUser123';

        // Simulate a client connecting to the /subscribe endpoint
        const req = {
            query: { user_id: userId },
            on: jest.fn((event, callback) => {
                // Mock the 'close' event for later testing
                if (event === 'close') {
                    req.closeCallback = callback;
                }
            }),
        };

        // Call the SSE subscription handler directly
        let subscribeHandler;
        app._router.stack.forEach(layer => {
            if (layer.route && layer.route.path === '/subscribe' && layer.route.methods.get) {
                subscribeHandler = layer.route.stack[0].handle;
            }
        });

        expect(subscribeHandler).toBeDefined(); 
        subscribeHandler(req, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
        expect(mockRes.flushHeaders).toHaveBeenCalled();

        expect(mockRes.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ user_id: "system", message: "Connected to SSE" })}\n\n`);

        // Verify that the user is registered as active
        expect(sseRequest.getActiveConnectionsCount()).toBe(1);
        expect(sseRequest.getConnectedUsers()).toContain(userId);
    });

    // Test case for sending a message to a specific user
    test('should send a message to a specific connected user', async () => {
        const userId = 'userForMessage';
        const message = { type: 'notification', content: 'New update available!' };

        // Simulate a client subscription first
        const req = {
            query: { user_id: userId },
            on: jest.fn(),
        };
        let subscribeHandler;
        app._router.stack.forEach(layer => {
            if (layer.route && layer.route.path === '/subscribe' && layer.route.methods.get) {
                subscribeHandler = layer.route.stack[0].handle;
            }
        });
        subscribeHandler(req, mockRes);
        mockRes.write.mockClear(); // Clear previous writes (welcome message)

        // Send a message using the exported function
        const sent = sseRequest.sendMessageToUser(userId, message);

        expect(sent).toBe(true); // Should return true if message was sent
        expect(mockRes.write).toHaveBeenCalledWith(`data: ${JSON.stringify(message)}\n\n`);
    });

    // Test case for broadcasting a message to all connected users
    test('should broadcast a message to all connected users', async () => {
        const user1 = 'userA';
        const user2 = 'userB';
        const broadcastMessageContent = { type: 'broadcast', content: 'System maintenance in 5 mins!' };

        // Simulate multiple client subscriptions
        const mockRes1 = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
        const mockRes2 = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };

        const req1 = { query: { user_id: user1 }, on: jest.fn() };
        const req2 = { query: { user_id: user2 }, on: jest.fn() };

        let subscribeHandler;
        app._router.stack.forEach(layer => {
            if (layer.route && layer.route.path === '/subscribe' && layer.route.methods.get) {
                subscribeHandler = layer.route.stack[0].handle;
            }
        });

        subscribeHandler(req1, mockRes1);
        subscribeHandler(req2, mockRes2);

        mockRes1.write.mockClear(); // Clear welcome messages
        mockRes2.write.mockClear();

        // Broadcast the message
        sseRequest.broadcastMessage(broadcastMessageContent);

        // Assert that both users received the message
        expect(mockRes1.write).toHaveBeenCalledWith(`data: ${JSON.stringify(broadcastMessageContent)}\n\n`);
        expect(mockRes2.write).toHaveBeenCalledWith(`data: ${JSON.stringify(broadcastMessageContent)}\n\n`);
    });

    // Test case for handling client disconnection
    test('should remove a user from active connections on disconnect', async () => {
        const userId = 'disconnectUser';

        // Simulate a client connection
        const req = {
            query: { user_id: userId },
            on: jest.fn((event, callback) => {
                if (event === 'close') {
                    req.closeCallback = callback;
                }
            }),
        };

        let subscribeHandler;
        app._router.stack.forEach(layer => {
            if (layer.route && layer.route.path === '/subscribe' && layer.route.methods.get) {
                subscribeHandler = layer.route.stack[0].handle;
            }
        });
        subscribeHandler(req, mockRes);

        expect(sseRequest.getActiveConnectionsCount()).toBe(1);
        expect(sseRequest.getConnectedUsers()).toContain(userId);

        // Simulate client disconnection by calling the stored 'close' callback
        if (req.closeCallback) {
            req.closeCallback();
        }

        // Assert that the user is no longer active
        expect(sseRequest.getActiveConnectionsCount()).toBe(0);
        expect(sseRequest.getConnectedUsers()).not.toContain(userId);
    });



    // Test case for /subscribe with missing user_id
    test('should return 400 if user_id is missing from /subscribe query', async () => {
        const response = await request(app)
            .get('/subscribe')
            .expect(400);

        expect(response.text).toBe('User id is required.');
        expect(sseRequest.getActiveConnectionsCount()).toBe(0); // No connection should be established
    });

    // Test case for sendMessageToUser for a non-existent user
    test('sendMessageToUser should return false if user is not connected', () => {
        const userId = 'nonExistentUser';
        const message = { content: 'hello' };
        const sent = sseRequest.sendMessageToUser(userId, message);
        expect(sent).toBe(false);
        expect(mockRes.write).not.toHaveBeenCalled(); // No message should be written
    });
});
