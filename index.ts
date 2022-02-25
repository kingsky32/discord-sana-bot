import { Intents, ControllerAction, createDiscordBot } from 'discord-bot-server';
import axios from 'axios';
import { getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';

createDiscordBot({
  clientOptions: {
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES],
  },
  token: process.env.DISCORD_BOT_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  commands: [],
  controllerConfig: {
    prefix: '~',
    helpTitle: '[개발] 사나쇼DJ봇 설명서',
  },
  controllers: [
    {
      command: 'hello',
      description: '인사를 합니다',
      action: (controllerAction: ControllerAction): void => {
        controllerAction.message.channel.send('Hello World!');
      },
    },
    {
      command: 'music play {keyword}',
      description: '노래를 재생합니다',
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.member?.voice.channelId) {
          if (controllerAction.message.guild) {
            const connection = joinVoiceChannel({
              channelId: controllerAction.message.member?.voice.channelId,
              guildId: controllerAction.message.guild.id,
              adapterCreator: controllerAction.message.guild.voiceAdapterCreator,
            });
            axios
              .get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                  key: process.env.YOUTUBE_API_KEY,
                  part: 'snippet',
                  q: controllerAction.variables.keyword,
                  maxResults: 1,
                },
              })
              .then(({ data: responseData }) => {
                const [item] = responseData.items ?? [];

                if (item) {
                  controllerAction.message.channel.send(item.snippet.title);
                } else {
                  controllerAction.message.channel.send(
                    `${controllerAction.variables.keyword}(은)는 존재하지 않습니다.`,
                  );
                }
              })
              .catch((error) => {
                console.error(error);
                const { code, message, status } = error.response.data.error ?? {};
                controllerAction.message.channel.send(
                  `데이터를 불러오는데 실패했습니다.\ncode: ${code}\nmessage: ${message}\nstatus: ${status}`,
                );
              });
          }
        } else {
          controllerAction.message.channel.send('음악을 이용하시려면 음성 채팅에 입장해야 합니다.');
        }
      },
    },
    {
      command: 'leave',
      description: '봇이 음성채팅에서 나갑니다',
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.guildId) {
          const connection = getVoiceConnection(controllerAction.message.guildId);
          if (connection) {
            connection?.destroy();
            controllerAction.message.channel.send('봇이 음성채팅에서 나갑니다.');
          } else {
            controllerAction.message.channel.send('봇이 음성채팅에 존재하지 않습니다.');
          }
        }
      },
    },
  ],
})
  .then(() => {
    console.log('✅ SUCCESSES');
  })
  .catch(console.error);
