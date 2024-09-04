const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}

function getMonthAbbreviation(monthIndex) {
    const monthAbbr = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return monthAbbr[monthIndex];
}

function generateJsonData(existingKeys) {
    let apiKey;
    do {
        apiKey = generateRandomString(32);
    } while (existingKeys.some(entry => entry.api === apiKey));

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = getMonthAbbreviation(now.getMonth());
    const year = now.getFullYear();
    const creationDate = `${day} ${month} ${year}`;
    const numberOfUses = 0;
    const id = uuidv4(); // Generate a unique ID

    const jsonData = {
        id, // Include unique ID
        api: apiKey,
        creation_date: creationDate,
        nUses: numberOfUses
    };

    return jsonData;
}

function addEntryToJsonFile(fileName) {
    let data;
    let existingKeys = [];
    try {
        const fileContent = fs.readFileSync(fileName, 'utf8');
        data = JSON.parse(fileContent);
        existingKeys = data;
    } catch (error) {
        console.error(`Error reading or parsing ${fileName}:`, error);
        data = [];
    }

    const newEntry = generateJsonData(existingKeys);
    data.push(newEntry);

    try {
        fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf8');
        console.log(`New entry has been added to ${fileName}`);
    } catch (error) {
        console.error(`Error writing to ${fileName}:`, error);
    }
}


  

module.exports = { addEntryToJsonFile };