const FB_GRAPH_API_BASE = 'https://graph.facebook.com/v13.0';
const APP_ID = '294857426762945';
const APP_SECRET = '95a90248e42cde7f8a18568e540d6474';
const REDIRECT_URI = 'http://localhost:3000/facebook/callback';

const axios = require('axios');
const express = require('express');
const app = express();


app.get('/facebook/login', (req, res) => {
  // Define the permissions your app will need
  const scope = 'manage_pages';

  // Redirect the user to the Facebook login page
  const authUrl = `https://www.facebook.com/v13.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scope}`;

  // In a real app, you'd want to set state parameter for CSRF protection
  res.redirect(authUrl);
});

app.get('/facebook/callback', async (req, res) => {
  const { code } = req.query;

  try {
    // Exchange the code for a user access token
    const accessTokenUrl = `https://graph.facebook.com/v13.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

    const response = await axios.get(accessTokenUrl);
    const accessToken = response.data.access_token;

    // You now have the user access token, you can retrieve the page access token using this token
    // Store the user access token securely and use it to retrieve the page access token when needed

    res.send('Login successful!');
  } catch (error) {
    console.error('Error exchanging code for token', error);
    res.status(500).send('Authentication failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Opening the browser for login...');
  // Before your express server setup or inside an async function
    (async () => {
        const open = (await import('open')).default;
        open(`http://localhost:${PORT}/facebook/login`);
    })();

});
