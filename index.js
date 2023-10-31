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
          log('WEBHOOK_FORBIDDEN');
          // Responds with '403 Forbidden' if verify tokens do not match
          res.sendStatus(403);
        }
      } else {
        res.status(200).send("Hello challenge");
        log("hello_challenge");
      }
    } else if (req.method === 'POST') {
      log("POST: " + JSON.stringify(req.body));
      let body = req.body;
      // Checks if this is an event from a page subscription
      if (body.object === 'page') {
        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function(entry) {
          // Gets the body of the webhook event
          let webhookEvent = entry.messaging[0];
          log(webhookEvent);
          // Get the sender PSID
          let senderPsid = webhookEvent.sender.id;
          log('Sender PSID: ' + senderPsid);
          // Check if the event is a message or postback and
          // pass the event to the appropriate handler function
          if (webhookEvent.message) {
            handleMessage(webhookEvent, webhookEvent.message);
          } else if (webhookEvent.postback) {
            handlePostback(webhookEvent, webhookEvent.postback);
          }
        });
        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
      } else {
        log("Not page POST")
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
      }
    } 
  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Handles messages events
function handleMessage(webhookEvent, receivedMessage) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;
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
  }
  // Send the response message
  callSendAPI(webhookEvent, response);
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
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
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

async function weatherAgent(userInput) {
  messages.push({
      role: "user",
      content: userInput,
  });

  for (let i = 0; i < 5; i++) {
      const response = await openai.chat.completions.create({
          model: "gpt-4",
          messages: messages,
          functions: functionDefinitions
      });

      const { finish_reason, message } = response.choices[0];
      console.log(message);


      if (finish_reason === "function_call") {
          const functionName = message.function_call.name;
          const functionToCall = availableFunctions[functionName];
          const functionArgs = JSON.parse(message.function_call.arguments);
          const functionArgsArr = Object.values(functionArgs);
          const functionResponse = await functionToCall.apply(null, functionArgsArr);

          messages.push({
              role: "function",
              name: functionName,
              content: `
              The result of the last function was this: ${JSON.stringify(functionResponse)}
              `
          });
      }

      else if (finish_reason === "stop") {
          messages.push(message);
          return message.content;
      }
  }
  return "The maximum number of iterations has been met without a suitable answer. Please try again with a more specific input.";
}