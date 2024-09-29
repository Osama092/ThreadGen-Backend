const axios = require('axios');
const express = require('express');
const app = express();

const PADDLE_API_URL_SUBSCRIPTION = 'https://sandbox-api.paddle.com/subscriptions';
const PADDLE_API_URL_TRANSACTIONS = 'https://sandbox-api.paddle.com/transactions';
const BEARER_TOKEN = '0998c90b6d9ab77946d259e48804ff66f0b59fd1fdbd7b4bfe';
app.use(express.json());

const getSubscriptions = async (req, res) => {
    const { email } = req.body; // Get email from request body
    try {
        const response = await axios.get(PADDLE_API_URL_SUBSCRIPTION, {
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        });

        const subscriptions = response.data.data;
        const findSubscriptionByEmail = (email) => {
            return subscriptions.find(sub => sub.custom_data && sub.custom_data.customer_email === email);
        };
        const subscription = findSubscriptionByEmail(email);

        let isSubbed = false;
        let subscriptionData = null;
        let transactionData = [];
        let transactionDataTable = [];

        if (subscription) {
            isSubbed = subscription.status === "active";
            const subscriptionsId = subscription.id;

            try {
                const responseSub = await axios.get(`${PADDLE_API_URL_SUBSCRIPTION}/${subscriptionsId}`, {
                    headers: {
                        'Authorization': `Bearer ${BEARER_TOKEN}`
                    }
                });
                subscriptionData = responseSub.data;
            } catch (error) {
                console.error(`Error fetching data for subscription ID ${subscriptionsId} from Paddle API:`, error);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }

            try {
                const responseTransaction = await axios.get(PADDLE_API_URL_TRANSACTIONS, {
                    headers: {
                        'Authorization': `Bearer ${BEARER_TOKEN}`
                    }
                });
                const transactions = responseTransaction.data.data;

                transactionDataTable = transactions.filter(transaction => transaction.customer_id === 'ctm_01j85abzynewfd3226hz93hszk')
                transactionData = transactions
                    .filter(transaction => transaction.customer_id === 'ctm_01j85abzynewfd3226hz93hszk')
                    .filter(transaction => transaction.subscription_id === 'sub_01j8gft0hf51w4byr39sdc77t8');
            } catch (error) {
                console.error(`Error fetching transactions from Paddle API:`, error);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }
        }

        res.json({
            isSubbed: isSubbed,
            subscriptionData: subscriptionData,
            transactionData: transactionData,
            transactionDataTable: transactionDataTable
        });

    } catch (error) {
        console.error('Error fetching data from Paddle API:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSubscriptions };