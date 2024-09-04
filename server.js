
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 5000;
const { addEntryToJsonFile } = require('./test.js');
const bodyParser = require('body-parser'); // Import body-parser to handle form data

app.use(bodyParser.json()); // Middleware to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies


app.use(express.json());

const dataFilePath = path.join(__dirname, 'data.json');

app.use(express.static('public'));


app.get('/add-key', (req, res) => {
  addEntryToJsonFile('data.json'); // Adjust the filename if needed
  res.send('New entry added to data.json');
});


app.delete('/delete/:id', (req, res) => {
  const idToDelete = req.params.id;

  fs.readFile(dataFilePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read data file' });
    }

    let jsonData = JSON.parse(data);
    const initialLength = jsonData.length;

    // Filter out the entry with the specified ID
    jsonData = jsonData.filter(entry => entry.id !== idToDelete);

    if (jsonData.length === initialLength) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    fs.writeFile(dataFilePath, JSON.stringify(jsonData, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to write data file' });
      }

      res.status(200).json({ message: 'Entry deleted successfully' });
    });
  });
});



// Function to read messages from JSON file
const getMessagesFromFile = () => {
  const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8'); // Read file synchronously
  return JSON.parse(data); // Parse JSON data
};

// Function to write messages to JSON file
const writeMessagesToFile = (messages) => {
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(messages, null, 2)); // Write file synchronously
};

// Route to handle SSE
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const messages = getMessagesFromFile(); // Get messages from JSON file
  let messageIndex = 0;

  // Function to send a JSON message
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send messages one by one every second
  const intervalId = setInterval(() => {
    if (messageIndex < messages.length) {
      sendEvent(messages[messageIndex]); // Send the next message from the JSON file
      messageIndex++;
    } else {
      clearInterval(intervalId); // Stop sending messages when all are sent
      res.end();
    }
  }, 1000);

  // Clear interval when the connection is closed
  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
});





app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

