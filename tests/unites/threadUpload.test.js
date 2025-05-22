// tests/unites/threadUpload.test.js

// -----------------------------------------------------------------------------
// MOCK ALL EXTERNAL MODULES AT THE VERY TOP
// -----------------------------------------------------------------------------

// Mock 'fs' module
const fs = require('fs');
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
}));

// MOCK 'path' MODULE: This is the crucial fix!
const MOCK_BASE_DIR = '/test/project/root'; // A predictable base directory for our mock

jest.mock('path', () => {
  const actualPathModule = jest.requireActual('path'); // Get the actual 'path' module

  return {
    ...actualPathModule, // Spread all actual path functions

    // Ensure 'join' is a mock function with the corrected logic
    join: jest.fn((...args) => {
      // Check if this is the specific call from threadUpload.js's destination function:
      // path.join(__dirname, '../tempUserData')
      if (args.length === 2 && args[1] === '../tempUserData') {
        // MOCK_BASE_DIR is accessible from the outer scope here.
        return actualPathModule.join(MOCK_BASE_DIR, args[1]);
      }
      // For all other calls to path.join, use the actual path.join logic.
      return actualPathModule.join(...args);
    }),

    // Ensure 'extname' is also a mock function that wraps the actual implementation
    extname: jest.fn(actualPathModule.extname), // Fixed: Wrap in jest.fn()
  };
});

// Mock 'uuid' module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-for-filename'),
}));

// Mock 'mongodb' module
jest.mock('../../mongodb', () => ({
  client: {
    db: jest.fn(() => ({
      collection: jest.fn(() => ({
        findOne: jest.fn(),
        insertOne: jest.fn(),
      })),
    })),
  },
}));

// Mock 'rabbitmq' utils
jest.mock('../../utils/rabbitmq', () => ({
  getChannelForRoute: jest.fn(() => ({
    assertQueue: jest.fn(),
    consume: jest.fn(),
    sendToQueue: jest.fn(() => true),
    ack: jest.fn(),
  })),
}));

// Captured Multer Storage Config (needed because `storage` is not directly exported)
let capturedMulterStorageConfig = {};

// Mock 'multer' module to capture the storage configuration
jest.mock('multer', () => {
  const mockDiskStorage = jest.fn((options) => {
    capturedMulterStorageConfig = options;
    return {
      _mocked_destination: options.destination,
      _mocked_filename: options.filename,
    };
  });
  const multerFn = jest.fn((options) => ({
    single: jest.fn(() => (req, res, next) => { next(); }),
  }));
  multerFn.diskStorage = mockDiskStorage;
  return multerFn;
});


// Now, require the module under test. This will trigger the multer.diskStorage call.
require('../../routes/threads/threadUpload');


// -----------------------------------------------------------------------------
// Start of the Test Suite
// -----------------------------------------------------------------------------
describe('Multer Disk Storage Destination Logic', () => {

  const mockedPath = require('path'); // `require('path')` here gets the mocked version
  const EXPECTED_TEMP_DIR_PATH = mockedPath.join(MOCK_BASE_DIR, '../tempUserData');

  beforeEach(() => {
    jest.clearAllMocks(); // This clears call counts for all mocks, including mockedPath.extname and mockedPath.join

    // Re-initialize or re-affirm the mock implementation for path.join for each test.
    const actualPathModule = jest.requireActual('path');
    mockedPath.join.mockImplementation((...args) => {
      if (args.length === 2 && args[1] === '../tempUserData') {
        return actualPathModule.join(MOCK_BASE_DIR, args[1]);
      }
      return actualPathModule.join(...args);
    });
    // mockedPath.extname is already jest.fn(actualPathModule.extname) from the main mock.
    // jest.clearAllMocks() handles resetting its call history.
  });

  test('should create the temporary directory with correct path and recursive option', () => {
    const req = {};
    const file = { originalname: 'video.mp4' };
    const cb = jest.fn();

    const destinationFunction = capturedMulterStorageConfig.destination;
    destinationFunction(req, file, cb);

    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(mockedPath.join).toHaveBeenCalledWith(expect.any(String), '../tempUserData');
    expect(fs.mkdirSync).toHaveBeenCalledWith(EXPECTED_TEMP_DIR_PATH, { recursive: true });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null, EXPECTED_TEMP_DIR_PATH);
  });

  test('should pass an error to the callback if mkdirSync fails', () => {
    const mockError = new Error('Simulated FS Write Error');
    fs.mkdirSync.mockImplementationOnce(() => {
      throw mockError;
    });

    const req = {};
    const file = { originalname: 'fail.mp4' };
    const cb = jest.fn();

    const destinationFunction = capturedMulterStorageConfig.destination;

    expect(() => destinationFunction(req, file, cb)).toThrow(mockError);

    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fs.mkdirSync).toHaveBeenCalledWith(EXPECTED_TEMP_DIR_PATH, { recursive: true });
    expect(cb).not.toHaveBeenCalled();
  });

  test('should generate a unique filename with correct extension', () => {
    const req = {};
    const file = { originalname: 'myvideo.mov' };
    const cb = jest.fn();

    const filenameFunction = capturedMulterStorageConfig.filename;
    filenameFunction(req, file, cb);

    expect(require('uuid').v4).toHaveBeenCalled();
    // This assertion should now work as mockedPath.extname is a jest.fn()
    expect(mockedPath.extname).toHaveBeenCalledWith('myvideo.mov');

    expect(req.uniqueFilename).toBe('mock-uuid-for-filename.mov');
    expect(cb).toHaveBeenCalledWith(null, 'mock-uuid-for-filename.mov');
  });

});