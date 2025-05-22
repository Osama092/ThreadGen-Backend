const { client } = require('../../mongodb');

const getUserKPIs = async (req, res) => {
  try {
    const { user_id, thread_name } = req.body;

    if (!user_id) {
      console.log("Missing required field: user_id");
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const database = client.db('flowgen_db');
    const collection = database.collection('user_kpis');

    // Build query based on provided fields
    const query = { user_id };
    if (thread_name) {
      query.thread_name = thread_name;
    }

    const data = await collection.find(query).toArray();

    if (data.length === 0) {
      return res.status(404).json({ error: 'No matching documents found' });
    }

    let total_watch_time = 0;
    let play_true_count = 0;
    let completion_true_count = 0;
    let replay_true_count = 0;

    data.forEach(doc => {
      total_watch_time += parseFloat(doc.watch_time || 0);
      if (parseInt(doc.play_rate) === 1) play_true_count++;
      if (parseInt(doc.completion_rate) === 1) completion_true_count++;
      if (parseInt(doc.replay_rate) === 1) replay_true_count++;
    });

    const count = data.length;

    const result = {
      count,
      average_watch_time_seconds: (total_watch_time / count).toFixed(2),
      play_rate_percent: ((play_true_count / count) * 100).toFixed(2),
      completion_rate_percent: ((completion_true_count / count) * 100).toFixed(2),
      replay_rate_percent: ((replay_true_count / count) * 100).toFixed(2)
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching and processing data:', error);
    res.status(500).send('Error fetching data');
  }
};

module.exports = { getUserKPIs };
