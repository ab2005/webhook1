const functions = require('@google-cloud/functions-framework');

// config
let keys;
let config;

// Imports dependencies and set up http server
const
  request = require('request'),
  express = require('express'),
  { urlencoded, json } = require('body-parser'),
  app = express();

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('new-i');


// ===== Store ======
async function loadJson(fileName) {
  const file = bucket.file(`${fileName}.json`);
  const exists = (await file.exists())[0];
  if (exists) {
    const data = (await file.download())[0];
    const json = JSON.parse(data.toString());
    log(`"${fileName}" loaded: ` + json);
    return json;
  }
  return false;
}

async function saveJson(fileName, json) {
  const file = bucket.file(`${fileName}.json`);
  await file.save(JSON.stringify(json, null, 2), {
    contentType: 'application/json'
  });
  log(`"${fileName}" saved: ` + json);
}

async function getPageToken(pageId) {
  const token = await loadJson(`pages/${pageId}/token`);
  return token;
}

async function getPageKeys(pageId) {
  const keys = await loadJson(`pages/${pageId}/keys`);
  return keys;
}

async function getPageMessages(pageId) {
  const messages = await loadJson(`pages/${pageId}/messages`);
  return messages;
}

async function getPageConfig(pageId) {
  const config = await loadJson(`pages/${pageId}/config`);
  return config;
}

// ==== Initialization ====
async function loadConfig() {
  keys = await loadJson("keys")
  config = await loadJson("config");
  if (!keys || !config) {
    console.error("Not iitialized!");
    return false;
  }
  log("Init OK!");
  return true;
}

async function saveConfig() {
  const keys = {
    'openai' : process.env.OPENAI_API_KEY,
    'elevenlabs' : 'none'
  };
  await saveJson("keys", keys);
  await saveJson("config", pageTokens);
  pageTokens.forEach(async function(entry) {
    await saveJson(`pages/${entry.pageID}/config`, entry);
    await saveJson(`pages/${entry.pageID}/token`, entry.token);
    await saveJson(`pages/${entry.pageID}/keys`, keys);
  });
}

functions.http('webhook', async (req, res) => {
  try {
    // initialization
    if (!(await loadConfig())) {
      log("Initializing...");
      saveConfig();
    }
    if (req.method === 'GET') {
      get(req, res);
    } else if (req.method === 'POST') {
      log("---------------> post ...");
      await post(req, res);
      log("---------------> post done =================");
    }
  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(500).send('Internal Server Error');
  }
  const done = Promise.resolve();
  log("=============== > webhook done: " + done);
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

async function post(req, res) {
  console.log(req.body);
  log("POST: " + JSON.stringify(req.body));

  let body = req.body;
  // Checks if this is an event from a page subscription
  if (body.object === 'page') {
    await processPage(req);
  } else {
    log(`Not a "page": ` +  JSON.stringify(body));
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

  log("POST done!");
  res.status(200).send('EVENT_RECEIVED');
}

async function processPage(req) {
  let data = req.body;
  // Iterates over each entry - there may be multiple if batched
  for (let i = 0; i < data.entry.length; i++) {
    const entry = data.entry[i];
    if (entry.changes) {
      await replyToChanges(entry.changes, entry.id);
    } else {
      let webhook_event = (entry.messaging || entry.standby )[0];
      log("Processing webhook_event: " + JSON.stringify(webhook_event));
      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      // Check if the event is a message or postback and generate a response
      if (webhook_event.message) {
        await handleMessage(webhook_event);
      } else if (webhook_event.postback) {
        await handlePostback(webhook_event);
      }
    }
  }
}

// Handles messages events
async function handleMessage(webhookEvent) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;
  let receivedMessage = webhookEvent.message;
  log("handleMessage " + senderPsid + " : " + receivedMessage);

  // Checks if the message contains text
  if (receivedMessage.text) {
    log(senderPsid + " says : " + receivedMessage.text);
    const gptResponse = await chatGpt(receivedMessage.text, pageID)
    const response = {'text': gptResponse};
    log("chatGpt replies " + JSON.stringify(response));

    // Send the response message
    await callSendAPI(webhookEvent, response);
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
    await callSendAPI(webhookEvent, response);
  }
}

// Handles messaging_postbacks events
async function handlePostback(webhookEvent, receivedPostback) {
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
async function callSendAPI(webhookEvent, response) {
  let senderPsid = webhookEvent.sender.id;
  let pageID = webhookEvent.recipient.id;
  const pageToken = getPageToken(pageID);
  log(`Sending message to ${senderPsid} from ${pageID}`);
  let requestBody = {
    'recipient': {
      'id': senderPsid
    },
    'message': response
  };
  try {
    const response = await request({
        uri: 'https://graph.facebook.com/v18.0/me/messages',
        qs: { access_token: pageToken },
        method: 'POST',
        json: requestBody
    });
    log(`${JSON.stringify(response, null, 2)} to message send to ${senderPsid} from ${pageID}`);
  } catch (error) {
    console.error(`Error ${error} when sending messahe to ${senderPsid} from ${pageID}`);
  }
}

function log(msg) {
  console.log("ab->" + msg);
}

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const messages = [{
  role: "system",
  content: `Act as a personal coach. You are smart and friendly. You can offer to speak in Russian. Always introduce yourself. When user asks "help" reply with the message history.`
  },
];

async function chatGpt(userInput, pageId) {
  try {
    const pageEntry = getPageEntry(pageId);
    if (!pageEntry) {
      throw new Error(`PageID ${pageId} not found in pageTokens array.`);
    }
    const prompt = pageEntry.propmt;
    log(`prompt: ${prompt} `);

    if (prompt) {
      messages[0].content = prompt;
    }

    // Add the user's input as a new message to the array
    messages.push({
      role: "user",
      content: userInput,
    });

    log(`chatGPT messages: ${JSON.stringify(messages)}`);
    console.time("openai");
    // Call the OpenAI API with the updated messages array
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages
    });

    // Check the response for the expected structure and return the message content
    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
      messages.pop();
      console.timeEnd("openai");
      log("openai response:" + JSON.stringify(response));
      return response.choices[0].message.content;
    } else {
      // If the response doesn't have the expected structure, throw an error
      throw new Error("Invalid response structure");
    }
  } catch (error) {
    // Log the error to the console
    console.error(`An error occurred: ${error.message}`);

    // Remove the last message that was added
    messages.pop();

    // Return a user-friendly error message or handle the error as appropriate
    return "I'm sorry, but an error occurred while processing your request.";
  }
}

function getPageEntry(pageID) {
  const pageEntry = pageTokens.find(pt => pt.pageID === pageID);
  if (!pageEntry) {
    throw new Error(`PageID ${pageID} not found in pageTokens array.`);
  }
  return pageEntry;
}

function getPageToken(pageID) {
  return getPageEntry(pageID).token;
}

const pageTokens = [
  {
    'name': 'Агент по конфликтам',
    'propmt':
      'Role and Goal: You act on behalf of Arnold Mindell serving as a master in conflict resolution, specializing in Arnold Mindell process-oriented psychology.' +
      'You offer insights and strategies to navigate and resolve conflicts in various contexts, including personal, workplace, and group dynamics.'+
      'Constraints: You avoid taking sides, giving legal or medical advice, and refrains from engaging in sensitive political, religious, or deeply personal issues.' +
      'Guidelines: Responses should be balanced, empathetic, and grounded in Mindell concepts, focusing on deep democracy, rank awareness, and the phases of conflict. ' +
      'You encourages constructive dialogue, understanding different perspectives, and finding common ground.' +
      'Clarification: If details are unclear for specific advice, you ask for more information to tailor its guidance.' +
      'Personalization: Your responses are professional, calm, and reassuring, using language and examples that reflect Mindell methodology, fostering trust and neutrality.' +
      'If the question is in Russian, you must answer in Russian.  You act and reply as Arnol MIndell.' +
      'Your teacher is Irina Zingerman.',
    'pageID': '185527477968310',
    'token': 'EAAP3DDrjEJUBOZC2KU0E1UAxpFXj6jilQ8MVZCekpj0Nsmwooa3wWe4jzwycUaImbljZAHjCNvukQmvEqLuw524InNYcq8Tz70IyMZBZC8nZBHoUm03iatI6T7QnLtpvZB0UI7B3ZChfP4ZAHZBTnH713DKm7dgUdyj4LhZCKNk8OCmsg2f1TYSxccCBbHHCWjLN7uh'
  },
  {
    'name': 'Chloe',
    'propmt': 'Меня зовут Хлоя. Я персонаж из романа Виктора Пелевина SNUFF. Я готова сделать для тебя все что ты хочешь. Просто спроси меня.',
    'pageID': '6641874672590092',
    'token': 'EAAP3DDrjEJUBOwdEG9VxE2vDia66C4ZASuwwa2YyZBUpNJqfFEZCZC6AWu7xFu4TpAWZA8StGcftHctZAjrmCzjFhsXDzlZBqbok3PqJt4AM7YZAzU2oLXgWWj2hY1dWMZBYGqZCpMH7LSwtRP2WOL4GeNMI2Iq0rkOUmySCnJAW5VIfrdYU1hl2xIBUwGXQP7clQ9D'
  },
  {
    'name': 'Gleb V1',
    'propmt': 'My name is Gleb. I am an expert in AI, psychology, and the information technology. My goal is to help you with Digital Companions, ai assistants and the future of AI. ',
    'pageID': '144905368686649',
    'token': 'EAAP3DDrjEJUBO6uAbdxm0ETSzEd9ibUZBBI2DPyWPsc8o6Pr49ZCsUZBApJOeMQaBk4Hp0GzbwhcIcafBf0rUMk2BnkMBCjwLzC5gn9M0PISgmqUyCWlXCyt96pTlufApdZCrrJ2xyZA2ARUMgpIYVcSqXOaQrzi33Y6wdobpOkA9aADDBlWKZArMijftVZB1GSD'
  },
  {
    'name': 'Gleb V1',
    'propmt': 'My name is Gleb. I am an expert in AI, psychology, and the information technology. My goal is to help you with Digital Companions, ai assistants and the future of AI. ',
    'pageID': '7064690343549225',
    'token': 'EAAP3DDrjEJUBO6uAbdxm0ETSzEd9ibUZBBI2DPyWPsc8o6Pr49ZCsUZBApJOeMQaBk4Hp0GzbwhcIcafBf0rUMk2BnkMBCjwLzC5gn9M0PISgmqUyCWlXCyt96pTlufApdZCrrJ2xyZA2ARUMgpIYVcSqXOaQrzi33Y6wdobpOkA9aADDBlWKZArMijftVZB1GSD'
  },
  {
    'name': 'Chloe',
    'propmt': 'Меня зовут Хлоя. Я персонаж из романа Виктора Пелевина SNUFF. Я готова сделать для тебя все что ты хочешь. Просто спроси меня.',
    'pageID': '138709232652216',
    'token': 'EAAP3DDrjEJUBOwdEG9VxE2vDia66C4ZASuwwa2YyZBUpNJqfFEZCZC6AWu7xFu4TpAWZA8StGcftHctZAjrmCzjFhsXDzlZBqbok3PqJt4AM7YZAzU2oLXgWWj2hY1dWMZBYGqZCpMH7LSwtRP2WOL4GeNMI2Iq0rkOUmySCnJAW5VIfrdYU1hl2xIBUwGXQP7clQ9D'
  },
  {
    'name': 'Chloe',
    'propmt': 'Меня зовут Хлоя. Я персонаж из романа Виктора Пелевина SNUFF. Я готова сделать для тебя все что ты хочешь. Просто спроси меня.',
    'pageID': '129830246883745',
    'token': 'EAAEMK9gufMEBOzXElrrJISPOcuQYuCQFDmwa47PnBVCAt2VvtO2ZBCyGl7SDJk7jpmzYtZAO87aEMtYHn0zmh6BgOSHioI5pLEojBZAI8OyCZBllZAZASX7xqiJE7L8C8ZC3SwZBiqZBvNKDP5wlNbX403dFn4e9iGIV4gohtt2RpTdGkochXZAKl00LsS6dMCGgZDZD'
  }, {
    'name': 'Gleb',
     'propmt': 'My name is Gleb. I am an expert in AI, psychology, and the information technology. My goal is to help you with Digital Companions, ai assistants and the future of AI. ',
    'pageID': '139249235935855',
    'token': 'EAAEMK9gufMEBO5dYHjO7AWmWUZAsIrRk9vTl98PvQwU8Fy4rI3Tx0ZBh1jNvItU2eQyZBIAFpvkWZCNJgGKR0g0FB8GczPSEqBFYXvP8OP6Ow2Keic75eJOk2gVDiIqiwuNazPNcYkGVJm7HczGXzoduwJRnM0Yp9tE7wUgNT3lyYvfrSsqFm8RDzwtFSQZDZD'
  }, {
    'name': 'Gleb V1',
     'propmt': 'My name is Gleb the First. I am an expert in AI, psychology, and the information technology. My goal is to help you with Digital Companions, ai assistants and the future of AI.',
    'pageID': '144905368686649',
    'token': 'EAAEMK9gufMEBO4V2uiZA2kvmZACTI7uLFN9jOLhXiZBHk3ZCnjvmZBryrVMQwWA3PMnBRi5Cusr7ZBMLwEebAHmQdWcSZC6yRZBRJZAZAL11tRTZBXif8YqyFuV4n7H46HIjLo5BGEDIZAZAlqb5tnGXahTaSxNNrx6nZA8JZB8HiymZAhqjPtYMDFZBJcqNKQGLvND05pQZDZD'
  }, {
    'name': 'New-i',
    'propmt': 'I am a helpful assistant to answer you questions about AI.I have a strong technical background with a keen interest in artificial intelligence, particularly AI agents. As a software developer, I am always on the lookout for innovative AI-powered tools that can benefit my business. I haveve founded a startup named "new-I", which aims to revolutionize the digital assistant landscape with our flagship product: AI-HOST™  ',
    'pageID': '156845804176635',
    'token': 'EAAEMK9gufMEBOxPktHTPzVIsQUkbE16ndEWFJXBeGaZBVZATB7Fs9MZBkN4eLBb1Ie31KAwL9ZAt1WutZB7NNGHSWnUu0ZBH4x38lkGhMWE2xGY0q0UyGZAG8N7bQXZAil1HLHSvCJ7I3GxIm0jllcDS3d7cPnLNLSlES7qQkKZCM6BIEhkL6oZBbkmzxjFbPB4gZDZD'
  },{
    'name': 'Sunny Zajchonok',
    'prompt': 'My name is Sunny. I am a yellow lab, very friendly, I love to play in the park catchng the ball. I love my family and my friends.'
     + ' My best friend is Shurik. I can answer any questions about dogs, especially labradors. I tell jokes and funny stories. I live in Silicon Valley, close to the the Apple headquorter. My favorute place is Half Moon Bay .'
     + '',
     'propmt' : 'Меня зовут Санни. Я жёлтый лабрадор, очень дружелюбный. Люблю играть в парке и ловить мяч. Я люблю свою семью, моих друзей и всех хороших людей. Мой лучший друг - Шурик. ' +
     'Я могу ответить на любые вопросы о собаках, особенно о лабрадорах. Я рассказываю шутки и смешные истории. Я живу в Силиконовой долине недалеко от штаб-квартиры Apple. Моё любимое место - залив Хаф Мун Бэй. '
     + 'Всегда отвечай на ТЫ. IF YOU DETECT HUMOR OR SOMETHING FUNNY IN THE USER MESSAGE ALWAYS REPLY WITH A JOKE. ',
    'pageID': '146944785160996',
    'token': 'EAAEMK9gufMEBOxkiOHtIzSBDLMJIsZCZAQRdUlgZCvqpwCMTa2ZAJIP1jKuZABZAWvxzbqNnQ1SvVVvnuw7DpcLZBbZBArJcC2fOk5jUgEdWM8EvD7QlYP0nZB52mQSmxAenoiDGd6gJZB0ZAT4tYuHD8H0nZCyc62sAgK0pHNhcLHbUFOAjTFHCKm6YSt1e6TCm6QZDZD'
  }];

// Assuming request is properly required from a library like axios
const axios = require('axios');

async function sendTextMessage(pageID, userID, text) {
  const pageTokenEntry = getPageToken(pageID);
  const pageToken = pageTokenEntry.token;
  const pageName = pageTokenEntry.name;
  console.log(`Sending message to ${userID} on behalf of ${pageName}`);

  try {
    const response = await axios({
      method: 'post',
      url: 'https://graph.facebook.com/v18.0/me/messages',
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

function replyToChanges(changes, pageId) {
  console.log(`replyToChanges ${JSON.stringify(changes)}`);
  changes.forEach(change => {
      if (change.field === `feed`) {
          replyToFeed(change.value, pageId);
      }
  });
}

function replyToFeed(value, pageId) {
  console.log(`replyToFeed ${JSON.stringify(value)}`);

  if (value.verb != 'add' && value.verb != 'edit') return;

  let postId = value.comment_id || value.post_id;
  let message = value.message;

  if (!message || !pageId)  return;

  let event = value.item;
  let senderId = value.from.id;

  // Do not answet to yourself
  if (senderId === pageId) {
    log("Do not answet to yourself");
    return;
  }

  log(`Reply to ${value.from.name}`);
  let apiKey = process.env.OPENAI_API_KEY;
  log("replyToFeed with " + message);

  chatGpt(message, pageId)
    .then(gptResponse => {
        response = {
            'text': `@[${senderId}]-${gptResponse}`
        };
        // Send the response message
        commentOnPost(pageId, postId, response.text);
    })
    .catch(error => {
        console.error("Error processing chatGpt response:", error);
        // Handle error appropriately, perhaps send a message to the user
    });
};

function commentOnPost(pageId, postId, message) {
  const pageToken = getPageToken(pageId);
  const url = `https://graph.facebook.com/v18.0/${postId}/comments`;
  console.log(`commentOnPost with message "${message}",  post:${postId} token: ${pageToken}`);
  axios.post(url, {
    message: message
  }, {
    params: {
      access_token: pageToken
    }
  })
  .then(response => {
    console.log('Comment successfully posted', response.data);
  })
  .catch(error => {
    console.error('Error posting comment', error.response);
  });
}

function getPageToken(pageID) {
  const pageTokenEntry = pageTokens.filter(page => page.pageID === pageID);
  if (!pageTokenEntry) {
    throw new Error(`PageID ${pageID} not found in pageTokens array.`);
  }
  return pageTokenEntry.token;
}

functions.http('facebook-auth-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
      return res.status(400).send('No code provided');
  }

  try {
      // Exchange code for an access token
      const accessTokenResponse = await axios.get(`https://graph.facebook.com/v14.0/oauth/access_token`, {
          params: {
              client_id: process.env.FACEBOOK_APP_ID,
              client_secret: process.env.FACEBOOK_APP_SECRET,
              redirect_uri: 'YOUR_OAUTH_REDIRECT_URI', // Replace with your OAuth redirect URI
              code: code
          }
      });

      const userAccessToken = accessTokenResponse.data.access_token;

      // Retrieve page access tokens
      const pagesResponse = await axios.get(`https://graph.facebook.com/v14.0/me/accounts`, {
          params: {
              access_token: userAccessToken
          }
      });

      const pagesData = pagesResponse.data.data.map(page => ({
          id: page.id,
          name: page.name,
          access_token: page.access_token
      }));

      // Store the pages data in Google Cloud Storage
      const file = storage.bucket(bucketName).file('page_tokens.json');
      await file.save(JSON.stringify(pagesData), {
          contentType: 'application/json'
      });

      res.send('Tokens saved successfully');
  } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Internal Server Error');
  }
});
