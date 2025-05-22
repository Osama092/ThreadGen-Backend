const { ObjectId } = require('mongodb');
const { client } = require('../../mongodb');

const getCampaignsByUser = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).send("Missing required parameter: user_id.");
    }

    const db = client.db('flowgen_db');
    const collection = db.collection('campaigns');

    // Find all campaigns by user_id
    const campaigns = await collection.find({ user_id: user_id }).toArray();

    // Check if any campaigns exist for the user
    if (campaigns.length === 0) {
      return res.status(404).send("No campaigns found for this user.");
    }

    // Return campaigns
    res.status(200).json(campaigns);
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).send("Internal server error.");
  }
};

module.exports = { getCampaignsByUser };
