// paymentMethodHandler.js
const axios = require('axios');

const BEARER_TOKEN = process.env.PADDLE_BEARER_TOKEN;
const PADDLE_API_URL_SUBSCRIPTION = 'https://sandbox-api.paddle.com/subscriptions';

const updatePaymentMethodTransaction = async (req, res) => {
    const subId = req.params.id;
    
    try {
        const response = await axios.get(`${PADDLE_API_URL_SUBSCRIPTION}/${subId}/update-payment-method-transaction`, {
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        });
        
        console.log(response.data.data.id);
        res.json(response.data); // Send data as JSON
    } catch (error) {
        console.error(`Error fetching data for subscription ID ${subId} from Paddle API:`, error);
        res.status(500).json({ error: 'Internal Server Error' }); // Send error as JSON
    }
};

module.exports = { updatePaymentMethodTransaction };
