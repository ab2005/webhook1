const {Telegraf} = require('telegraf');

console.log(process.env.TELEGRAM_BOT_TOKEN)

const bot = new  Telegraf("6659811880:AAGYHxBPIuQxFd_QrK48cXxxcrLdvXjnEyU");
bot.assistant = "asdf asdf asdf asdf0"

// Start command handler
bot.start((ctx) => {
  ctx.reply('Hello! I am your Telegram bot.');
});


// Intecept incoming messages
bot.use((ctx, next) => {
  console.log(bot.assistant);
  console.log('Received message:', ctx.message);
  next();
});

// Middleware for error handling
// bot.use((ctx, next) => {
// return next().catch((err) => {
//     console.error('Error:', err);
//     // Handle the error gracefully (e.g., send an error message)
//     ctx.reply(`An error occured: ${err}`);
// });
// });

// Main handler to process messages
bot.on('text', (ctx) => {
  const user = ctx.update.message.from;
  const userName = user.username;
  const botName = bot.botInfo.username;
  ctx.reply(`Received your message: ${ctx.message.text}`);
});


// Launch the bot
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


// curl -F "url=https://us-west1-newi-1694530739098.cloudfunctions.net/webhook-2?t_a=asst_kDB6db8szlQBqeNYV1uMgewz&t_b=6360663950:AAHg6WmYMOVVdg37nqE6RCN6QhZddVZ8S_Q" https://api.telegram.org/bot6360663950:AAHg6WmYMOVVdg37nqE6RCN6QhZddVZ8S_Q/setWebhook
ConflictResolutionMasterBot
 6598968006:AAG-jWZ9yfb6op3952-OUQ7Ku5I5niAAYl8
// curl -F "url=https://us-west1-newi-1694530739098.cloudfunctions.net/webhook-2?t_a=asst_WnTIo4rw4dZWz5JGZm2yA23S&t_b=6598968006:AAG-jWZ9yfb6op3952-OUQ7Ku5I5niAAYl8" https://api.telegram.org/bot6598968006:AAG-jWZ9yfb6op3952-OUQ7Ku5I5niAAYl8/setWebhook
