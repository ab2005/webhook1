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

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

functions.http('webhook', async (req, res) => {
  try {
    // initialization
    if (!(await loadConfig())) {
      log("Initializing...");
      await saveConfig();
    }
    if (req.method === 'GET') {
      onGet(req, res);
    } else if (req.method === 'POST') {
      await onPost(req, res);
    }
  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(500).send('Internal Server Error');
  }
  const done = Promise.resolve();
  log("=============== > webhook done: " + done);
});

function onGet(req, res) {
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

function onPost(req, res) {
  console.log(req.body);
  log("============ POST: \n" + JSON.stringify(req.body));
  try {
    let body = req.body;
    // Checks if this is an event from a page subscription
    if (body.object === 'page') {
      // Iterates over each entry - there may be multiple if batched
      body.entry.forEach(function(entry) {
        if (entry.changes) {
          replyToChanges(entry.changes, entry.id);
        } else {
          let messageEvent = (entry.messaging || entry.standby )[0];
          log("Processing message event:" + JSON.stringify(messageEvent));
          // Get the sender PSID
          let sender_psid = messageEvent.sender.id;
          // Check if the event is a message or postback and generate a response
          if (messageEvent.message) {
            onMessage(messageEvent);
          } else if (messageEvent.postback) {
            onPostback(messageEvent);
          }
        }
      });
    } else {
      log(`Not a "page"!: ` +  JSON.stringify(body));
      // Returns a '404 Not Found' if event is not from a page subscription
      res.sendStatus(404);
    }
  } catch(err) {
    console.error(err);
  }
  log("=========== POST done!");
  res.status(200).send('EVENT_RECEIVED');
}

// Handle Messenger message event
function onMessage(messageEvent) {
  if (messageEvent.message.is_echo === true) {
    return;
  }

  // Checks if the message contains text
  if (messageEvent.message.text) {
    onMessageWithText(messageEvent);
  } else if (messageEvent.message.attachments) {
    onMessageWithAttachment(messageEvent)
  }
}

function onMessageWithText(messageEvent) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;

  log("Submit text messasge processing from " + userId + ": " + messageEvent.message.text);

  // Submit messasge processing
  agent(messageEvent)
    .then(gptResponse => {
      if (gptResponse) {
        logJ("Message event processed:", gptResponse);
      }
    })
    .catch(error => {
        console.error(error);
        logJ("Error processing messаge event",  messageEvent);
    });
}

// Submit for processing.
async function agent(messageEvent) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;
  const userInput= messageEvent.message.text;

  try {
    const userConfig = await getUserConfig(pageId, userId);
    const personas = await getPersonas(pageId);

    let personaId = 0;
     // TODO: implement persona id selection

    let persona = personas[personaId];
    if (!persona) {
      console.error("Wrong persona id" + personaId);
      persona = personas[userConfig.personaId]
    }
    logJ("agent persona:", persona);
    userConfig.run_count += 1;
    await saveUserConfig(pageId, userId, userConfig);

    if (persona.type === 'chat') {
      // load recent messages
      const messages = await getPageMessages(pageId, userId);
      return await askChatGpt(userInput, messages, userId, pageId, persona.chat);
    } else if (persona.type === 'assistant') {
      log("askGptAssistant");
      return await askGptAssistant(userInput, userConfig, pageId, userConfig, persona.assistant);
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return "I'm sorry, but an error occurred while processing your request.";
  }
}

async function askChatGpt(userInput, messages, userId, pageId, gptModel) {
  const page = await getPageConfig(pageId);
  const prompt = page.propmt;
  logJ("messages:", messages);
  log(`prompt: ${prompt} `);
  log(`userInput: ${userInput} `);
  log(`gptModel: ${gptModel} `);


  if (prompt) {
    messages[0].content = prompt;
  }

  // Add the user's input as a new message to the array
  messages.push({
    role: "user",
    content: userInput,
  });

  console.time("askChatGpt");
  const response = await openai.chat.completions.create({
    model: gptModel,
    messages: messages
  });
  console.timeEnd("askChatGpt");

  logJ("response:", response);

  // Check the response for the expected structure and return the message content
  if (response.choices && response.choices.length > 0 && response.choices[0].message) {
    messages.push(response.choices[0].message);
    await savePageMessages(pageId, userId, messages);
    const reply = {
      'text' : response.choices[0].message.content
    };
    sendMessengerMessage(userId, page, reply);
    return reply;
  } else {
    // If the response doesn't have the expected structure, throw an error
    logJ('Response has an expected structure:', response);
    messages.pop();
    throw new Error("Invalid response structure");
  }
}

// Sends response messages via GraphQL
function sendMessengerMessage(userId, page, message) {
  console.log(`Sending message to ${userId} on behalf of ${page.name}`);
  request({
    'uri': 'https://graph.facebook.com/v18.0/me/messages',
    'qs': { 'access_token': page.token },
    'method': 'POST',
    'json': {
      'recipient': {
        'id': userId
      },
      'message': message
    }
  }, (err, _res, _body) => {
    if (!err) {
      console.log(`Message sent!`);
    } else {
      console.error(err);
    }
  });
}


// TODO;
function onMessageWithAttachment(messageEvent) {
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


// TODO:
function onPostback(webhookEvent, receivedPostback) {
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


// // Sends response messages via the Send API
// function callSendAPI(webhookEvent, response) {
//   log('callSendAPI...');
//   let senderPsid = webhookEvent.sender.id;
//   let pageID = webhookEvent.recipient.id;

//   // The page access token we have generated in your app settings
//   const pageTokenEntry = pageTokens.find(pt => pt.pageID === pageID);
//   if (!pageTokenEntry) {
//     throw new Error(`PageID ${pageID} not found in pageTokens array.`);
//   }

//   const PAGE_ACCESS_TOKEN = pageTokenEntry.token;
//   const pageName = pageTokenEntry.name;
//   console.log(`Sending message to ${senderPsid} on behalf of ${pageName}`);

//   log(senderPsid +  ", token=" + PAGE_ACCESS_TOKEN);
//   // Construct the message body
//   let requestBody = {
//     'recipient': {
//       'id': senderPsid
//     },
//     'message': response
//   };
//   // Send the HTTP request to the Messenger Platform
//   request({
//     'uri': 'https://graph.facebook.com/v18.0/me/messages',
//     'qs': { 'access_token': PAGE_ACCESS_TOKEN },
//     'method': 'POST',
//     'json': requestBody
//   }, (err, _res, _body) => {
//     if (!err) {
//       console.log('Message sent!');
//     } else {
//       console.error('Unable to send message:' + err);
//     }
//   });
// }



async function processText(text) {
  const annotations = text.annotations;
  const citations = [];

  // Iterate over the annotations and add footnotes
  for (let index = 0; index < annotations.length; index++) {
    const annotation = annotations[i];
    // Replace the text with a footnote
    text.value = text.value.replace(annotation.text, ` [${index}]`);
    // Gather citations based on annotation attributes
    if (annotation.file_citation) {
        const citedFile = await openai.files.retrieve(annotation.file_citation.file_id);
        citations.push(`[${index}] ${annotation.file_citation.quote} from ${citedFile.filename}`);
    } else if (annotation.file_path) {
        const citedFile = await openai.files.retrieve(annotation.file_path.file_id);
        citations.push(`[${index}] Click <here> to download ${citedFile.filename}`);
        // Note: File download functionality not implemented above for brevity
    }  }

  if (citations.length > 0) {
    // Add footnotes to the end of the message before displaying to user
    text.value += '\n' + citations.join('\n');
  }
  log(text.value);
  return text.value;
}

async function processImage(imageFile) {
  const flieId = imageFile.file_id;
  const file = await openai.files.retrieve(imageFile.file_id);
  log(file);
  log(`Click <here> to download ${file.filename}`);
}


async function processMessage(threadId, message, result) {
  try {
    for (let i = 0; i < message.content.length; i++) {
      const content = message.content[i];
      if (content.text) {
        const text = await processText(content.text);
        // TODO: add to resuslt
      } else if (content.image_file) {
        const image = await processImage(content.image_file);
        // TODO: add to result
      } else {
        console.error("Unknown type " + content.type);
      }
    }
  } catch (error) {
      console.error('Error processing the message:', error);
  }
}

async function askGptAssistant(userInput, pageId, userId, config, assistantConfig) {
  logJ("config:", config);
  logJ("assistantConfig:", assistantConfig);
  let assistant;
  let thread;
  let assistantId = config.agentId;
  let assistantThreadId = config.threadId;

  // instantiate
  if (assistantId) {
    try {
      assistant = await openai.beta.assistants.retrieve(assistantId);
      log(`Assistant id: ${assistantId} retrieved.`);
      try {
        thread = await openai.beta.threads.retrieve(threadId);
        log(`Thread id: ${AssistantIThreadId} retrieved.`);
      } catch (err) {
        log(`Thread id ${AssistanThreadId} is not valid.`);
        console.error(err);
        thread = await openai.beta.threads.create();
        log(`Created new thread for ${assistantId}.`);
      }
    } catch (err) {
      log(`Assistand id: ${assistantId} is not valid!`);
      // create a new one
      assistant = await openai.beta.assistants.create({
        name : assistantConfig.name,
        instructions : assistantConfig.instructions,
        model : assistantConfig.model,
      });
      log(`Created new assistant id: ${assistant.id}.`);
      assistantId = assistant.id;
      thread = await openai.beta.threads.create();
      log(`Created new thread id: ${thread.id}.`);
    }
    assistantId = assistant.id;
    assistantThreadId = thread.id;
  }

  const message = await openai.beta.threads.messages.create(assistantThreadId, {role: "user", content: userInput});
  const userMessageId = message.id;

  // ask
  let run = await openai.beta.threads.runs.create(
    assistantThreadId,
    {
      assistant_id: assistantId,
      instructions: "Please address the user's post on your page."
    }
  );

  while (run.status !== 'completed') {
    run = await openai.beta.threads.runs.retrieve(assistantThreadId, run.id);
  }

  // retrieve result
  const messages = await openai.beta.threads.messages.list(assistantThreadId);
  let reply = {};
  for (let i = 0; i < messages.data.length; i++) {
    if (userMessageId === messages.data[i].id) {
      break;
    }
    reply = await processMessage(assistantThreadId, messages.data[i], reply);
  }

  // update config
  config,assistant.id = assistantId;
  config,thread.id = assistantThreadId;
  // TODO await ??
  await saveUserConfig(pageId, userId, config);

  return reply;
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

  agent(message, pageId)
    .then(gptResponse => {
        response = {
            'text': `@[${senderId}]-${gptResponse}`
        };
        // Send the response message
        commentOnPost(pageId, postId, response.text);
    })
    .catch(error => {
        console.error("Error processing agent response:", error);
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
  let keys = await loadJson(`pages/${pageId}/keys`);
   if (!keys) {
    keys = {
      'openai' : process.env.OPENAI_API_KEY,
      'elevenlabs' : 'none'
    };
   }
  return keys;
}

async function getPageMessages(pageId, userId) {
  let messages = await loadJson(`pages/${pageId}/${userId}/messages`);
  if (!messages) {
    messages = [{
      role: "system",
      content: `Act as a personal coach. You are smart and friendly.`
      },
    ];
  }
  return messages;
}

async function savePageMessages(pageId, userId, messages) {
  // trim mesages
  const trimmedMessages = getLastElements(messages, 40);
  await saveJson(`pages/${pageId}/${userId}/messages`, trimmedMessages);
}

function getLastElements(array, n) {
  if (n > array.length) {
      return array;
  }
  return array.slice(-n);
}

async function getPageConfig(pageId) {
  const config = await loadJson(`pages/${pageId}/config`);
  return config;
}

async function getPersonas(pageId) {
  let personas = await loadJson(`pages/${pageId}/personas`);
  if (!personas) {
    personas = [{
      'name' : 'persona A',
      'type' : 'chat',
      'chat' : 'gpt-4'
    }, {
      'name' : 'persona B',
      'type' : 'assistant',
      'assistant' : {
        name: 'New-I Assistant',
        instructions: 'You are an assistant',
        tools: [
          {
            type: 'code_interpreter'
          },
          {
            type: 'retrieval'
          },
          {
            type: 'function'
          }],
        model: "gpt-4-1106-preview"
      }
    }
    ];
    await savePersonas(pageId,personas);
  }
  return personas;
}

async function savePersonas(pageId, personas) {
  await saveJson(`pages/${pageId}/personas`, personas);
}

async function getUserConfig(pageId, userId) {
  let config = await loadJson(`pages/${pageId}/${userId}/config`);
  if (!config) {
    config = {
      'agentId' : '0',
      'threadId' : '0',
      'personaId' : '0',
      'run_count' : 0
    };
    await saveUserConfig(pageId, userId, config);
  }
  return config;
}

async function saveUserConfig(pageId, userId, config) {
  await saveJson(`pages/${pageId}/${userId}/config`, config);
}

async function loadConfig() {
  keys = await loadJson("keys")
  config = await loadJson("config");
  if (!keys || !config) {
    console.error("Main Config is not not iitialized!");
    return false;
  }
  return true;
}

async function saveConfig() {
  const keys = {
    'openai' : process.env.OPENAI_API_KEY
  };
  await saveJson("keys", keys);
  await saveJson("config", pageTokens);
  for (let i = 0; i < pageTokens.length; i++) {
    const entry = pageTokens[i];
    await saveJson(`pages/${entry.pageID}/config`, entry);
    await saveJson(`pages/${entry.pageID}/token`, entry.token);
    await saveJson(`pages/${entry.pageID}/keys`, keys);
  }
}


// ===== Logging =====
function log(msg, json) {
  console.log("ab->" + msg);
}

function logJ(note, msg) {
  log(note + JSON.stringify(msg, null, 2));
}

function wait(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}


// function getPageToken(pageID) {
//   const pageTokenEntry = pageTokens.find(pt => pt.pageID === pageID);
//   if (!pageTokenEntry) {
//     throw new Error(`PageID ${pageID} not found in pageTokens array.`);
//   }
//   return pageTokenEntry.token;
// }


// import fs from "fs";
// import OpenAI from "openai";

// const openai = new OpenAI();

// async function main() {
//   const response = await openai.files.content("file-abc123");

//   // Extract the binary data from the Response object
//   const image_data = await response.arrayBuffer();

//   // Convert the binary data to a Buffer
//   const image_data_buffer = Buffer.from(image_data);

//   // Save the image to a specific location
//   fs.writeFileSync("./my-image.png", image_data_buffer);
// }

// main();
