const axios = require('axios');
const csvtojson = require('csvtojson');

async function downloadPublicSpreadsheetToJSON(publicUrl) {
    try {
        // Fetch CSV data from the public URL
        const response = await axios.get(publicUrl);
        const csvData = response.data;

        // Convert CSV to JSON
        const jsonData = await csvtojson().fromString(csvData);
        return jsonData;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

// Usage
const publicUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjME1DhRFCcYtO-E1ef2boUzhloJxRa5UlJ4yHna0qT860RI3aEcZXXL2TJwFOpjKicTOBZY6qxP1Y/pub?gid=981500595&single=true&output=csv'; // Replace with your public URL

downloadPublicSpreadsheetToJSON(publicUrl)
    .then(jsonData => {
        console.log(JSON.stringify(jsonData, null, 2));
    })
    .catch(err => console.error(err));
