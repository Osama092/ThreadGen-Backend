afterAll(() => {
    // Restore console functionality
    jest.restoreAllMocks();
  });const { addUser } = require('../../routes/users/addUser');

// Mock the entire mongodb module
jest.mock('../../mongodb', () => {
  // Create mock functions for MongoDB operations
  const mockInsertOne = jest.fn();
  const mockFindOne = jest.fn();
  
  // Create a mock client object
  const mockClient = {
    db: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        insertOne: mockInsertOne,
        findOne: mockFindOne
      })
    })
  };
  
  return {
    connectToDatabase: jest.fn().mockResolvedValue(true),
    client: mockClient,
    mockClient,
    mockInsertOne,
    mockFindOne
  };
});

// Import the mocked module
const { client, mockFindOne, mockInsertOne } = require('../../mongodb');

describe('addUser Route Handler', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup req and res mock objects
    req = {
      body: {
        user_id: 'test-user-123',
        full_name: 'Test User'
      }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn()
    };
    
    // Silence console logs during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('should create a new user successfully', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    
    // Mock insertOne to return successful result
    mockInsertOne.mockResolvedValueOnce({ 
      insertedId: 'mock-inserted-id-123' 
    });
    
    await addUser(req, res);
    
    expect(mockFindOne).toHaveBeenCalledWith({ user_id: 'test-user-123' });
    
    expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'test-user-123',
      user_name: 'Test User',
      voice_cloned: false
    }));
    
    const insertCall = mockInsertOne.mock.calls[0][0];
    expect(insertCall.created_at).toBeInstanceOf(Date);
    
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'mock-inserted-id-123',
      user_id: 'test-user-123',
      user_name: 'Test User',
      voice_cloned: false
    }));
  });

  it('should return 400 when required fields are missing', async () => {
    // Test with missing user_id
    req.body = {
      full_name: 'Test User'
    };
    
    await addUser(req, res);
    
    // Verify response was correct
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing required fields: user_id');
    
    // Test with missing full_name
    req.body = {
      user_id: 'test-user-123'
    };
    res.status.mockClear();
    res.send.mockClear();
    
    await addUser(req, res);
    
    // Verify response was correct
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing required fields: full_name');
    
    // Test with all fields missing
    req.body = {};
    res.status.mockClear();
    res.send.mockClear();
    
    await addUser(req, res);
    
    // Verify response was correct
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing required fields: user_id, full_name');
  });

  it('should return 400 when user already exists', async () => {
    // Mock findOne to return an existing user
    const existingUser = {
      user_id: 'test-user-123',
      user_name: 'Existing User',
      voice_cloned: true
    };
    mockFindOne.mockResolvedValueOnce(existingUser);
    
    await addUser(req, res);
    
    // Verify that findOne was called but insertOne wasn't
    expect(mockFindOne).toHaveBeenCalledWith({ user_id: 'test-user-123' });
    expect(mockInsertOne).not.toHaveBeenCalled();
    
    // Verify response was correct
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'User already exists.',
      voice_cloned: true
    });
  });

  it('should return 500 when database operation fails', async () => {
    // Mock findOne to throw an error
    mockFindOne.mockRejectedValueOnce(new Error('Database connection error'));
    
    await addUser(req, res);
    
    // Verify response was correct
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Error inserting user');
  });
});