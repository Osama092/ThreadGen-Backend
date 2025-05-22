// paymentMethodHandler.js
const axios = require('axios');

const BEARER_TOKEN = process.env.PADDLE_BEARER_TOKEN;
const PADDLE_API_URL_SUBSCRIPTION = 'https://sandbox-api.paddle.com/subscriptions';

const cancelSubscription = async (req, res) => {
    const subId = req.params.id;
    
    try {
        const response = await axios({
            method: 'post',
            url: `${PADDLE_API_URL_SUBSCRIPTION}/${subId}/cancel`,
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                effective_from: 'immediately'
            }
        });
        
        console.log(response.data.data.id);
        res.json(response.data); // Send data as JSON
    } catch (error) {
        console.error(`Error canceling subscription ID ${subId} with Paddle API:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            error: error.response?.data || 'Internal Server Error' 
        });
    }
};

module.exports = { cancelSubscription };