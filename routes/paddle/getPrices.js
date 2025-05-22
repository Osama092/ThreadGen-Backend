const axios = require('axios');
require('dotenv').config();

const PADDLE_API_URL_PRICE = 'https://sandbox-api.paddle.com/prices';
const BEARER_TOKEN = process.env.PADDLE_BEARER_TOKEN;

const getPrices = async (req, res) => {
    try {
        const response = await axios.get(PADDLE_API_URL_PRICE, {
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        });
        res.json(response.data); // Send data as JSON
    } catch (error) {
        console.error('Error fetching data from Paddle API:', error);
        res.status(500).json({ error: 'Internal Server Error' }); // Send error as JSON
    }
};

module.exports = { getPrices };
