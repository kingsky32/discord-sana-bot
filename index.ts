import axios from 'axios';
import { Intents, ControllerAction, createDiscordBot } from 'discord-bot-server';
import {
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import ytdl from 'ytdl-core';
import * as fs from 'fs';
import crypto from 'crypto';

interface ServerMusic {
  status: boolean;
  list: Music[];
}

interface Server {
  music?: ServerMusic;
}

interface Servers {
  [k: string]: Server;
}

const servers: Servers = {};

interface Music {
  title: string;
  resource: AudioResource;
}

createDiscordBot({
  clientOptions: {
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES],
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
      action: (controllerAction: ControllerAction): void => {
        controllerAction.message.channel.send('Hello World!');
      },
    },
    {
      command: 'music list',
      description: '현재 재생목록을 봅니다.',
      action: (): void => {},
    },
    {
      command: 'music play {keyword}',
      description: '노래를 재생합니다',
      action: (controllerAction: ControllerAction): void => {
        // 길드 id가 존재할 경우
        if (controllerAction.message.guild) {
          // 음성채팅이 존재할 경우
          if (controllerAction.message.member?.voice.channelId) {
            // 서버가 존재하지 않을 경우 초기화
            if (!servers[controllerAction.message.guild.id]) servers[controllerAction.message.guild.id] = {};
            const server = servers[controllerAction.message.guild.id];

            const connection = joinVoiceChannel({
              // 채팅한 사람의 보이스 채널 아이디
              channelId: controllerAction.message.member?.voice.channelId,
              // 해당 길드 아이디
              guildId: controllerAction.message.guild.id,
              // 어댑터를 빌드하는데 만드는 함수.
              adapterCreator: controllerAction.message.guild.voiceAdapterCreator,
            });

            axios
              // YouTube Search API v3
              .get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                  key: process.env.YOUTUBE_API_KEY,
                  part: 'snippet',
                  q: controllerAction.variables.keyword,
                  maxResults: 1,
                },
              })
              // 성공했을 경우
              .then(({ data: responseData }) => {
                const [item] = responseData.items ?? [];

                // 검색 결과가 존재할 경우
                if (item) {
                  controllerAction.message.channel.send(`노래 '${item.snippet.title}' 재생합니다.`);
                  const musicPath = __dirname + '/music';

                  // music 폴더가 존재하지 않을 경우
                  if (!fs.existsSync(musicPath)) {
                    // 음악 폴더 생성
                    fs.mkdirSync(musicPath);
                  }
                  const filePath = musicPath + `/${crypto.randomBytes(20).toString('hex')}.mp3`;

                  ytdl(`https://www.youtube.com/watch?v=${item.id.videoId}`, { filter: 'audioonly' })
                    .pipe(fs.createWriteStream(filePath))
                    .on('finish', () => {
                      const resource = createAudioResource(filePath, { inlineVolume: true });
                      resource.volume?.setVolume(0.5);

                      const audioPlayer = createAudioPlayer({
                        behaviors: {
                          // 듣는 사람이 없을 경우 중지시킵니다.
                          noSubscriber: NoSubscriberBehavior.Pause,
                        },
                      });
                      audioPlayer.play(resource);
                      connection.subscribe(audioPlayer);
                    })
                    .on('error', () => {
                      controllerAction.message.channel.send(`데이터 ${filePath}을(를) 다운로드 하는데 실패했습니다.`);
                    });
                }
                // 검색 결과가 존재하지 않을 경우
                else {
                  controllerAction.message.channel.send(
                    `${controllerAction.variables.keyword}(은)는 존재하지 않습니다.`,
                  );
                }
              })
              // 실패했을 경우
              .catch((error) => {
                console.error(error);
                const { data } = error.response ?? {};

                let message = '데이터를 불러오는데 실패했습니다.';
                if (data?.error?.code) {
                  message += `\ncode: ${data?.error.code}`;
                }
                if (data?.error?.message) {
                  message += `\nmessage: ${data?.error.message}`;
                }
                if (data?.error?.status) {
                  message += `\nstatus: ${data?.error.status}`;
                }

                controllerAction.message.channel.send(message);
              });
          }
          // 음성채팅이 존재하지 않을경우
          else {
            controllerAction.message.channel.send('음악을 이용하시려면 음성 채팅에 입장해야 합니다.');
          }
        } else {
          controllerAction.message.channel.send('길드가 존재하지 않습니다.');
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
