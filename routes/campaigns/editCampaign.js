const { ObjectId } = require('mongodb');
const { client } = require('../../mongodb');

const updateCampaign = async (req, res) => {
  try {
    const { campaign_id } = req.params; // :campaign_id as part of the URL
    const { user_id, campaign_name, campaign_description } = req.body;

    // Validate required fields
    if (!user_id || !campaign_name || !campaign_description) {
      return res.status(400).send("Missing required fields: user_id, campaign_name, or campaign_description.");
    }

    const db = client.db('flowgen_db');
    const collection = db.collection('campaigns');

    // Ensure valid ObjectId
    if (!ObjectId.isValid(campaign_id)) {
      return res.status(400).send("Invalid campaign ID.");
    }

    // Convert campaign_id to ObjectId
    const campaignObjectId = ObjectId.createFromHexString(campaign_id);

    // Find the campaign to edit
    const existingCampaign = await collection.findOne({
      _id: campaignObjectId,
      user_id: user_id
    });

    if (!existingCampaign) {
      return res.status(404).send("Campaign not found for this user.");
    }

    // Check if the new name already exists for the user (excluding this campaign)
    const duplicateCampaign = await collection.findOne({
      user_id: user_id,
      campaign_name: campaign_name,
      _id: { $ne: campaignObjectId }  // Exclude the current campaign
    });

    if (duplicateCampaign) {
      return res.status(400).send(`You already have another campaign named "${campaign_name}".`);
    }

    // Update the campaign
    const result = await collection.updateOne(
      { _id: campaignObjectId },
      { $set: { campaign_name, campaign_description } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send("No changes made, campaign may already have the same name and description.");
    }

    res.status(200).send("Campaign updated successfully.");
  } catch (err) {
    console.error("Error updating campaign:", err);
    res.status(500).send("Internal server error.");
  }
};

module.exports = { updateCampaign };
