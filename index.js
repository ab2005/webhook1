const functions = require('@google-cloud/functions-framework');


// TODO: revisit
const request = require('request');
const express = require('express');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('new-i');
const { OpenAI } = require("openai");
const { Telegraf } = require('telegraf');
const fs = require("fs");
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);
const FormData = require('form-data');

// Cache
const _cache = {};

// TODO: remove
// config
let keys;
let config;

// TODO: replace with account
var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function generateShortUID() {
  var timestamp = new Date().getTime();
  var base36Timestamp = timestamp.toString(36);
  var randomString = Math.random().toString(36).substring(2, 8);
  return base36Timestamp + randomString;
}

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
      access_token: longLivedToken
    }
  });
  const userId = userIdResponse.data.id;
  log('User ID:' + userId);

  // Store user ID and access token
  var config = await loadJson(`users/${userId}/config`, config) || {};
  config.userId = userId;
  config,accessToken = longLivedToken;
  if (!config.page_password) {
    config.page_password = generateShortUID();
  }
  logJ(`Saving user config...`, config);
  saveJson(`users/${userId}/config`, config);

  // List pages
  const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
    params: {
      access_token: longLivedToken,
    }
  });
  const pages = pagesResponse.data.data;
  let pagesList = '';
  const pagePassword = config.page_password;
  // Store page info for each page.
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    console.log('Page ID:', page.id);
    console.log('Page Name:', page.name);

    var pageConfig = await loadJson(`pages/${page.id}/config`);
    if (!pageConfig) {
      pageConfig = {
        pageID: page.id,
        name : page.name,
        token: page.access_token,
        admin_id: userId,
        page_password: pagePassword
        // more to add..
      };
    } else {
      pageConfig.pageID = page.id;
      pageConfig.name = page.name;
      pageConfig.token = page.access_token;
      pageConfig.admin_id = userId;
      pageConfig.page_password = pagePassword;
    }
    log(`Saving page pages/${page.id}/config...`);
    saveJson(`pages/${page.id}/config`, pageConfig);

    // Subscribe
    const subscriptions = 'email,feed,group_feed,inbox_labels,mention,message_reactions,messages,';
    log("subscriptions:" + subscriptions);
    const subscribedResponse = await axios.post(`https://graph.facebook.com/v18.0/${page.id}/subscribed_apps`, null, {
      params: {
        subscribed_fields: subscriptions,
        access_token: page.access_token,
      }
    });
    const subscriptionReply = JSON.stringify(subscribedResponse.data);
    log(`Subscribe responce: ${subscriptionReply}`);
    // add page link
    pagesList += getPageSnippet(page.id, page.name, pageConfig.openai_key, pageConfig.assistantId, pagePassword);
  }
  log(pagesList);
  return loginPage.replace('<!-- Add more links here -->', pagesList)
   .replace("$PAGE_PASSWORD", pagePassword)
   .replace("$PAGE_PASSWORD", pagePassword);
}

async function onChatPlugin(req, res, url, pageId) {
  try {
    log(url);
    logJ("pageId", pageId);
    const html = await insertHtmlSnippet(url, pageId);
    res.send(html);
  } catch (err) {
    log(err);
    res.status(500).send(`Something went wrong ${err.message}`);
  }
}


async function onPostTelegram(req, res, assistantId, token) {
  try {
    log(`Processing telegram:` +  JSON.stringify(req.body));
    const bot = new Telegraf(token);

    // Function to send 'typing' action
    const sendTypingAction = (ctx) => {
      ctx.replyWithChatAction('typing');
    };

    bot.on('text', async (ctx) => {
      sendTypingAction(ctx);
      var userInput = ctx.message.text;
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

      const isGroup = ctx.update.message.chat.type === 'group';
      const hasMentioned = userInput.toLowerCase().includes(botName.toLowerCase());
      if (isGroup && !hasMentioned) {
        // Do not reply, just listen for messages in group.
        userInput = "Reply \"OK\" after you read this message";
      }

      let gptResponse;
      try {
        gptResponse =  await askAssistant(assistantId, config.threadId, userInput);
        if (isGroup && !hasMentioned) {
          // Do not message, just listen for messages in group.
          gptResponse = [];
        }
        for (let i = 0; i < gptResponse.length; i++) {
          const response = gptResponse[i];
          if (response.type === 'text') {
            log("replying.. ");
            await ctx.reply(response.text.value,{ parse_mode: 'Markdown' });
            log("replied");
          } else {
            await ctx.reply(JSON.stringify(response));
          }
        }
      } catch(err) {
        console.error(err);
        await ctx.reply(err.message)
      }
    });

    bot.on('voice', async (ctx) => {
      sendTypingAction(ctx);
      const tempFilePath = `${ctx.chat.id}_temp_audio_.wav`;
      logJ(`Getting file link from:`, ctx.message.voice);
      const fileUrl= await bot.telegram.getFileLink(ctx.message.voice.file_id);

      log(`Downloading audio from ${fileUrl} ...`);
      // Download the audio file
      const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'arraybuffer'
      });
      const audioBuffer = Buffer.from(response.data, 'binary');
      let transcription;
      try {
        fs.writeFileSync(tempFilePath, audioBuffer);
        log("Transcribing audio...");
        sendTypingAction(ctx);
        // Transcribe audio
        transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: 'whisper-1',
        });
        logJ("Transcription:", transcription);
      } finally {
        fs.unlinkSync(tempFilePath);
      }

      const userInput = transcription.text;
      log("voice transcription:" + userInput);

      sendTypingAction(ctx);

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
          const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "onyx",
            input: response.text.value,
            responce_format: "opus"
          });
          log("audio created");
          const buffer = Buffer.from(await mp3.arrayBuffer());
          const tempFilePath = `${ctx.chat.id}_temp_audio_.ogg`;
          console.log("writing audio buffer to temp file:" + tempFilePath);

          sendTypingAction(ctx);

          try {
            await fs.promises.writeFile(tempFilePath, buffer);
            log("audio file created:" + tempFilePath);
            await ctx.replyWithVoice({ source: tempFilePath });
           } finally {
            // Clean up: delete the temporary file
            fs.unlinkSync(tempFilePath);
          }
          ctx.reply(response.text.value);
        } else {
          ctx.reply(JSON.stringify(response));
        }
      }
    });

    await bot.handleUpdate(req.body);
  } catch (err) {
    log(`Error while processing telegram: ${err}`);
    console.error(err);
  }
}

async function transcribeAudio(attachmentUrl, chatId) {
  const tempFilePath = `${chatId}_temp_audio.wav`;
  try {
    // typing on...
    // Download the file from URL
    const response = await axios({
      method: 'GET',
      url: attachmentUrl,
      responseType: 'stream',
    });
    await pipeline(response.data, fs.createWriteStream(tempFilePath));
    // typing on...
    // Transcribe the audio file
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
    });
    return transcription;
  } catch (error) {
    console.error('Error during transcription:', error);
  } finally {
    // Clean up: delete the temporary file
    fs.unlinkSync(tempFilePath);
  }
}

functions.http('webhook', async (req, res) => {
  log("<<<<<<<< webhook");
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
        const login = await initFacebookUser(req.query.code);
        res.status(200).send(login);
        return;
      } else if (req.query.m_u && req.query.m_p) {
          await onChatPlugin(req, res, req.query.m_u, req.query.m_p);
          return; // skip other handlers
      } else {
        onGet(req, res);
      }
    } else if (req.method === 'POST') {
      logJ("<<<<<============ POST:", req.body);
      try {
        if (req.query.t_a || req.query.t_t) {
            await onPostTelegram(req, res, req.query.t_a, req.query.t_t);
        } else if (req.body.object === 'page') {
            await onPost(req, res);
        } else if (req.body.object === 'instagram') {
          logJ("Instagram TODO:", req.body);
        } else {
            log("Unsupported object: " + JSON.stringify(req.body));
        }
      } catch (er) {
        log(`Error while prosessing POST: ${er}`);
      }
      log("POST done! =======>>>>>`");
      res.status(200).send('EVENT_RECEIVED');
    }
  } catch (error) {
    log("An error occurred: " + error.message);
    res.status(200).send('Internal Server Error');
  }
  log("webhook done >>>>>>>>>");
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

async function onPost(req, res) {
  try {
    let body = req.body;
    // Checks if this is an event from a page subscription
    if (body.object === 'page') {
      for (let i = 0; i < body.entry.length; i++) {
        const entry = body.entry[i];
        if (entry.changes) {
          await replyToChanges(entry.changes, entry.id);
        } else {
          let messageEvent = (entry.messaging || entry.standby )[0];
          // Check if the event is a message or postback and generate a response
          if (messageEvent.message) {
            await onMessage(messageEvent);
          } else if (messageEvent.postback) {
            onPostback(messageEvent);
          }
        }
      }
    } else {
      log(`Unknown object: ` +  JSON.stringify(body));
    }
  } catch(err) {
    console.error(err);
  }
}

// Handle Messenger message event
async function onMessage(messageEvent) {
  if (messageEvent.message.is_echo === true) {
    log("Ignoring echo");
    return;
  }
  // Checks if the message contains text
  if (messageEvent.message.attachments) {
    await onMessageWithAttachment(messageEvent);
  } else if (messageEvent.message.text) {
      await onMessageWithText(messageEvent);
  }
}

async function onMessageWithText(messageEvent) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;

  log("Submit text messasge processing from " + userId + ": " + messageEvent.message.text);

  // Submit messasge processing
  await submitAgentReplyToMessage(messageEvent);
}

async function sendMessengerMessageText(recipientId, page, text) {
  await sendMessengerMessage(recipientId, page, {text:text});
}

// Submit for processing reply for user message
async function submitAgentReplyToMessage(messageEvent, skipReply) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;
  let userInput= messageEvent.message.text;

  const page = await getPageConfig(pageId);

  if (!page) {
    log("No page config found for " + pageId);
    return
  }

  // ask for key
  if (userInput.startsWith("/key")) {
    const password = userInput.split(" ")[1].trim();
    log(`Checking password ${password}`);
    if (!password) {
      await sendMessengerMessageText(userId, page, "Password missing!");
      return;
    }
    if (password !== page.page_password) {
      log(`Wrong password ${password} vs ${page.page_password}`);
      await sendMessengerMessageText(userId, page, "Wrong password!");
      return;
    }
    const key = userInput.split(" ")[2].trim();
    if (!key) {
      log(`Missing OpoenAI key!`);
      await sendMessengerMessageText(userId, page, "Missing OpenAI key!");
      return;
    }

    log("Setting openapi key:" + key);
    try {
      const openai = new OpenAI({
        apiKey: key
      });
      const assistants = await openai.beta.assistants.list({
        order: "desc",
        limit: "100",
      });
      var assistantId;
      var assistantsList = "";
      for (let i = 0; i < assistants.body.data.length; i++) {
        const ass = assistants.body.data[i];
        if (ass.name === page.name) {
          log(`Found match: ${ass.id} ${page.name}`)
          assistantId = ass.id;
        } else {
          log(`${ass.id} ${ass.name} != ${page.name}`)
          assistantsList += `${ass.id} ${ass.name}\n`;
        }
      }
      var reply = "";
      if (assistantId) {
        reply = `Found assistant with matching name: ${assistantId} ${page.name}.\n`;
        log(`Your assistant id: ${assistantId}`);
        page.assistant_id = assistantId;
      } else {
        reply += `Available Assistants:\n${assistantsList}.\n You can set Assistant by /assistant <password> <assistant-id>`;
      }
      page.openai_key = key;
      savePageConfig(pageId, page);
      await sendMessengerMessageText(userId, page, reply);
      return;
    } catch(err) {
      // Wrong key
      console.log(err);
      await sendMessengerMessageText(userId, page, "Wrong OpenAI key!");
      return
    }
  } else if (userInput.startsWith("/assistant ")) {
    if (!page.openai_key) {
      await sendMessengerMessageText(userId, page, "Please, provide openai key!  /key <password> <openai-key>`");
      return;
    }
    const password = userInput.split(" ")[1].trim();
    if (password !== page.page_password) {
      await sendMessengerMessageText(userId, page, "Wrong password!");
      return;
    }
    const assistantId = userInput.split(" ")[2].trim();
    if (!assistantId) {
      await sendMessengerMessageText(userId, page, "Assistant ID is required!");
      return;
    }
    try {
      const openai = new OpenAI({
        apiKey: page.openai_key
      });
      const assistants = await openai.beta.assistants.list({
        order: "desc",
        limit: "100",
      });
      var isAssistantIdValid;
      for (let i = 0; i < assistants.body.data.length; i++) {
        const ass = assistants.body.data[i];
        if (ass.id === assistantId) {
          isAssistantIdValid = ass.name;
        }
      }
      if (!isAssistantIdValid) {
        await sendMessengerMessageText(userId, page, "Invalid assistant id!");
        return;
      }
      page.assistant_id = assistantId;
      savePageConfig(pageId, page);
      await sendMessengerMessageText(userId, page, `${isAssistantIdValid} will be your assistant`);
      return;
    } catch(err) {
      // Wrong key
      console.log(err);
      await sendMessengerMessageText(userId, page, "Wrong OpenAI key! Provide another one.");
      return;
    }
  } else {
    if (!page.openai_key) {
      log(`Ignoring message to a page ${pageId} without openapi key:`)
      return;
    }
    if (!page.assistant_id) {
      log(`Ignoring message to a page ${pageId} without assistant:`)
      return;
    }
  }

  const timestamp = messageEvent.timestamp;
  // check timestamp
  // if (timestamp < page.timestamp) {
  //   log(`Timestamp ${timestamp} is older than last ${page.timestamp}`);
  //   return
  // }
  // if (timestamp === page.timestamp) {
  //   log("Ignoring repeated messsage, timestamp:" + timestamp);
  //   log(`new timestamp:${timestamp}, old timestamt:${page.timestamp}`);
  //   return;
  // }
  page.timestamp = timestamp;
  savePageConfig(pageId, page);
  await sendMessengerMessage(userId, page, null);
  const userConfig = await getUserConfig(pageId, userId);
  const peersonaType = 'assistant';
  try {
    if (peersonaType === 'chat') {
      // load recent messages
      // TODO: revert this!!
      const messages = null;//await getPageMessages(pageId, userId);
      log("user input:" + userInput);
      const gptResponse = await askChatGpt(userInput, messages, userId, pageId, page, persona.chat);
      logJ("Message event processed by chat:", gptResponse);
      return gptResponse;
    } else if (peersonaType === 'assistant') {
      log("askGptAssistant");
      logJ("userConfig:", userConfig);
      userConfig.threadId = "thread_G3mDm0GNQOhY9Fl8FAYqwfh6";// thread_G3mDm0GNQOhY9Fl8FAYqwfh6
      if (!userConfig.threadId || userConfig.threadId === '0') {
        // TODO create a new thread
        const thread = await openai.beta.threads.create();
        userConfig.threadId = thread.id;
        // save config
        log(`create new assistant thread ${config.threadId} for user ${userId}`);
        saveUserConfig(pageId, userId, userConfig);
        logJ("userConfig:", userConfig);
      }
      log("userConfig.threadId:" + userConfig.threadId);
      log("userConfig.assistantId:" + page.assistant_id);
      const gptResponse =  await askAssistant(page.assistant_id, userConfig.threadId, userInput);
      let hasImages;
      let hasFiles;
      let hasText;
      let messages = [];
      for (let i = 0; i < gptResponse.length; i++) {
          const reply = gptResponse[i];
          if (reply.type === 'text') {
            hasText = true;
            // TODO reply with text message
            const message = {
              'text' : reply.text.value
            };
            logJ("Message event processed by assistant:", message);
            if (!skipReply) {
              await sendMessengerMessage(userId, page, message);
            }
            messages.push(message);
          } else if (reply.type === 'image') {
            hasImage = true;
          } else if (reply.type === 'file') {
            hasFile = true;
          }
      }
      return messages;
    }
  } catch (error) {
    console.error(`An error occurred while submitAgentReplyToMessage() call: ${error}`);
    const message = {
      'text' : `I'm sorry, but an error occurred while processing your request: ${error.message}`
    };
    logJ("Message event processed by assistant:", message);
    await sendMessengerMessage(userId, page, message);
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


  if (messages) {
    if (prompt) {
      messages[0].role = 'system';
      messages[0].content = prompt;
    }
      // Add the user's input as a new message to the array
    messages.push({
      role: "user",
      content: userInput,
    });
  } else {
    messages = [
      {
        role: "system",
        content: "You are a helpful assistant",
      },{
        role: "user",
        content: userInput,
      }
    ];
  }

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
    savePageMessages(pageId, userId, messages);
    const reply = {
      'text' : response.choices[0].message.content
    };
    await sendMessengerMessage(userId, page, reply);
    return reply;
  } else {
    // If the response doesn't have the expected structure, throw an error
    logJ('Response has an expected structure:', response);
    messages.pop();
    throw new Error("Invalid response structure");
  }
}

// Sends response messages via GraphQL
async function sendMessengerMessage(userId, page, message) {
  if (!message) {
    const response = await axios.post('https://graph.facebook.com/v18.0/me/messages', {
      recipient: {
        id: userId
      },
      sender_action: 'typing_on'
    }, {
      params: {
        access_token: page.token
      }
    });
    console.log(`Typing on..`);
  } else {
    const text = message.text;
    for (let i = 0; i < text.length; i += 1990) {
        const chunk = text.substring(i, i + 1990);
        message.text = chunk;
        console.log(`Sending message "${message.text}" to ${userId} on behalf of ${page.name}`);
        const response = await axios.post('https://graph.facebook.com/v18.0/me/messages', {
          recipient: {
            id: userId
          },
          message: message
        }, {
          params: {
            access_token: page.token
          }
        });
        console.log(`Message sent: ${response.data}`);
    }
  }
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
  if (!assistantId || !threadId) {
    throw new Error("Assistant ID or Thread ID is missing.");
  }
  try {
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userInput,
    });
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    let attempts = 0;
    log(`assistant id ${assistantId} running...`);
    while (runStatus.status !== "completed" && runStatus.status !== "failed" && attempts < 190) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
//      log(`run... ${attempts} status: ${runStatus.status}`);
    }
    log(`run finished ${attempts} status: ${runStatus.status}`);
    if (runStatus.status !== "completed") {
      if (runStatus.status === 'failed') {
        throw new Error("Run failed!");
      }
      await openai.beta.threads.runs.cancel(threadId, run.id);
      throw new Error("Run did not complete in the expected time.");
    }
    log("retrieving messages..");
    const messages = await openai.beta.threads.messages.list(threadId);
    log("last message..");
    const lastMessageForRun = messages.data
      .filter(
        (message) => message.run_id === run.id && message.role === "assistant"
      )
      .pop();
    if (!lastMessageForRun) {
      throw new Error("No assistant message found for the run.");
    }
    console.log(JSON.stringify(lastMessageForRun.content));
    return lastMessageForRun.content;
  } catch (error) {
    console.error(`Error in askAssistant: ${error.message}`);
    throw error;
  }
}

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


function extractFileExtension(url) {
  // Extracting the part of the URL after the last '/'
  const noParamsUrl = url.split('?')[0];
  log("no params url:" + noParamsUrl);
  const lastSegment = noParamsUrl.split('/').pop();
  log("last segment:" + lastSegment);

  // Finding the position of the last dot in the last segment
  const lastDotPosition = lastSegment.lastIndexOf('.');

  // Extracting the file extension
  const extension = lastDotPosition !== -1 ? lastSegment.substring(lastDotPosition + 1) : '';
  log("extension:" + extension);

  return extension;
}

function extractUParam(url) {
  const parts = url.split('?');
  // Check if the URL contains a query string
  if (parts.length <= 1) return null;

  const queryString = parts[1];
  const keyValuePairs = queryString.split('&');

  for (let pair of keyValuePairs) {
      const [key, value] = pair.split('=');
      if (decodeURIComponent(key) === 'u') {
          return decodeURIComponent(value);
      }
  }

  return url;
}


async function onMessageWithAttachment(messageEvent) {
  const userId = messageEvent.sender.id;
  const pageId = messageEvent.recipient.id;
  const timestamp = messageEvent.timestamp;
  const attachments = messageEvent.message.attachments;
  const text = removeUrls(messageEvent.message.text);
  let page;

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    // Get the URL of the message attachment
    const attachmentUrl = attachment.payload.url;
    logJ("attachment:", attachment);
    if (!page) {
      page = await getPageConfig(pageId);

      if (!page) {
        log("Page config not found.");
        return;
      }

      // check timestamp
      if (timestamp === page.timestamp) {
        log("Ignoring repeated messsage, timestamp:" + timestamp);
        return;
      }
      log(`new timestamp:${timestamp}, old timestamt:${page.timestamp}`);
      page.timestamp = timestamp;
      savePageConfig(pageId, page);
    }
    if (attachment.type === 'audio') {
      //const extension = extractFileExtension(attachmentUrl);
      const extension = "wav";
      log(extension); // Output will be the file extension
      const tempFilePath = `${userId}_${pageId}_temp_audio.${extension}`;
      try {
          // typing on...
        await sendMessengerMessage(userId, page, null);
        // Download the file from URL
        const response = await axios({
          method: 'GET',
          url: attachmentUrl,
          responseType: 'stream',
        });
        await pipeline(response.data, fs.createWriteStream(tempFilePath));

        // Transcribe the audio file
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: 'whisper-1',
        });
        messageEvent.message = transcription;

        const agentReplies = await submitAgentReplyToMessage(messageEvent);
        logJ("agentReplies:", agentReplies);

        await speakToFile(agentReplies[0].text, tempFilePath);
        log("audio file created:" + tempFilePath);

        await sendMessengerAudioMessage(page.token, userId, tempFilePath);
      } catch (error) {
        console.error('Error during transcription:', error);
      } finally {
        // Clean up: delete the temporary file
        fs.unlinkSync(tempFilePath);
      }
    } else if (attachment.type === 'video') {
      log("Not supported!");
    } else if (attachment.type === 'image') {
      log("Not supported!");
    } else if (attachment.type === 'fallback') {
      const url = extractUParam(attachment.payload.url);

      await sendMessengerMessage(userId, page, null);

      let postContent = {
        text: text || " "
      };

      try{
        // Extract content
        const extractorUrl = `https://extractorapi.com/api/v1/extractor`;
        const response = await axios.get(extractorUrl, {
          params: {
            js: false,
            fields: 'raw_text',
            apikey: '064a5c5f58c25bc5fadc0ecb885bdf1f93940670',
            url: url
          }
        });
        const content = response.data;
        content.html = "none";
        // TODO: Summarize
        const message = {
          'text' : content.text
        };
        logJ("Extracted content:", content);

        // Create facebook post
        postContent = await createPost(content);
      } catch (err) {
        console.error(err);
      }
      logJ("postContent:", postContent);
      // Post draft
      const postResponse = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        message: postContent,
        link: url,
        published: true
      }, {
        params: {
          access_token: page.token
        }
      });
      logJ("posted:", postResponse.data);

      await sendMessengerMessage(userId, page, {
         text: `👍 https://www.facebook.com/${pageId}/posts/${postResponse.data.id}`
      });
    }
  }
}

// const postWriterPropmt = "" + "You are a multi-lingual social media writer expert with a stype of Maghan O'Geiblyn and take a big inspirations from their work. "
// + "Your task is to read the TEXT the user provided. Reflect on it and write a facebook post higlighting major points in the TEXT and provide your thoughts about it. Always write in first person view using the language the TEXT is written. "
// + "If the TEXT is in Russina then use the language of Russian. ";
// // + "1. WRITE IN FIRST PERSON view, as you are an expert in AI, human psychology, philosophy with the style of Maghan O’Gieblyn. Reflect their style in your writing, but do not explicitly mention their names in the text"
// // + "2. DO NOT REPEAT  the same phrases and terms from your already written text. Use different words and expressions. Variance IS VERY IMPORTANT,  so you don't lose the audience attention."
// // + "3. in A FIRST PERSON VIEW use phrases like “I think”, “I believe”. Write.. ";

const postWriterPropmt = `**English Prompt:**

As a multi-lingual social media writing expert your task is to craft engaging Facebook post with your feedback on the TEXT you are reviewing.
Your job is to:
1. **Read and Understand the TEXT**: Carefully read the user-provided TEXT to grasp its main ideas and nuances.
2. **Highlight Key Points**: Identify and emphasize the major points in the TEXT. Your post should reflect the core message of the TEXT in a concise and engaging manner.
3. **Provide Personal Insights**: Share your thoughts, reflections, and insights on the TEXT. How does it resonate with you? What unique perspective can you offer?
4. **Write in the Appropriate Language**: The post must be written in the same language as the TEXT. If the TEXT is in Russian, write your post in Russian. For other languages, adapt accordingly.
This is crucial to ensure that the audience for which the TEXT is intended fully understands and connects with your post.
5. **First-Person Narrative**: Write from a first-person perspective to make the post more personal and relatable.
This style helps in creating a connection with the readers.

Remember, your role is to engage, inform, and connect with the audience as an independent reviewer.
Your creativity and linguistic skills are key in making each post a meaningful and enjoyable read for the audience.

---

**Russian Prompt (Русский Подсказка):**

Как эксперт по написанию многоязычных сообщений в социальных сетях, ваша задача - создать привлекательный пост в Facebook с вашим отзывом о ТЕКСТЕ, который вы рецензируете. Ваша работа состоит в следующем:
Чтение и Понимание ТЕКСТА: Внимательно прочитайте предоставленный пользователем ТЕКСТ, чтобы понять его основные идеи и нюансы.
Выделение ключевых моментов: Определите и выделяйте основные моменты в ТЕКСТЕ. Ваш пост должен отражать основное сообщение ТЕКСТА кратким и увлекательным образом.
Предоставление личных идей: Поделитесь своими мыслями, размышлениями и идеями о ТЕКСТЕ. Как он резонирует с вами? Какую уникальную перспективу вы можете предложить?
Написание на соответствующем языке: Пост должен быть написан на том же языке, что и ТЕКСТ. Если ТЕКСТ на русском, напишите свой пост на русском. Для других языков адаптируйте соответственно. Это крайне важно, чтобы целевая аудитория, для которой предназначен ТЕКСТ, полностью понимала и связывалась с вашим постом.
Личное повествование от первого лица: Пишите с позиции первого лица, чтобы сделать пост более личным и доступным. Этот стиль помогает создать связь с читателями.
Ваша роль - привлечь, информировать и связаться с аудиторией в качестве независимого рецензента. Ваша креативность и языковые навыки играют ключевую роль в том, чтобы каждый пост был значимым и приятным для аудитории`

const postWriterPropmt_simple = `
As a multi-lingual social media writing expert inspired by the style of Meghan O'Geiblyn, your task is to craft engaging Facebook posts.
  1. Summarize the DOCUMENT, focusing on its major points and key takeaways.
  2. Highlight the main arguments, conclusions, and any significant data or findings presented.
  3. Provide a concise and clear overview of the content, ensuring that the essence and important aspects of the document are captured effectively.
Как эксперт по написанию многоязычных сообщений в социальных сетях, вдохновленный стилем Меган О'Гейблин, ваша задача - создавать привлекательные публикации для Facebook.
  1. Сделайте краткое изложение DOCUMENT, сосредоточившись на его основных моментах и ключевых выводах.
  2. Выделите главные аргументы, выводы и любые значимые данные или результаты, представленные в документе.
  3. Предоставьте краткий и ясный обзор содержания, убедившись, что суть и важные аспекты документа захвачены эффективно.
  `;

  const postPromptCoStar = `
    # CONTEXT #
    I want to attract people to my facebook page to read my posts and to follow me.

    # OBJECTIVE #
    As a multi-lingual social media writing expert inspired by the style of Meghan O'Geiblyn create a Facebook post for me,
    which aims to get people to view and like the post. Your job is to do the following:
    1. Summarize the user's text, focusing on its major points and key takeaways.
    2. Highlight the main arguments, conclusions, and any significant data or findings presented.
    3. Provide a concise and clear overview of the content, ensuring that the essence and important aspects of the text are captured effectively.

    # STYLE #
    Follow the writing style of Meghan O'Geiblyn.

    # LANGUAGE #
    Write in the same language as the text provided to you. If the text is in Russian, write in Russian. For other languages, adapt accordingly.

    # TONE #
    Persuasive

    # AUDIENCE #
    My company’s audience profile on Facebook is typically the older generation. Tailor your post to target what this audience typically looks out for something interesing.

    # RESPONSE #
    The Facebook post, ingteresting and impactful translated to the same language as the original text.
`;
  async function createPost(content) {
  const completion = await openai.chat.completions.create({

    messages: [
      {
        "role": "system",
        "content": postWriterPropmt //postPromptCoStar//postWriterPropmt_simple
      },
      {
        "role": "user",
        "content": `TEXT=<<<${content.text}>>>`,
    }],
    model: "gpt-4-turbo-preview"// "gpt-3.5-turbo-1106",
  });

  console.log(completion.choices[0]);
  return completion.choices[0].message.content;
}

async function speakToFile(text, file) {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: text,
  });
  console.log(file);
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.promises.writeFile(file, buffer);
}

async function sendMessengerAudioMessage(pageAccessToken, recipientId, audioFilePath) {
  const readStream = fs.createReadStream(audioFilePath);
  const messageData = new FormData();
  messageData.append('recipient', '{id:' + recipientId + '}');
  messageData.append('message', '{attachment :{type:"audio", payload:{}}}');
  messageData.append('filedata', readStream);
  const response = await axios.post('https://graph.facebook.com/v2.6/me/messages?access_token=' + pageAccessToken, messageData, {
    headers: messageData.getHeaders()
  });
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
    'Your name is "FinancialSage". Your role is to act as a Financial Assistant. You will provide guidance on Startup businesses and taxes. While you should be informative, you must not give legally binding advice ' +
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

async function replyToChanges(changes, pageId) {
  console.log(`replyToChanges ${JSON.stringify(changes)}`);
  changes.forEach(async change => {
      if (change.field === `feed`) {
          await replyToFeed(change.value, pageId);
      }
  });
}

async function replyToFeed(value, pageId) {
  console.log(`replyToFeed ${JSON.stringify(value)}`);
  // Do not answet to yourself
  const userId = value.from.id;
  if (userId === pageId) {
    log("Ignore our changes");
    return;
  }
  if (value.item === 'reaction') {
    switch (value.reaction_type) {
      case "like":
          console.log(`${userId} likes me`);
          break;
      default:
          console.log(`${userId} ${value.reaction_type} me`);
    }
    // we can store who liked us and  send them a message
    return;
  }

  if (value.verb != 'add' && value.verb != 'edit') return;

  const isPost = value.item  ==='post'; // TODO: something else?
  const userInput = value.message;
  const postId = value.comment_id || value.post_id;
  const userName = value.from.name
  log(`Reply to ${value.from.name}`);

  await submitAgentReplyToPostOrComment(userInput, pageId, userId, postId);
};


async function submitAgentReplyToPostOrComment(userInput, pageId, posterId, postId) {
  const userId = 0;
  try {
    const page = await getPageConfig(pageId);
    if(!page) {
      console.error("No page found for pageId:", pageId);
      return;
    }
    await sendMessengerMessage(userId, page, null);
    const userConfig = await getUserConfig(pageId, 0);
    // const personas = await getPersonas(pageId);
    // let personaId = userConfig.personaId;
    // if (!personaId) {
    //   personaId = 1;
    // }
    // const input = getAgentAndInput(userInput);
    // if (input) {
    //   personaId = input.personaId;
    //   userInput = input.text;
    //   logJ("input:", input);
    // }

    // let persona = personas[1]; // alway to use assistant
    // if (!persona) {
    //   console.error("Wrong persona id: " + personaId);
    //   persona = personas[userConfig.personaId]
    // }
    // logJ("agent persona:", persona);
    // userConfig.run_count += 1;
    // userConfig.personaId = personaId;
    // await saveUserConfig(pageId, userId, userConfig);

    const personaType = 'assistant';

    if (personaType === 'chat') {
      // load recent messages
      const messages = await getPageMessages(pageId, userId);
      log("user input:" + userInput);
      const gptResponse = await askChatGpt(userInput, messages, userId, pageId, page, persona.chat);
      logJ("Message event processed by chat:", gptResponse);
      return gptResponse;
    } else if (personaType === 'assistant') {
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
// Returns cahced object or load object from file
// Return null if no object was stored
async function loadJson(fileName) {
  const cached = _cache[fileName];
  if (cached) return cached;
  // load file
  const file = bucket.file(`${fileName}.json`);
  const exists = (await file.exists())[0];
  if (exists) {
    const data = (await file.download())[0];
    const json = JSON.parse(data.toString());
    log(`"${fileName}" loaded: ` + json);
    _cache[fileName] = json;
    return json;
  }
  return false;
}

async function saveJson(fileName, json) {
  // sstore to cache
  _cache[fileName] = json;
  // save asyncroneously
  const file = bucket.file(`${fileName}.json`);
  file.save(JSON.stringify(json, null, 2), {
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
  saveJson(`pages/${pageId}/${userId}/messages`, trimmedMessages);
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
  saveJson(`pages/${pageId}/config`, config);
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
    savePersonas(pageId,personas);
  }
  return personas;
}

async function savePersonas(pageId, personas) {
  saveJson(`pages/${pageId}/personas`, personas);
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
    saveUserConfig(pageId, userId, config);
  }
  return config;
}

async function saveUserConfig(pageId, userId, config) {
  saveJson(`pages/${pageId}/${userId}/config`, config);
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


function removeUrls(text) {
  if (!text) return "read this text, confirm by 👍, wait for a next command or question.";
  // Regular expression to match URLs
  const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  // Replace URLs with an empty string
  return text.replace(urlRegex, '');
}

function getChatPlugin(pageId) {
  return `
  <!-- Messenger Chat Plugin Code -->
<div id="fb-root"></div>
<div id="fb-customer-chat" class="fb-customerchat">
</div>
<script>
  var chatbox = document.getElementById('fb-customer-chat');
  chatbox.setAttribute("page_id", ${pageId});
  chatbox.setAttribute("attribution", "biz_inbox");
</script>
<script>
  window.fbAsyncInit = function() {
    FB.init({
      xfbml            : true,
      version          : 'v18.0'
    });
  };
  (function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id;
    js.src = 'https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js';
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));
</script>`;
}

const cheerio = require('cheerio');

async function insertHtmlSnippet(url, htmlSnippet) {
  try {
    url = JSON.stringify(url);
    log(`Inserting HTML snippet into the web page:${url}`);
    // Fetch the HTML content from the URL
    const response = await axios.get("https://towardsdatascience.com/how-i-won-singapores-gpt-4-prompt-engineering-competition-34c195a93d41");
    const htmlContent = response.data;

    // Load the HTML content into cheerio
    const $ = cheerio.load(htmlContent);

    // Insert the HTML snippet after the opening <body> tag
    $('body').prepend(htmlSnippet);

    // Return the modified HTML content
    return $.html();
  } catch (error) {
    console.error('Error fetching or modifying the HTML content:', error);
    throw error;
  }
}
const loginPage = `
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to New-I</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            color: #333;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }

        .greeting {
            font-size: 24px;
            margin-bottom: 10px;
        }

        .instruction {
            font-size: 18px;
            margin-bottom: 20px;
        }

        .links-list a {
          font-size: 18px;
          display: block;
            margin-bottom: 10px;
              color: #007bff;
            text-decoration: none;
        }

        .links-list a:hover {
            text-decoration: underline;
        }

        .footer {
            text-align: center;
            padding: 20px 0;
            background-color: #ddd;
            font-size: 14px;
        }

        .footer a {
            color: #007bff;
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
  <div id="fb-root"></div>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0&appId=892971785510758" nonce="YpcHTnZM"></script>
  <div>
    <div class="container">
        <div class="greeting">Welcome to New-I!</div>
        <div class="instruction">You are now connected to AI-HOST™ platform. To disconnect follow the <a href="https://www.facebook.com/settings/?tab=business_tools">link</a>
        <p>Your Facebook pages are listed below. To create a new page go <a href="https://www.facebook.com/pages/creation/?ref_type=launch_point" target="_blank">here</a>';
        </p>
        </div>
        <p>You can configure page assistants by messaging these commands:
        <br><code>/key $PAGE_PASSWORD <a href="https://platform.openai.com/api-keys" target="_blank">your-openai-api-key</a></code>
        <br><code>/assistant $PAGE_PASSWORD <a href="https://platform.openai.com/assistants" target="_blank">your-assistant-id</a></code>
        </p>
        <div class="instruction">
        <p>Follow <a href="https://new-i.ai/setup_pages" target="_blank">step by step instructions</a> to setup Ai-Host™ Assistants</p>
        <p>Have fun!
        </div>

        <p>
        <div class="links-list">
            <!-- Add more links here -->
        </div>

        <div class="footer">
        &copy; New-I, Inc. | <a href="https://new-i.ai">Visit our Website</a>
        </div>
    </div>
</body>
</html>
`
function getPageSnippet(pageId, pageName, key, assistant, password) {
  const shortKey = (key && key.substring(0, 10) + "..") || "undefined";
  const snippet = `
  <div>
  <div class="fb-page" data-href="https://m.me/${pageId}" data-tabs="" data-width="" data-height="" data-small-header="false" data-adapt-container-width="true" data-hide-cover="false" data-show-facepile="true">
  <blockquote cite="https://www.facebook.com/${pageId}" class="fb-xfbml-parse-ignore">
  <a href="https://m.me/${pageId}">${pageName}</a></blockquote>
  </div>
  <code>
  <br>/key ${password} ${shortKey}
  <br>/assistant ${password} ${assistant}
  </code>
  <a href="https://m.me/${pageId}" target="_blank">Message ${pageName}</a>
  <hr>
  </div>
  <p>
  `;
  return snippet;
}

//==========
