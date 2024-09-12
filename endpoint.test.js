const request = require('supertest');
const app = require('./server'); // Import the app instance

describe('API Endpoints', () => {
  it('should delete a request', async () => {
    const response = await request(app)
      .delete('/requests/7ad85d9b-784e-4b77-9401-ad498564826f')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should get SSE requests', async () => {
    const response = await request(app)
      .get('/sse-requests')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should add a random request', async () => {
    const response = await request(app)
      .post('/add-random-request')
      .send({ data: "eblbhkacq4lspb5254lw0fhzubd05426" })
      .expect(200);
    // Add assertions based on expected response
  });

  it('should get API keys', async () => {
    const response = await request(app)
      .get('/api-keys')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should delete an API key', async () => {
    const response = await request(app)
      .delete('/api-keys/84d440aa-f003-4604-a8bd-1e4bede9275f')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should add an API key', async () => {
    const response = await request(app)
      .post('/api-keys')
      .send({ /* payload */ })
      .expect(200);
    // Add assertions based on expected response
  });

  it('should get bills for a user', async () => {
    const response = await request(app)
      .get('/bills/tempuser0999@gmail.com')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should delete a bill', async () => {
    const response = await request(app)
      .delete('/bills/54DGD')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should get subscriptions', async () => {
    const response = await request(app)
      .get('/subscriptions')
      .expect(200);
    // Add assertions based on expected response
  });

  it('should get flows', async () => {
    const response = await request(app)
      .get('/flows')
      .expect(200);
    // Add assertions based on expected response
  });
});
