const request = require('supertest');
const express = require('express');
const { sseRequests } = require('./requests/sseRequest');

const app = express();
app.get('/sse-requests', sseRequests);

describe('SSE Requests', () => {
  it('should return 400 if email is not provided', async () => {
    const response = await request(app).get('/sse-requests');
    expect(response.status).toBe(400);
    expect(response.text).toBe('Email parameter is required');
  });

  it('should send initial data to client', async () => {
    // Mock the file read and data
    jest.mock('fs', () => ({
      readFileSync: jest.fn(() => JSON.stringify([{ email: 'test@example.com', data: 'sample' }])),
    }));

    // Increase the timeout for this test
    jest.setTimeout(10000); // Set timeout to 10 seconds

    const response = await request(app).get('/sse-requests?email=test@example.com');
    expect(response.status).toBe(200);
    // Additional assertions can be added here
  });
});