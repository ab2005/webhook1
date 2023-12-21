

//const { Configuration, OpenAIApi } = require("openai");
const readlineSync = require("readline-sync");
require("dotenv").config();

const OpenAI = require("openai");

var openai;

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucketName = 'new-i'; // Replace with your bucket name
const fileName = 'example.json'; // Replace with your JSON file name

const pageTokens = [
  {
    'name': 'Агент по конфликтам',
    'assistant_id' : '',
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

  const page = {
    'assistants' : [ {
      'id' : 0,
      'name' : 0,
    }
    ],
    'users' : [
      {
        'id' : 0,
        'thread_id' : 0,
      }
    ],
    'personas' : [

    ]
  }
// new-i test: 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
// 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
async function modifyJsonFile(bucketName, fileName) {
    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        let json = {};
        const exists = (await file.exists())[0];
        if (exists) {
          // Download the file
          const data = (await file.download())[0];
          json = JSON.parse(data.toString());
          console.log("loaded" + json);
        }

        // Modify the JSON object
        // Example modification: Add a new property
        json.newProperty = 'New Value';

        // Upload the modified JSON back to the bucket
        await file.save(JSON.stringify(json, null, 2), {
            contentType: 'application/json'
        });

        console.log('JSON file modified and saved back to the bucket.');
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadJson(bucketName, fileName) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);
  if (exists) {
    // Download the file
    const data = (await file.download())[0];
    const json = JSON.parse(data.toString());
    console.log("loaded" + json);
    return json;
  }
  return false;
}

async function saveJson(bucketName, fileName, json) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);
  // Upload the modified JSON back to the bucket
  await file.save(JSON.stringify(json, null, 2), {
    contentType: 'application/json'
  });
  console.log('JSON file saved.');
}

function log(msg) {
  console.log(JSON.stringify(msg));
//  console.log(JSON.stringify(msg, null, 2));
}


async function processText(text) {
  const annotations = text.annotations;
  const citations = [];

  // Iterate over the annotations and add footnotes
  annotations.forEach(async (annotation, index) => {
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
      }
  });

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


async function processMessage(threadId, message) {
  try {
    message.content.forEach((content, index) => {
      if (content.text) {
        processText(content.text);
      } else if (content.image_file) {
        processImage(content.image_file);
      } else {
        console.error("Unknown type " + content.type);
      }
    });
  } catch (error) {
      console.error('Error processing the message:', error);
  }
}

async function askQuestion(question) {
  return new Promise((resolve, reject) => {
    readline.question(question, (answer) => {
      resolve(answer);
    });
  });
}

const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

const k ='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' //process.env.OPENAI_API_KEY
let APIcall = async (assistantId, threadId) => {
  var myAssistants;
  while(!myAssistants) {
    var key = await askQuestion(`enter key > `);
    if (key == '') {
      key = k;
    }
    try {
      openai = new OpenAI({
        apiKey: key
      });
      myAssistants = await openai.beta.assistants.list({
        order: "desc",
        limit: "100",
      });
    } catch (err) {
      console.error(err);
      log(`Invalid key: ${key}`);
    }
  }

  for (let i = 0; i < myAssistants.body.data.length; i++) {
    const assistant = myAssistants.body.data[i];
    log(i + ". " + JSON.stringify(assistant, null, 2));
  }

  do {
    const userInput = await askQuestion(`${threadId} > `);
    // Pass in the user question into the existing thread
 } while (true);
};

async function askAssistant(assistantId, threadId, userInput) {
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: userInput,
  });

  // Use runs to wait for the assistant response and then retrieve it
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
}

const instructions = "Ты эксперт по разрешению конфликтов, воплощая роль Арнольда Минделла."
+ " Ты специализируешься на процессно-ориентированной психологии Арнольда Минделла и предназначен для предоставления стратегий "
+ " и идей для разрешения конфликтов в различных ситуациях, включая личные, рабочие и групповые динамики. Перед тем как отвечать на вопросы,"
+ " ты всегда ищешь информацию в загруженных файлах и предоставляет ссылки, если таковые найдены. Ограничения: Ты должен избегать принятия сторон в любом споре. "
+ " Ты должен воздерживаться от предоставления юридических или медицинских советов.Ты не должен заниматься чувствительными политическими, "
+ " религиозными или глубоко личными вопросами. Рекомендации:Твои ответы должны быть сбалансированными и эмпатичными. Твои советы должны быть основаны "
+ " на концепциях Минделла, сосредотачиваясь на глубокой демократии, осознании ранга и фазах конфликта.Они должны способствовать конструктивному диалогу, пониманию различных точек зрения и поиску общего языка."
+ " Протокол уточнения:Если предоставленные пользователями детали неясны или недостаточны для конкретных советов, ты должен запросить дополнительную информацию, чтобы предложить индивидуализированное руководство."
+ " Персонализация:Твои ответы должны быть профессиональными, спокойными и уверенными. Язык и примеры, используемые в ответах, должны отражать методологию Минделла, создавая атмосферу доверия и нейтральности."
+ " Требование к языку: Ты отвечаешь на языке пользователя. Если пользователь задает вопрос на английском языке, ты должен отвечать на английском. Ты всегда вежлив и всегда говоришь на вы.'";

//modifyJsonFile('new-i', 'test');
//APIcall("creator");
APIcall("asst_4pwbinW8PLFFX4aY9ZeRML6X", "thread_cYv4skGLYI8FioiwyUSYQ23J"); // Bob
//APIcall("asst_j5TKz2i4OQavVIKr0K4Rfgjc", "thread_0D7IQSDIYhtyuX59HK3OYr5i"); // bob is a cat
