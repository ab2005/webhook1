

const { Configuration, OpenAIApi } = require("openai");
const readlineSync = require("readline-sync");
require("dotenv").config();

let APIcall = async () => {
    const OpenAI = require("openai");

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

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
