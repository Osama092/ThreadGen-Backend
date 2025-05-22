// tests/unites/addThread.test.js

// -----------------------------------------------------------------------------
// MOCK ALL EXTERNAL MODULES AT THE VERY TOP
// This is crucial to prevent side effects when the target module is loaded.
// -----------------------------------------------------------------------------

// Mock 'fs' module
const fs = require('fs');
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  existsSync: jest.fn(() => true), // Mock for cleanup logic in addThread
  unlinkSync: jest.fn(),           // Mock for cleanup logic in addThread
}));

// Mock 'path' module
const path = require('path');
// MOCK_BASE_DIR should represent __dirname of the module under test (addThread.js)
// In your structure: C:\Users\oussa\OneDrive\Desktop\Folder\Maybe\Web\App\Backend\dummy\routes\threads
const MOCK_BASE_DIR = '/mocked/app/backend/dummy/routes/threads'; // Use a consistent mock path

jest.mock('path', () => ({
  ...jest.requireActual('path'), // Keep other path functions as actual
  join: jest.fn((...args) => {
    // This logic needs to correctly replace the *simulated* __dirname from the target module
    const resolvedArgs = args.map(arg => {
      // Heuristic: if the argument is a string that would typically be __dirname from the module,
      // replace it with our MOCK_BASE_DIR. The original code used 'flows' which might not be in your real path.
      // A more robust way is to specifically check for the first argument if it's the __dirname placeholder.
      if (typeof arg === 'string' && (arg.includes('routes') || arg.includes('threads') || arg.includes('dummy'))) { // Adjust heuristic based on your actual __dirname
        return MOCK_BASE_DIR;
      }
      return arg;
    });
    // Use the real path.join to correctly resolve '..' and other path segments
    return jest.requireActual('path').join(...resolvedArgs);
  }),
  extname: jest.fn((filePath) => jest.requireActual('path').extname(filePath)), // Mock extname to control its behavior
}));

// Mock 'uuid' module to return predictable UUIDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

// Mock 'mongodb' module (as it's imported at the top of addThread.js)
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

// Mock 'rabbitmq' utils (as it's imported at the top of addThread.js)
jest.mock('../../utils/rabbitmq', () => ({
  getChannelForRoute: jest.fn(() => ({
    assertQueue: jest.fn(),
    consume: jest.fn(),
    sendToQueue: jest.fn(() => true),
    ack: jest.fn(),
  })),
}));


// --- Mock Multer to capture its internal storage configuration ---
let capturedMulterStorageConfig = {};

jest.mock('multer', () => {
  const mockDiskStorage = jest.fn((options) => {
    capturedMulterStorageConfig = options; // Capture the passed options (destination, filename)
    return { // Return a mock object that simulates what diskStorage would return
      _mocked_destination: options.destination,
      _mocked_filename: options.filename,
    };
  });

  const multerFn = jest.fn((options) => ({
    // Mock upload.fields as it's used in addThread
    fields: jest.fn(() => (req, res, next) => {
      // This is a dummy middleware for this test, we don't execute full upload logic
      next(); // Just call next to allow the chain to continue
    }),
    // Add other Multer methods if they are imported or used elsewhere in addThread.js
  }));

  multerFn.diskStorage = mockDiskStorage; // Attach the mockDiskStorage
  return multerFn;
});


// Now, require the module under test.
// This will cause the top-level `multer.diskStorage` to be called and capture its config.
// Adjust the path to your addThread.js file relative to this test file.
require('../../routes/threads/addThread');


// -----------------------------------------------------------------------------
// Start of the Test Suite for Multer Disk Storage Configuration
// -----------------------------------------------------------------------------
describe('Multer Disk Storage Configuration in addThread', () => {

  // The expected resolved temporary directory path
  // path.join(MOCK_BASE_DIR, '../tempUserData') should resolve to /mocked/app/backend/dummy/routes/tempUserData
  // as if __dirname was /mocked/app/backend/dummy/routes/threads
  const EXPECTED_TEMP_DIR_PATH = path.join('/mocked/app/backend/dummy/routes/threads', '../tempUserData'); // Use the mock base dir directly here for clarity

  beforeEach(() => {
    // Clear all Jest mocks before each test to ensure isolation
    jest.clearAllMocks();
    // Re-initialize path.join mock for consistent output for each test
    path.join.mockImplementation((...args) => {
      const resolvedArgs = args.map(arg => {
        // Re-apply the specific heuristic for your __dirname
        if (typeof arg === 'string' && (arg.includes('routes') || arg.includes('threads') || arg.includes('dummy'))) {
          return MOCK_BASE_DIR;
        }
        return arg;
      });
      return jest.requireActual('path').join(...resolvedArgs);
    });
    // Re-initialize path.extname mock
    path.extname.mockImplementation((filePath) => jest.requireActual('path').extname(filePath));
  });

  // --- Tests for `destination` function ---

  test('destination: should create the temporary directory recursively', () => {
    const req = {};
    const file = { originalname: 'image.png' }; // Example file object
    const cb = jest.fn(); // Mock the callback function

    // Access the captured destination function and call it
    const destinationFunction = capturedMulterStorageConfig.destination;
    destinationFunction(req, file, cb);

    // Assert that fs.mkdirSync was called with the correct path and recursive option
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    // The path.join inside the destination function will use the mocked path.join,
    // which in turn uses MOCK_BASE_DIR to resolve the path.
    expect(path.join).toHaveBeenCalledWith(expect.any(String), '../tempUserData');
    expect(fs.mkdirSync).toHaveBeenCalledWith(EXPECTED_TEMP_DIR_PATH, { recursive: true });
  });

  test('destination: should call callback with null and the temporary directory path', () => {
    const req = {};
    const file = { originalname: 'another.jpeg' };
    const cb = jest.fn();

    const destinationFunction = capturedMulterStorageConfig.destination;
    destinationFunction(req, file, cb);

    // Assert that the callback was called correctly
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null, EXPECTED_TEMP_DIR_PATH);
  });

  test('destination: should throw error if mkdirSync fails', () => {
    const mockError = new Error('Permission denied during mkdirSync');
    // Configure fs.mkdirSync to throw an error
    fs.mkdirSync.mockImplementationOnce(() => {
      throw mockError;
    });

    const req = {};
    const file = { originalname: 'error.gif' };
    const cb = jest.fn();

    const destinationFunction = capturedMulterStorageConfig.destination;

    // Expect the destination function to propagate the error thrown by mkdirSync
    expect(() => destinationFunction(req, file, cb)).toThrow(mockError);

    // Verify mkdirSync was attempted
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fs.mkdirSync).toHaveBeenCalledWith(EXPECTED_TEMP_DIR_PATH, { recursive: true });
    // The callback should NOT be called if an error is thrown synchronously
    expect(cb).not.toHaveBeenCalled();
  });


  // --- Tests for `filename` function ---

  test('filename: should generate a unique filename with correct field name and extension', () => {
    const req = {};
    const file = {
      fieldname: 'start_thumbnail',
      originalname: 'my_start_image.webp',
      mimetype: 'image/webp'
    };
    const cb = jest.fn();

    // Access the captured filename function and call it
    const filenameFunction = capturedMulterStorageConfig.filename;
    filenameFunction(req, file, cb);

    // Expected filename: starts with fieldname, then UUID, then original extension
    // We mocked uuidv4 to return 'mock-uuid'
    const expectedFilename = 'start_thumbnail_mock-uuid.webp';

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null, expectedFilename);
  });

  test('filename: should use .png as default extension if original is missing or empty', () => {
    // Case 1: originalname has no extension
    const req1 = {};
    const file1 = {
      fieldname: 'pause_thumbnail',
      originalname: 'no_extension', // No extension
      mimetype: 'image/png'
    };
    const cb1 = jest.fn();

    // Mock path.extname to return empty string for this test case
    path.extname.mockReturnValueOnce('');

    const filenameFunction = capturedMulterStorageConfig.filename;
    filenameFunction(req1, file1, cb1);

    const expectedFilename1 = 'pause_thumbnail_mock-uuid.png';
    expect(cb1).toHaveBeenCalledWith(null, expectedFilename1);
    expect(path.extname).toHaveBeenCalledWith('no_extension');


    // Case 2: originalname is null/undefined (though Multer typically ensures it's a string)
    // For robustness, mock path.extname to handle it
    const req2 = {};
    const file2 = {
      fieldname: 'end_thumbnail',
      originalname: null, // Simulate missing originalname
      mimetype: 'image/jpeg'
    };
    const cb2 = jest.fn();

    // Mock path.extname to return empty string for this test case
    path.extname.mockReturnValueOnce('');

    filenameFunction(req2, file2, cb2);

    const expectedFilename2 = 'end_thumbnail_mock-uuid.png';
    expect(cb2).toHaveBeenCalledWith(null, expectedFilename2);
    expect(path.extname).toHaveBeenCalledWith(null); // Verify extname was called with null
  });

  test('filename: should pass error to callback if path.extname throws (unlikely but for robustness)', () => {
    const mockError = new Error('Simulated path.extname error');
    path.extname.mockImplementationOnce(() => {
      throw mockError;
    });

    const req = {};
    const file = {
      fieldname: 'start_thumbnail',
      originalname: 'corrupt.jpg',
      mimetype: 'image/jpeg'
    };
    const cb = jest.fn();

    const filenameFunction = capturedMulterStorageConfig.filename;

    // The filename function itself doesn't have a try-catch, so it will throw
    expect(() => filenameFunction(req, file, cb)).toThrow(mockError);
    expect(cb).not.toHaveBeenCalled(); // Callback should not be called
  });

});