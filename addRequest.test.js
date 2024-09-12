const fs = require('fs');
const path = require('path');
const { addRandomRequest } = require('./requests/addRequest');
const { sendNewDataToClient } = require('./requests/sseRequest');

jest.mock('fs');
jest.mock('./requests/sseRequest');

describe('addRandomRequest', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {
        apiKey: 'valid-api-key',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    };

    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error after each test
    console.error.mockRestore();
  });

  it('should return 400 if API key is missing', () => {
    req.body.apiKey = undefined;
    addRandomRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('API key parameter is required');
  });

  it('should return 401 if API key is invalid', () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([])); // Mock empty apiKeys.json
    addRandomRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Invalid API key');
  });

  it('should add a random request and return 201', () => {
    const apiKeysData = [{ apiKey: 'valid-api-key', email: 'test@example.com' }];
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('apiKeys.json')) {
        return JSON.stringify(apiKeysData);
      }
      return JSON.stringify([]);
    });
    fs.writeFileSync.mockImplementation(() => {});

    addRandomRequest(req, res);
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(sendNewDataToClient).toHaveBeenCalledWith('test@example.com', expect.any(Array));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Random request added successfully!' });
  });

  it('should handle errors and return 500', () => {
    fs.readFileSync.mockImplementation(() => { throw new Error('File read error'); });
    addRandomRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Error adding random request' });
  });
});