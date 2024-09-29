// subscriptionHandler.js
const axios = require('axios');
const BEARER_TOKEN = '0998c90b6d9ab77946d259e48804ff66f0b59fd1fdbd7b4bfe';
const PADDLE_API_URL_SUBSCRIPTION = 'https://sandbox-api.paddle.com/subscriptions';

const updateSubscription = async (req, res) => {
    const subscriptionId = req.params.subscription_id;
    const { price_id } = req.body; // Get price_id from the frontend request

    const body = {
        "proration_billing_mode": "do_not_bill",
        "items": [
            {
                "price_id": price_id,
                "quantity": 1
            }
        ]
    };

    console.log("*******************************", subscriptionId, body);

    try {
        const response = await axios.patch(`${PADDLE_API_URL_SUBSCRIPTION}/${subscriptionId}`, body, {
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        });
        res.json(response.data); // Send data as JSON
    } catch (error) {
        console.error(`Error updating subscription ID ${subscriptionId} on Paddle API:`, error);
        res.status(500).json({ error: 'Internal Server Error' }); // Send error as JSON
    }
};

module.exports = { updateSubscription };
