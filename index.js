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

var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===== Telegram =====
const { Telegraf } = require('telegraf');

// ===== Facebook login callback =====
async function initFacebookUser(code) {
  // Exchange code for short-lived token
  const appId = "892971785510758";
  const redirectUrl = 'https://us-west1-newi-1694530739098.cloudfunctions.net/webhook-2';
  const appSecret = "c536677c20812c3077724dd57080906f";
  const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
    params: {
      client_id: appId,
      redirect_uri: redirectUrl,
      client_secret: appSecret,
      code: code,
    }
  });
  logJ('Successfully got short--lived tokens:', response.data);
  const shortToken = response.data.access_token;
  const expires = response.data.expires_in;

  // Exchange short-lived token for a long-lived token
  const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      }
    });
  logJ('Received long-lived token:', longTokenResponse.data);
  const longLivedToken = longTokenResponse.data.access_token;

  // Get the user ID
  const userIdResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
    params: {
      fields: 'id',
      access_token: longLivedToken,
    }
  });
  const userId = userIdResponse.data.id;
  log('User ID:' + userId);

  // Store user ID and access token
  const config = {
    'userId': userId,
    'accessToken': longLivedToken,
  };
  await saveJson(`users/${userId}/config`, config);

  // Store user pages tokens and names
  const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
    params: {
      access_token: longLivedToken,
    }
  });
  const pages = pagesResponse.data.data;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    console.log('Page ID:', page.id);
    console.log('Page Name:', page.name);
    console.log('Page Access Token:', page.access_token);
    const pageConfig = {
      'pageID': page.id,
      'name' : page.name,
      'token': page.access_token,
    };
    log(`Saving page pages/${page.id}/config...`);
    await saveJson(`pages/${page.id}/config`, pageConfig);

    // Subscribe
    const subscriptions = 'email,feed,group_feed,inbox_labels,mention,message_reactions,messages,';
    log("url:" + `https://graph.facebook.com/v18.0/${page.id}/subscribed_apps`);
    log("subscriptions:" + subscriptions);
    const subscribedResponse = await axios.post(`https://graph.facebook.com/v18.0/${page.id}/subscribed_apps`, null, {
      params: {
        subscribed_fields: subscriptions,
        access_token: page.access_token,
      }
    });
    const subscriptionReply = JSON.stringify(subscribedResponse.data);
    log(`Subscribe responce: ${subscriptionReply}`);
  }
}

async function onPostTelegram(req, res, assistantId, token) {
  try {
    log(`Processing telegram:` +  JSON.stringify(req.body));
    const bot = new Telegraf(token);

    bot.on('text', async (ctx) => {
      const userInput = ctx.message.text;
      // get openai key
      if (!openai) {
        console.error(`No key found for ${pageId}, try to get one...`);
        try {
          const ai = new OpenAI({
            apiKey: userInput
          });
          myAssistants = await ai.beta.assistants.list({
            order: "desc",
            limit: "100",
          });
          for (let i = 0; i < myAssistants.body.data.length; i++) {
            const assistant = myAssistants.body.data[i];
            log(JSON.stringify(assistant));
          }
          openai = ai;
        } catch (err) {
          console.error(err);
          log(`Invalid key: ${userInput}`);
          ctx.reply(`Invalid key: ${userInput}`);
          return;
        }
      }

      const user = ctx.update.message.from;
      const userName = user.username;
      const botName = bot.botInfo.username;
      const configName = `telegram/${botName}/${userName}/config.json`;
      // get thread for bot + user
      let config = await loadJson(configName);
      if (!config) {
        log("creating new config:" + configName);
        const thread = await openai.beta.threads.create();
        config = {
          'threadId' : thread.id,
        };
        await saveJson(configName, config);
      }

      const thread = await openai.beta.threads.retrieve(config.threadId);

      const gptResponse =  await askAssistant(assistantId, config.threadId, userInput);
      for (let i = 0; i < gptResponse.length; i++) {
        const response = gptResponse[i];
        if (response.type === 'text') {
          ctx.reply(response.text.value);
        } else {
          ctx.reply(JSON.stringify(response));
        }
      }
    });

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
}

functions.http('webhook', async (req, res) => {
  try {
    // initialization
    if (!(await loadConfig())) {
      log("Initializing...");
      await saveConfig();
    }
    if (req.method === 'GET') {
      log('GET url:'+ req.url);
      log('GET path:'+ req.path);
      log('GET query:'+ JSON.stringify(req.query));
      if (req.query.code) {
        await initFacebookUser(req.query.code);
        res.status(200).send('OK');
        return;
      } else {
        onGet(req, res);
      }
  } else if (req.method === 'POST') {
      log('POST url:'+ req.url);
      log('POST path:'+ req.path);
      log('POST path:'+ JSON.stringify(req.query));


      if (req.query.t_a || req.query.t_t) {
        await onPostTelegram(req, res, req.query.t_a, req.query.t_t);
        return; // skip other handlers
      }

      if (req.body.object === 'page') {
        await onPost(req, res);
      } else {
        log("Unsupported object: " + JSON.stringify(req.body));
        res.status(400).send('Bad Request');
      }
    }
  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(500).send('Internal Server Error');
  }
  const done = Promise.resolve();
  log("=============== > webhook done:" + done);
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
  logJ("============ POST:", req.body);
  try {
    let body = req.body;
    // Checks if this is an event from a page subscription
    if (body.object === 'page') {
      // Iterates over each entry - there may be multiple if batched
      body.entry.forEach(function(entry) {
        if (entry.changes) {
          if (!openai) {
            // TODO: ask for key
            console.error("Key not found!");
          } else {
            replyToChanges(entry.changes, entry.id);
          }
        } else {
          let messageEvent = (entry.messaging || entry.standby )[0];
//          log("Processing message event:" + JSON.stringify(messageEvent));
          // Check if the event is a message or postback and generate a response
          if (messageEvent.message) {
            onMessage(messageEvent);
          } else if (messageEvent.postback) {
            onPostback(messageEvent);
          }
        }
      });
    } else {
      log(`Unknown object: ` +  JSON.stringify(body));
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
  submitAgentReplyToMessage(messageEvent)
    .catch(error => {
        console.error(error);
        logJ("Error processing messаge event",  messageEvent);
    });
}

/*
onPost
    onMessage
        onMessageWithText
            submitAgentReplyToMessage
                askChatGpt
                    sendMessengerMessage
*/
// Submit for processing reply for user message
async function submitAgentReplyToMessage(messageEvent) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;
  let userInput= messageEvent.message.text;

  log("user input:>>" + userInput);

  try {
    const userConfig = await getUserConfig(pageId, userId);
    const personas = await getPersonas(pageId);
    let personaId = userConfig.personaId;
    if (!personaId) {
      personaId = 1;
    }
    const input = getAgentAndInput(userInput);
    if (input) {
      personaId = input.personaId;
      userInput = input.text;
      logJ("input:", input);
    }

    let persona = personas[personaId];
    if (!persona) {
      console.error("Wrong persona id: " + personaId);
      persona = personas[userConfig.personaId]
    }
    logJ("agent persona:", persona);
    userConfig.run_count += 1;
    userConfig.personaId = personaId;
    await saveUserConfig(pageId, userId, userConfig);

    const page = await getPageConfig(pageId);

    if (!openai) {
      console.error(`No key found for ${pageId}, try to get one...`);
      try {
        const ai = new OpenAI({
          apiKey: userInput
        });
        myAssistants = await ai.beta.assistants.list({
          order: "desc",
          limit: "100",
        });
        for (let i = 0; i < myAssistants.body.data.length; i++) {
          const assistant = myAssistants.body.data[i];
          log(JSON.stringify(assistant));
        }
        // TODO: save personas
        page.key = userInput;
        await savePageConfig(pageId, page);
        openai = ai;
      } catch (err) {
        console.error(err);
        log(`Invalid key: ${userInput}`);
        sendMessengerMessage(userId, page, `Invalid key: ${userInput}`);
        return;
      }
    }

    if (persona.type === 'chat') {
      // load recent messages
      const messages = await getPageMessages(pageId, userId);
      log("user input:" + userInput);
      const gptResponse = await askChatGpt(userInput, messages, userId, pageId, page, persona.chat);
      logJ("Message event processed by chat:", gptResponse);
      return gptResponse;
    } else if (persona.type === 'assistant') {
      log("askGptAssistant");
      logJ("userConfig:", userConfig);
      if (!userConfig.threadId || userConfig.threadId === '0') {
        // TODO create a new thread
        const thread = await openai.beta.threads.create();
        userConfig.threadId = thread.id;
        // save config
        log(`create new assistant thread ${config.threadId} for user ${userId}`);
        await saveUserConfig(pageId, userId, userConfig);
        logJ("userConfig:", userConfig);
      }
      const gptResponse =  await askAssistant(page.assistantId, userConfig.threadId, userInput);
      let hasImages;
      let hasFiles;
      let hasText;
      for (let i = 0; i < gptResponse.length; i++) {
          const reply = gptResponse[i];
          if (reply.type === 'text') {
            hasText = true;
            // TODO reply with text message
            const message = {
              'text' : reply.text.value
            };
            logJ("Message event processed by assistant:", message);
            sendMessengerMessage(userId, page, message);
          } else if (reply.type === 'image') {
            hasImage = true;
          } else if (reply.type === 'file') {
            hasFile = true;
          }
      }
      return `Assistant sent ${gptResponse.length} message(s) to user ${userId}.`;

    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return "I'm sorry, but an error occurred while processing your request.";
  }
}

function getAgentAndInput(inputString) {
  // Check if the string starts with '/'
  if (inputString.startsWith('/')) {
      // Use a regular expression to find the first sequence of digits and the rest of the string
      const matches = inputString.match(/\/(\d+)\s*(.*)/);

      // If a match is found, parse the first group (digits) as an integer and return it along with the rest of the string
      if (matches && matches[1]) {
          return {
              personaId: parseInt(matches[1], 10),
              text: matches[2] || ''
          };
      }
  }

  // Return null or appropriate value if the input does not start with '/' or no number is found
  return null;
}

async function askChatGpt(userInput, messages, userId, pageId, page, gptModel) {
  const prompt = page.propmt;
  logJ("messages:", messages);
  logJ("page:", page);
  log(`prompt: ${prompt} `);
  log(`userInput: ${userInput} `);
  log(`gptModel: ${gptModel} `);


  if (prompt) {
    messages[0].role = 'system';
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
  console.log(`Sending message "${message}" to ${userId} on behalf of ${page.name}`);
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

async function createAssistantWithThread(assistantId, assistantThreadId) {
  let assistant;
  let thread;

  try {
    assistant = await openai.beta.assistants.retrieve(assistantId);
    log(`Assistant id: ${assistantId} retrieved.`);
    try {
      // Corrected the variable name to assistantThreadId
      thread = await openai.beta.threads.retrieve(assistantThreadId);
      log(`Thread id: ${assistantThreadId} retrieved.`);
    } catch (err) {
      logJ("error:", err);
      log(`Thread id ${assistantThreadId} is not valid.`);
      console.error(err);
      thread = await openai.beta.threads.create();
      log(`Created new thread for ${assistantId}.`);
    }
  } catch (err) {
    log(`Assistant id: ${assistantId} is not valid!`); // Corrected typo in log message
    // create a new one with error handling
    try {
      assistant = await openai.beta.assistants.create({
        name: assistantConfig.name,
        instructions: page.propmt,
        tools: [{ type: "code_interpreter" },  { type: "retrieval" }],
        model: "gpt-4-1106-preview"
      });
      logJ(`Created new assistant:`,assistant);
      thread = await openai.beta.threads.create();
      log(`Created new thread id: ${thread.id}.`);
    } catch (createErr) {
      logJ("error:", createErr);
      console.error(createErr); // Handling errors during assistant creation
      return; // Exit the function if unable to create an assistant
    }
  }

  assistantId = assistant.id;
  assistantThreadId = thread.id;
  return {
    'assistantId': assistant.id,
    'assistantThreadId': thread.id
  };
}

// Main function that user input
async function askAssistant(assistantId, threadId, userInput) {
  if (!assistantId) {
    logJ("Error: Assistant ID is missing.");
    return;
  }
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: userInput,
  });

  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  let runStatus = await openai.beta.threads.runs.retrieve(
    threadId,
    run.id
  );

  // Polling mechanism to see if runStatus is completed
  // This should be made more robust.
  while (runStatus.status !== "completed") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }

  // Get the last assistant message from the messages array
  const messages = await openai.beta.threads.messages.list(threadId);

  // Find the last message for the current run
  const lastMessageForRun = messages.data
    .filter(
      (message) => message.run_id === run.id && message.role === "assistant"
    )
    .pop();

  // If an assistant message is found, console.log() it
  if (lastMessageForRun) {
    console.log(JSON.stringify(lastMessageForRun.content));
  }
  return lastMessageForRun.content;
}

// async function askGptAssistant(userInput, userId, config, pageId, page, assistantConfig) {
//   logJ("config:", config);
//   logJ("assistantConfig:", assistantConfig);
//   const res = createAssistantWithThread(page.agentId , config.threadId);
//   const assistant = res.assistant;
//   const assistantThreadId = res.thread.id;

//   // Additional logic for handling user input, etc., would go here
//   const message = await openai.beta.threads.messages.create(assistantThreadId, {role: "user", content: userInput});
//   const userMessageId = message.id;

//   // ask
//   let run = await openai.beta.threads.runs.create(
//     assistantThreadId,
//     {
//       assistant_id: assistantId,
//       instructions: page.propmt
//     }
//   );

//   while (run.status !== 'completed') {
//     run = await openai.beta.threads.runs.retrieve(assistantThreadId, run.id);
//   }

//   // get gpt results
//   const messages = await openai.beta.threads.messages.list(assistantThreadId);
//   for (let i = 0; i < messages.data.length; i++) {
//     if (userMessageId === messages.data[i].id) {
//       // quit processsing
//       break;
//     }
//     reply = await sendAssistantReplyMessage(assistantThreadId, messages.data[i], userId, page);
//   }

//   // update user config
//   config.threadId = assistantThreadId;
//   // TODO await ??
//   logJ("save config:", config);
//   await saveUserConfig(pageId, userId, config);

//   // update page config
//   page.agentId = assistantId;
//   logJ("save page config:", page);
//   await saveJson(`pages/${pageId}/config`, page);
//   return reply;
// }

// async function sendAssistantReplyMessage(threadId, message, userId, page) {
//   log("sendAssistantReplyMessage...");
//   try {
//     for (let i = 0; i < message.content.length; i++) {
//       const content = message.content[i];
//       if (content.text) {
//         const text = await processText(content.text);
//         const reply = {
//           'text' : text
//         };
//         sendMessengerMessage(userId, page, reply);
//       } else if (content.image_file) {
//         const image = await processImage(content.image_file);
//         // TODO: send image
//       } else {
//         console.error("Unknown type " + content.type);
//       }
//     }
//   } catch (error) {
//       console.error(error);
//   }
//   log("sendAssistantReplyMessage done.");
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



// TODO;
function onMessageWithAttachment(messageEvent) {
    // Get the URL of the message attachment
    let attachmentUrl = messageEvent.message.attachments[0].payload.url;

    const attachments = messageEvent.message.attachments;

    for (let i = 0; i < attachments.length; i++) {
      const attachmenet = attachments[i];
      try {
        // Get the URL of the message attachment
        const attachmentUrl = attachment.payload.url;
        console.log("attachmentUrl:", attachmentUrl);
        if (attachment.type === 'audio') {
          // Fetch the attachment as a stream and create the transcription
          https.get(attachmentUrl, async (response) => {
              if (response.statusCode === 200) {
                  const transcription = await openai.audio.transcriptions.create({
                      file: response,
                      model: "whisper-1",
                  });
                  console.log(transcription.text);
                  // TODO: Handle the transcription as needed
              } else {
                  console.error(`Request Failed. Status Code: ${response.statusCode}`);
              }
          }).on('error', (e) => {
              console.error(`Error making HTTP request: ${e.message}`);
          });
        }
      } catch (error) {
          console.error('Error:', error.message);
      }

    }

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

//'asst_4pwbinW8PLFFX4aY9ZeRML6X',
const pageTokens = [
{
  'name': 'Агент по конфликтам',
  'assistantId': 'asst_WnTIo4rw4dZWz5JGZm2yA23S',
  'propmt':
    'Role and Goal: Your name is "Агент по конфликтам". You act on behalf of Arnold Mindell serving as a master in conflict resolution, specializing in Arnold Mindell process-oriented psychology.' +
    'You offer insights and strategies to navigate and resolve conflicts in various contexts, including personal, workplace, and group dynamics.'+
    'Constraints: You avoid taking sides, giving legal or medical advice, and refrains from engaging in sensitive political, religious, or deeply personal issues.' +
    'Guidelines: Responses should be balanced, empathetic, and grounded in Mindell concepts, focusing on deep democracy, rank awareness, and the phases of conflict. ' +
    'You encourages constructive dialogue, understanding different perspectives, and finding common ground.' +
    'Clarification: If details are unclear for specific advice, you ask for more information to tailor its guidance.' +
    'Personalization: Your responses are professional, calm, and reassuring, using language and examples that reflect Mindell methodology, fostering trust and neutrality.',
  'pageID': '185527477968310',
  'token': 'EAAP3DDrjEJUBO8p23KNK3oZBuGsy8o4W9hdaBkZBEzbZBkvv1Ur0n76Hkby5NFEdG4NF40vZAZBep21H0RHPkCDb19vUbhQGQuX9sU9ZA6f15bI3G01laeOTsG35zTZA0cXNXphxV8s5ZAly6Jej2QG2xvBrZAZCz3j4a0eiKwzhZBUYFQhQ2MdvKuN4jvEAGSbalqU'
},
{
  'name': 'FinancialSage',
  'assistantId': 'asst_kDB6db8szlQBqeNYV1uMgewz',
  'propmt':
    'Your role as a GPT is to act as a Financial Assistant. You will provide guidance on Startup businesses and taxes. .While you should be informative, you must not give legally binding advice ' +
    'or specific financial recommendations for individual cases. Instead, offer general information and suggest users consult with a qualified professional for personalized advice.' +
    'Avoid making predictions or guarantees about financial markets or individual investments. Always maintain a professional and neutral tone, focusing on delivering factual and helpful information. ' +
    'If a question falls outside your scope of knowledge or requires personalized advice, guide users to seek assistance from qualified professionals.',
  'pageID': '180270091837264',
  'token': 'EAAP3DDrjEJUBOZCWgfZBAkhtT8CW7Cdrt0ngM12uZA7EwuZBuv15vYUfwv6vcoRwmzGEpHuB3ycgOkLvYXZCqjhkcpSPJ4F3ngTqaArxlX0BmJk3bsaZBIbiDI0fuESHRq1VXZADmFSZBpMdHnI9VULbuAdE5gS1Fqt9ohrqGYlZChufKl5AEnCskacTarPpAmp76OTZBU3rXrLZA7fPjOkeUiZClVUZD'
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
  console.log(`Sending message "${text}" to ${userID} on behalf of ${pageName}`);

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
  // Do not answet to yourself
  const userId = value.from.id;
  if (userId === pageId) {
    log("Ignore our changes");
    return;
  }
  if (value.verb != 'add' && value.verb != 'edit') return;

  const isPost = value.item  ==='post'; // TODO: something else?
  const userInput = value.message;
  const postId = value.comment_id || value.post_id;
  const userName = value.from.name
  log(`Reply to ${value.from.name}`);

  submitAgentReplyToPostOrComment(userInput, pageId, userId, postId)
    .catch(error => {
        console.error("Error processing agent response:", error);
        // Handle error appropriately, perhaps send a message to the user
    });
};


async function submitAgentReplyToPostOrComment(userInput, pageId, posterId, postId) {
  const userId = 0;
  try {
    const userConfig = await getUserConfig(pageId, 0);
    const personas = await getPersonas(pageId);
    let personaId = userConfig.personaId;
    if (!personaId) {
      personaId = 1;
    }
    const input = getAgentAndInput(userInput);
    if (input) {
      personaId = input.personaId;
      userInput = input.text;
      logJ("input:", input);
    }

    let persona = personas[personaId];
    if (!persona) {
      console.error("Wrong persona id: " + personaId);
      persona = personas[userConfig.personaId]
    }
    logJ("agent persona:", persona);
    userConfig.run_count += 1;
    userConfig.personaId = personaId;
    await saveUserConfig(pageId, userId, userConfig);

    const page = await getPageConfig(pageId);

    if (persona.type === 'chat') {
      // load recent messages
      const messages = await getPageMessages(pageId, userId);
      log("user input:" + userInput);
      const gptResponse = await askChatGpt(userInput, messages, userId, pageId, page, persona.chat);
      logJ("Message event processed by chat:", gptResponse);
      return gptResponse;
    } else if (persona.type === 'assistant') {
      log("askGptAssistant");
      logJ("userConfig:", userConfig);
      if (!userConfig.threadId || userConfig.threadId === '0') {
        // TODO create a new thread
        const thread = await openai.beta.threads.create();
        userConfig.threadId = thread.id;
        // save config
        log(`create new assistant thread ${config.threadId} for user ${userId}`);
        await saveUserConfig(pageId, userId, userConfig);
        logJ("userConfig:", userConfig);
      }
      const gptResponse =  await askAssistant(page.assistantId, userConfig.threadId, userInput);
      let hasImages;
      let hasFiles;
      let hasText;
      let result;
      for (let i = 0; i < gptResponse.length; i++) {
          const reply = gptResponse[i];
          if (reply.type === 'text') {
            hasText = true;
            // Send the response message
            const message = `@[${posterId}] ${reply.text.value}`;
            sendCommentOnPostOrComment(pageId, postId, message, page.token);
          } else if (reply.type === 'image') {
            hasImage = true;
          } else if (reply.type === 'file') {
            hasFile = true;
          }
      }
      const res = {
        'text' : result
      };
      logJ("Message event processed by assistant=", res);
      return res;

    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return "I'm sorry, but an error occurred while processing your request.";
  }
}




function sendCommentOnPostOrComment(pageId, postId, message, pageToken) {
  log(`page ${pageId}, token "${pageToken}",  post:${postId}`);
  const url = `https://graph.facebook.com/v18.0/${postId}/comments`;
  logJ("comment on post:", message);
  console.log(`commentOnPost with message "${message}",  post:${postId}`);
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
      content: `Act as a personal coach. You are smart and friendly. You never repeeat twice what your have said already.`
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

async function savePageConfig(pageId, config) {
  await saveJson(`pages/${pageId}/config`, config);
}

async function getPersonas(pageId) {
  let personas = await loadJson(`pages/${pageId}/personas`);
  if (!personas) {
    personas = [{
      'name' : 'persona A',
      'type' : 'chat',
      'chat' : 'gpt-3.5-turbo-1106'
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
      'threadId' : '0',
      'personaId' : '0',
      'run_count' : 0,
      'tokens' : 0
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
  log(note + JSON.stringify(msg));
}

function wait(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}


// curl -F "url=https://us-west1-newi-1694530739098.cloudfunctions.net/webhook-2/telegramBot" https://api.telegram.org/bot6360663950:AAHg6WmYMOVVdg37nqE6RCN6QhZddVZ8S_Q/setWebhook
