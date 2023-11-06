const functions = require('@google-cloud/functions-framework');
// Imports dependencies and set up http server
const
  request = require('request'),
  express = require('express'),
  { urlencoded, json } = require('body-parser'),
  app = express();

functions.http('webhook', (req, res) => {
  try {
    if (req.method === 'GET') {
      get(req, res);
    } else if (req.method === 'POST') {
      post(req, res);
    }

    return Promise.resolve();

  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(500).send('Internal Server Error');
  }
});

function get(req, res) {
  log("GET webhook");
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    // Responds with the challenge token from the request
    log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
    } else {
      log("wrong challenge:"  +  mode + "," + token);
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else {
    res.status(200).send("GET webhook");
    log("GET webhook");
  }
}

function post(req, res) {
  log("POST: " + JSON.stringify(req.body));
  let body = req.body;
  // Checks if this is an event from a page subscription
  if (body.object === 'page') {
    processPage(req);
  } else if (body.promptHub) {
    promptHub(body.promptHub);
  } else {
    log("POST" +  JSON.stringify(body));
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

  log("POST done!");
  res.status(200).send('EVENT_RECEIVED');
}

function processPage(req) {
  let data = req.body;
  // Iterates over each entry - there may be multiple if batched
  data.entry.forEach(function(entry) {
    let webhook_event = (entry.messaging || entry.standby )[0];
    log("Processing webhook_event: " + JSON.stringify(webhook_event));
    // Get the sender PSID
    let sender_psid = webhook_event.sender.id;
    // Check if the event is a message or postback and generate a response
    if (webhook_event.message) {
      handleMessage(webhook_event);
    } else if (webhook_event.postback) {
      handlePostback(webhook_event);
    }
  });
}

// Handles messages events
function handleMessage(webhookEvent) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;
  let receivedMessage = webhookEvent.message;

  log("handleMessage " + senderPsid + " : " + receivedMessage);
  let response;
  // Checks if the message contains text
  if (receivedMessage.text) {
    log(senderPsid + " says : " + receivedMessage.text);
    agent(receivedMessage.text)
      .then(gptResponse => {
          response = {
              'text': gptResponse
          };
          // Send the response message
          callSendAPI(webhookEvent, response);
      })
      .catch(error => {
          console.error("Error processing agent response:", error);
          // Handle error appropriately, perhaps send a message to the user
      });
  } else if (receivedMessage.attachments) {
    // Get the URL of the message attachment
    let attachmentUrl = receivedMessage.attachments[0].payload.url;
    response = {
      'attachment': {
        'type': 'template',
        'payload': {
          'template_type': 'generic',
          'elements': [{
            'title': 'Is this the right picture?',
            'subtitle': 'Tap a button to answer.',
            'image_url': attachmentUrl,
            'buttons': [
              {
                'type': 'postback',
                'title': 'Yes!',
                'payload': 'yes',
              },
              {
                'type': 'postback',
                'title': 'No!',
                'payload': 'no',
              }
            ],
          }]
        }
      }
    };

    // Send the response message
    callSendAPI(webhookEvent, response);
  }
}

// Handles messaging_postbacks events
function handlePostback(webhookEvent, receivedPostback) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;
  let response;
  // Get the payload for the postback
  let payload = receivedPostback.payload;
  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = { 'text': 'Thanks!' };
  } else if (payload === 'no') {
    response = { 'text': 'Oops, try sending another image.' };
  }
  // Send the message to acknowledge the postback
  callSendAPI(webhookEvent, response);
}
// Sends response messages via the Send API
function callSendAPI(webhookEvent, response) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;

  // The page access token we have generated in your app settings
  const pageTokenEntry = pageTokens.find(pt => pt.pageID === pageID);
  if (!pageTokenEntry) {
    throw new Error(`PageID ${pageID} not found in pageTokens array.`);
  }
//  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

  const PAGE_ACCESS_TOKEN = pageTokenEntry.token;
  const pageName = pageTokenEntry.name;
  console.log(`Sending message to ${senderPsid} on behalf of ${pageName}`);

  log(senderPsid +  ", token=" + PAGE_ACCESS_TOKEN);
  // Construct the message body
  let requestBody = {
    'recipient': {
      'id': senderPsid
    },
    'message': response
  };
  // Send the HTTP request to the Messenger Platform
  request({
    'uri': 'https://graph.facebook.com/v2.6/me/messages',
    'qs': { 'access_token': PAGE_ACCESS_TOKEN },
    'method': 'POST',
    'json': requestBody
  }, (err, _res, _body) => {
    if (!err) {
      console.log('Message sent!');
    } else {
      console.error('Unable to send message:' + err);
    }
  });
}

function log(msg) {
  console.log("ab->" + msg);
}

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getLocation() {
  const response = await fetch('https://ipapi.co/json/');
  const locationData = await response.json();
  return locationData;
}

async function getCurrentWeather(latitude, longitude) {
  console.log("getCurrentWeather...");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=apparent_temperature`;
  const response = await fetch(url);
  const weatherData = await response.json();
  console.log();
  console.log("getCurrentWeather done.");
  return weatherData;
}

const functionDefinitions = [
  {
    name: "getCurrentWeather",
    description: "Get the current weather in a given location given in latitude and longitude",
    parameters: {
      type: "object",
      properties: {
          latitude: {
              type: "string",
          },
          longitude: {
              type: "string",
          }
      },
      required: ["longitude", "latitude"]
    }
},
{
  name: "getLocation",
  description: "Get the user's location based on their IP address",
  parameters: {
      type: "object",
      properties: {}
  }
}
]

const availableFunctions = {
  getCurrentWeather,
  getLocation
};

const messages = [{
  role: "system",
  content: `Act as a personal coach. Your name is Gleb. You are smart and friendly. You can offer to speak in Russian. Always introduce yourself. When user asks "help" reply with the message history.`
  },
  {"role": "user", "content": "Who are you?"},
  {"role": "assistant", "content": "Privet! I am Gleb, your personal coach."}
];

async function agent(userInput) {
  messages.push({
      role: "user",
      content: userInput,
  });

  const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages
  });

  return response.choices[0].message.content;
}

function promptHub(pid) {
  log(pid);
  fetch(`https://app.prompthub.us/api/v1/projects/${pid}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Bearer Pib6eetNzwYzxaaBRkMhYAmk345VGsgPtHYtpUtJ6e0e7ade'
  },
  body: JSON.stringify({
    metadata: {
      user_id: 42,
      user_email: 'towel@fourty-two.rocks',
      user_name: 'Douglas Adams',
      user_avatar: 'https://assets.prompthub.us/image/42',
      subject_id: 28
    },
    variables: {
      type: 'Song',
      subject: 'Galaxies'
    }
  })
})
.then(res => res.json())
.then(res => console.log(res));
}


// ---- new code ---------------------------------------------------------------

const pageTokens = [{
  'name': 'Chloe',
  'pageID': '129830246883745',
  'token': 'EAAEMK9gufMEBOzXElrrJISPOcuQYuCQFDmwa47PnBVCAt2VvtO2ZBCyGl7SDJk7jpmzYtZAO87aEMtYHn0zmh6BgOSHioI5pLEojBZAI8OyCZBllZAZASX7xqiJE7L8C8ZC3SwZBiqZBvNKDP5wlNbX403dFn4e9iGIV4gohtt2RpTdGkochXZAKl00LsS6dMCGgZDZD'
}, {
  'name': 'Gleb',
  'pageID': '139249235935855',
  'token': 'EAAEMK9gufMEBO5dYHjO7AWmWUZAsIrRk9vTl98PvQwU8Fy4rI3Tx0ZBh1jNvItU2eQyZBIAFpvkWZCNJgGKR0g0FB8GczPSEqBFYXvP8OP6Ow2Keic75eJOk2gVDiIqiwuNazPNcYkGVJm7HczGXzoduwJRnM0Yp9tE7wUgNT3lyYvfrSsqFm8RDzwtFSQZDZD'
}, {
  'name': 'Gleb V1',
  'pageID': '144905368686649',
  'token': 'EAAEMK9gufMEBO4V2uiZA2kvmZACTI7uLFN9jOLhXiZBHk3ZCnjvmZBryrVMQwWA3PMnBRi5Cusr7ZBMLwEebAHmQdWcSZC6yRZBRJZAZAL11tRTZBXif8YqyFuV4n7H46HIjLo5BGEDIZAZAlqb5tnGXahTaSxNNrx6nZA8JZB8HiymZAhqjPtYMDFZBJcqNKQGLvND05pQZDZD'
}, {
  'name': 'New-i',
  'pageID': '156845804176635',
  'token': 'EAAEMK9gufMEBOxPktHTPzVIsQUkbE16ndEWFJXBeGaZBVZATB7Fs9MZBkN4eLBb1Ie31KAwL9ZAt1WutZB7NNGHSWnUu0ZBH4x38lkGhMWE2xGY0q0UyGZAG8N7bQXZAil1HLHSvCJ7I3GxIm0jllcDS3d7cPnLNLSlES7qQkKZCM6BIEhkL6oZBbkmzxjFbPB4gZDZD'
},{
  'name': 'Sunny Zajchonok',
  'pageID': '146944785160996',
  'token': 'EAAEMK9gufMEBOxkiOHtIzSBDLMJIsZCZAQRdUlgZCvqpwCMTa2ZAJIP1jKuZABZAWvxzbqNnQ1SvVVvnuw7DpcLZBbZBArJcC2fOk5jUgEdWM8EvD7QlYP0nZB52mQSmxAenoiDGd6gJZB0ZAT4tYuHD8H0nZCyc62sAgK0pHNhcLHbUFOAjTFHCKm6YSt1e6TCm6QZDZD'
}];

// Assuming request is properly required from a library like axios
const axios = require('axios');

async function sendTextMessage(pageID, userID, text) {
  const pageTokenEntry = pageTokens.find(pt => pt.pageID === pageID);
  if (!pageTokenEntry) {
    throw new Error(`PageID ${pageID} not found in pageTokens array.`);
  }
  const pageToken = pageTokenEntry.token;
  const pageName = pageTokenEntry.name;
  console.log(`Sending message to ${userID} on behalf of ${pageName}`);

  try {
    const response = await axios({
      method: 'post',
      url: 'https://graph.facebook.com/v2.6/me/messages',
      params: { access_token: pageToken },
      data: {
        recipient: { id: userID },
        message: { text: text }
      }
    });
    console.log('Message sent successfully:', response.data);
    // If you need to return something from the function:
    return response.data;
  } catch (error) {
    console.error('Failed to send message:', error);
    // Re-throw the error if you want the calling function to handle it
    throw error;
  }
}
