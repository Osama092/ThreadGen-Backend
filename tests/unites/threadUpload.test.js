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
// We will use the actual path.join logic but control the base path.
const path = require('path');
const MOCK_BASE_DIR = '/test/project/root'; // A predictable base directory for our mock
jest.mock('path', () => ({
  ...jest.requireActual('path'), // Keep other path functions as actual
  // We're mocking `path.join` to behave like the real one, but starting from a controlled base.
  // This will correctly resolve the '..' in '../tempUserData'.
  join: jest.fn((...args) => {
    // If the first argument is __dirname, replace it with our mock base dir
    const resolvedArgs = args.map(arg => {
      // In the threadUpload.js file, path.join is called with `__dirname`
      // The `__dirname` in the context of the running test will point to the directory of `threadUpload.js`.
      // We need to ensure our mocked `path.join` properly handles this relative path.
      // A simple way is to treat the first argument (which is __dirname) as part of our mock base path.
      // Or, we can just replace the *first* argument (which will be `__dirname`) with a mock base.
      // Let's make it simpler and assume the first arg is always `__dirname` and replace it for the mock.
      if (typeof arg === 'string' && arg.includes('Backend') && arg.includes('dummy')) { // Heuristic for __dirname
        return MOCK_BASE_DIR;
      }
      return arg;
    });
    // Now, use the real path.join to perform the actual joining logic
    return jest.requireActual('path').join(...resolvedArgs);
  }),
}));

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
// Adjust the path as per your project structure.
// Given your error trace: `routes/threads/threadUpload.js`
require('../../routes/threads/threadUpload');


// -----------------------------------------------------------------------------
// Start of the Test Suite
// -----------------------------------------------------------------------------
describe('Multer Disk Storage Destination Logic', () => {

  // Expected resolved temporary directory path
  // MOCK_BASE_DIR + /../tempUserData should resolve to /test/project/tempUserData
  const EXPECTED_TEMP_DIR_PATH = path.join(MOCK_BASE_DIR, '../tempUserData');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-initialize path.join mock for each test for isolation
    path.join.mockImplementation((...args) => {
      const resolvedArgs = args.map(arg => {
        if (typeof arg === 'string' && arg.includes('Backend') && arg.includes('dummy')) {
          return MOCK_BASE_DIR;
        }
        return arg;
      });
      return jest.requireActual('path').join(...resolvedArgs);
    });
  });

  test('should create the temporary directory with correct path and recursive option', () => {
    const req = {};
    const file = { originalname: 'video.mp4' };
    const cb = jest.fn();

    const destinationFunction = capturedMulterStorageConfig.destination;
    destinationFunction(req, file, cb);

    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(path.join).toHaveBeenCalledWith(expect.any(String), '../tempUserData');
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

    expect(req.uniqueFilename).toBe('mock-uuid-for-filename.mov');
    expect(cb).toHaveBeenCalledWith(null, 'mock-uuid-for-filename.mov');
  });

});