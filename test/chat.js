

const { Configuration, OpenAIApi } = require("openai");
const readlineSync = require("readline-sync");
require("dotenv").config();

let APIcall = async () => {
    const OpenAI = require("openai");

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log(`key=${process.env.OPENAI_API_KEY}`);

    const myAssistants = await openai.beta.assistants.list({
      order: "desc",
      limit: "100",
    });

    for (let i = 0; i < myAssistants.body.data.length; i++) {
      const assistant = myAssistants.body.data[i];
      console.log(JSON.stringify(assistant, null, 2));
    }
    // const assistant = await openai.beta.assistants.create({
    //   name: "Math Tutor",
    //   description:  "This assistant will help you solve math problems.",
    //   instructions: "You are a personal math tutor. Write and run code to answer math questions.",
    //   tools: [{ type: "code_interpreter" }],
    //   model: "gpt-4-1106-preview"
    // });
    // console.log(JSON.stringify(assistant));


    const messageList = [{
        role: "system",
        content: `Act as a personal coach. Your name is Gleb. You are smart and friendly. You can offer to speak in Russian. Always introduce yourself. When user asks "help" reply with the message history.`
        },
        {"role": "user", "content": "Who are you?"},
        {"role": "assistant", "content": "Privet! I am Gleb, your personal coach."}
      ];

  do {
    const userInput = readlineSync.question("Enter your input(" + messageList.length + "): ");
    messageList.push({ role: "user", content: userInput });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: messageList
      });

      const { finish_reason, message } = response.choices[0];
      console.log(message);

      if (finish_reason === "stop") {
        messageList.push(message);
      }
    } catch (err) {
      if (err.response) {
        console.log(err.response.status);
        console.log(err.response.data);
      } else {
        console.log(err.message);
      }
    }
  } while (true);//readlineSync.question("\nYou Want more Results? (Y/N)").toUpperCase() === "Y");
};
APIcall();
