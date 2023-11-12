// server.js

require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { OpenAI } = require('openai');

const oath =
{
    "web": {
        "client_id": "627099236712-csotfqohjj3if6q3oealnf91cg9grmro.apps.googleusercontent.com",
        "project_id": "newi-1694530739098",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": "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",
        "redirect_uris": [
            "http://localhost:3000/oauth2callback",
            "https://us-west1-newi-1694530739098.cloudfunctions.net/webhook-2/oauth2callback"
        ]
    }
}

const app = express();
const PORT = 3000;

// OpenAI initialization
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

// Configure Google API
const oAuth2Client = new google.auth.OAuth2(
  oath.web.client_id,
  oath.web.client_secret,
  'http://localhost:3000/oauth2callback'
);
google.options({ auth: oAuth2Client });

// Middleware to parse JSON bodies
app.use(express.json());

// Define route to send an email response
app.post('/send-email', async (req, res) => {
  try {
    // Extract email content and recipient from request
    const { recipient, emailBody } = req.body;

    // Use OpenAI to generate a response (if needed)
    // const aiResponse = await openai.createCompletion({
    //   model: 'text-davinci-003',
    //   prompt: 'Generate a polite email response to the following: ' + emailBody,
    //   max_tokens: 150,
    // });

    // Construct the email
    // const emailContent = {
    //   to: recipient,
    //   subject: 'Re: Your Inquiry',
    //   body: aiResponse.data.choices[0].text,
    // };

    const emailContent = {
        to: 'ab2005@gmail.com',
        subject: 'Re: Your Inquiry',
        body: "aiResponse.data.choices[0].text",
      };

    // Send the email using Gmail API (this function needs to be implemented)
    await sendEmailWithGmail(emailContent);

    res.json({ message: 'Email sent successfully.' });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Function to send email with Gmail API (placeholder)
async function sendEmailWithGmail(emailContent) {
  // Implement email sending logic using Gmail API
  // This will require proper authentication and setup of the Gmail API
}

// OAuth 2.0 callback route (placeholder)
app.get('/oauth2callback', (req, res) => {
  // Handle OAuth 2.0 callback and store credentials
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
