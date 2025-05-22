// tests/unit/getPlayerConfig.configFocus.test.js

// --- 1. Define ALL mocks (jest.fn()s) BEFORE jest.mock() calls ---
// MongoDB mocks
const mockFindOneApiKey = jest.fn();
const mockFindOneUser = jest.fn();

const mockApiKeysCollection = { findOne: mockFindOneApiKey };
const mockUsersCollection = { findOne: mockFindOneUser };

// Create a single, persistent mock for the .collection() method
const mockCollectionMethod = jest.fn((collectionName) => {
  if (collectionName === 'api_keys') {
    return mockApiKeysCollection;
  }
  if (collectionName === 'users') {
    return mockUsersCollection;
  }
  // Return a default mock if other collections are unexpectedly requested
  return { findOne: jest.fn().mockResolvedValue(null) };
});

// mockDb (representing client.db) will now return an object
// that uses this persistent mockCollectionMethod
const mockDb = jest.fn((dbName) => ({
  collection: mockCollectionMethod, // Use the same mock function instance
}));

// fs mocks (only need existSync, readFileSync, mkdirSync, writeFileSync from the source)
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

// --- 2. Call jest.mock() for each module, defining their mock factories ---

jest.mock('../../mongodb', () => ({
  client: {
    db: mockDb, // Use the pre-defined mockDb
  },
}));

jest.mock('fs', () => ({
  existsSync: mockExistsSync, // Use the pre-defined mockExistsSync
  readFileSync: mockReadFileSync, // Use the pre-defined mockReadFileSync
  mkdirSync: mockMkdirSync,     // Use the pre-defined mockMkdirSync
  writeFileSync: mockWriteFileSync, // Use the pre-defined mockWriteFileSync
  // If other fs methods are used in the original module, you might need to mock them too
}));

jest.mock('path', () => {
  // Use jest.requireActual inside the mock factory to get original path functions
  const actualPath = jest.requireActual('path');

  // Define the mock for path.join directly here.
  // This will be the *default* implementation when the module under test is first loaded.
  const mockedJoin = jest.fn((...args) => {
    // This heuristic handles the __dirname resolution within getPlayerConfig.js
    const resolvedArgs = args.map(arg => {
      if (typeof arg === 'string' && (arg.includes('routes') || arg.includes('apiKeys') || arg.includes('dummy'))) {
        return '/mocked/app/backend/dummy/routes/apiKeys'; // MOCK_BASE_DIR equivalent
      }
      return arg;
    });
    return actualPath.join(...resolvedArgs); // Use the actual path.join for concatenation
  });

  return {
    ...actualPath, // Keep other original path functions (like extname, if needed and not causing issues)
    join: mockedJoin, // Assign the specific mock function to join
  };
});


// --- 3. Require the modules AFTER all jest.mock() calls ---
// This ensures that when these modules are imported, their mocked versions are used.
const { client } = require('../../mongodb');
const { getPlayerConfig } = require('../../routes/apiKeys/getPlayerConfig'); // ADJUSTED IMPORT PATH
const fs = require('fs'); // Re-require fs AFTER its mock
const path = require('path'); // Re-require path AFTER its mock


describe('getPlayerConfig - Config File Focus', () => {
  let req;
  let res;

  // MOCK_BASE_DIR can be defined here as it's a constant for the tests
  const MOCK_BASE_DIR = '/mocked/app/backend/dummy/routes/apiKeys';

  const MOCK_USER_ID = 'user123';
  const MOCK_API_KEY = 'mock-api-key';
  const MOCK_THREAD_NAME = 'test-thread';
  const MOCK_TTS_TEXT = 'hello world';
  const MOCK_USER_NAME = 'testuser';

  // These paths will be calculated using the *mocked* path.join
  const MOCK_USER_FOLDER = path.join(MOCK_BASE_DIR, '..', 'userData', 'temp', `${MOCK_USER_NAME}_${MOCK_USER_ID}`);
  const MOCK_THREAD_FOLDER = path.join(MOCK_USER_FOLDER, MOCK_THREAD_NAME);
  const MOCK_CONFIG_PATH = path.join(MOCK_THREAD_FOLDER, 'config.json');

  beforeEach(() => {
    jest.clearAllMocks(); // Clears all mock implementations and call counts

    // Re-set the mock implementations for each test
    // For path.join, re-apply its specific implementation after clearAllMocks
    // Note: 'path.join' itself is a Jest mock now, so you can call .mockImplementation on it.
    path.join.mockImplementation((...args) => {
      const resolvedArgs = args.map(arg => {
        if (typeof arg === 'string' && (arg.includes('routes') || arg.includes('apiKeys') || arg.includes('dummy'))) {
          return MOCK_BASE_DIR;
        }
        return arg;
      });
      // Important: Use jest.requireActual('path').join to perform the actual path concatenation
      // within the mock. Do not call path.join directly here or it will recurse infinitely.
      return jest.requireActual('path').join(...resolvedArgs);
    });


    req = {
      body: {
        apiKey: MOCK_API_KEY,
        ttsText: MOCK_TTS_TEXT,
        threadName: MOCK_THREAD_NAME,
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    };

    // Set default resolved values for DB and FS mocks for the happy path
    mockFindOneApiKey.mockResolvedValue({ api_key: MOCK_API_KEY, user_id: MOCK_USER_ID });
    mockFindOneUser.mockResolvedValue({ user_id: MOCK_USER_ID, user_name: MOCK_USER_NAME });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ some: 'config' }));
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  // --- Tests for Finding and Returning Config File ---

  test('should return 200 with config.json content if all paths are found and config is valid', async () => {
    const mockConfigData = {
      playerSettings: { autoplay: true },
      content: { text: MOCK_TTS_TEXT },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfigData));

    await getPlayerConfig(req, res);

    expect(mockDb).toHaveBeenCalledWith('flowgen_db');
    expect(mockDb().collection).toHaveBeenCalledWith('api_keys');
    expect(mockFindOneApiKey).toHaveBeenCalledWith({ api_key: MOCK_API_KEY });
    expect(mockDb().collection).toHaveBeenCalledWith('users');
    expect(mockFindOneUser).toHaveBeenCalledWith({ user_id: MOCK_USER_ID });

    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_USER_FOLDER);
    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_THREAD_FOLDER);
    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_CONFIG_PATH);

    expect(mockReadFileSync).toHaveBeenCalledWith(MOCK_CONFIG_PATH, 'utf8');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockConfigData);
  });

  // --- Tests for Config File Not Found / Invalid Cases ---

  test('should return 404 if user folder not found', async () => {
    mockExistsSync.mockImplementation((checkPath) => {
      return checkPath !== MOCK_USER_FOLDER;
    });

    await getPlayerConfig(req, res);

    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_USER_FOLDER);
    expect(mockExistsSync).not.toHaveBeenCalledWith(MOCK_THREAD_FOLDER);
    expect(mockExistsSync).not.toHaveBeenCalledWith(MOCK_CONFIG_PATH);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "User folder not found", userFolder: MOCK_USER_FOLDER });
  });

  test('should return 404 if thread folder not found', async () => {
    mockExistsSync.mockImplementation((checkPath) => {
      return checkPath !== MOCK_THREAD_FOLDER;
    });

    await getPlayerConfig(req, res);

    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_USER_FOLDER);
    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_THREAD_FOLDER);
    expect(mockExistsSync).not.toHaveBeenCalledWith(MOCK_CONFIG_PATH);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Thread folder not found", userFolder: MOCK_USER_FOLDER, threadFolder: MOCK_THREAD_FOLDER });
  });

  test('should return 404 if config.json not found', async () => {
    mockExistsSync.mockImplementation((checkPath) => {
      return checkPath !== MOCK_CONFIG_PATH;
    });

    await getPlayerConfig(req, res);

    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_USER_FOLDER);
    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_THREAD_FOLDER);
    expect(mockExistsSync).toHaveBeenCalledWith(MOCK_CONFIG_PATH);
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "config.json not found in the thread folder",
      threadFolder: MOCK_THREAD_FOLDER,
      configPath: MOCK_CONFIG_PATH
    });
  });

  test('should return 500 if config.json contains invalid JSON', async () => {
    mockReadFileSync.mockReturnValue('this is not valid json');

    await getPlayerConfig(req, res);

    expect(mockReadFileSync).toHaveBeenCalledWith(MOCK_CONFIG_PATH, 'utf8');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid JSON in config.json" }));
  });

  test('should return 500 if fs.readFileSync throws an error', async () => {
    const mockReadError = new Error('Permission denied to read file');
    mockReadFileSync.mockImplementation(() => {
      throw mockReadError;
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await getPlayerConfig(req, res);

    expect(mockReadFileSync).toHaveBeenCalledWith(MOCK_CONFIG_PATH, 'utf8');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Error fetching config');
    expect(console.error).toHaveBeenCalledWith('Error fetching config:', mockReadError);

    jest.restoreAllMocks();
  });
});