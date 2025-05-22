jest.mock('../../mongodb', () => ({
  client: {
    db: jest.fn(() => ({ // Mock the .db() method
      collection: jest.fn(() => ({ // Mock the .collection() method
        findOne: jest.fn(),    // Mock findOne as it's used in addKey's loop
        insertOne: jest.fn(),  // Mock insertOne as it's used in addKey
        // Add any other MongoDB collection methods your addKey function uses
      })),
    })),
    connect: jest.fn(), // Mock the connect method if your real client has it
    close: jest.fn(),   // Mock the close method if your real client has it
  },
}));


const { generateApiKey } = require('../../routes/apiKeys/addKey');

describe('generateApiKey', () => {

  // Test 1: Check if the generated key has the correct length (32 characters)
  test('should generate an API key of 32 characters', () => {
    const apiKey = generateApiKey();
    expect(apiKey).toHaveLength(32);
  });


  // Test 3: Check for randomness (probabilistic test)
  test('should generate different keys on successive calls (high probability)', () => {
    const apiKey1 = generateApiKey();
    const apiKey2 = generateApiKey();
    expect(apiKey1).not.toBe(apiKey2);
  });

  // Test 4: Ensure the generated key is not empty
  test('should generate a non-empty API key', () => {
    const apiKey = generateApiKey();
    expect(apiKey).not.toBeNull();
    expect(apiKey).not.toBeUndefined();
    expect(apiKey.length).toBeGreaterThan(0);
  });

});