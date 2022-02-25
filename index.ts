import { createDiscrodBot, Intents } from 'discord-bot-server';

createDiscrodBot({
  clientOptions: {
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
  },
  token: process.env.DISCORD_BOT_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  commands: [],
  controllerConfig: {
    prefix: '~',
    helpTitle: '사나쇼DJ봇 설명서',
  },
  controllers: [
    {
      command: 'hello',
      description: '인사를 합니다',
      action: (message) => {
        message.channel.send('Hello World!');
      },
    },
  ],
})
  .then(() => {
    console.log('✅ SUCCESSES');
  })
  .catch(console.error);
