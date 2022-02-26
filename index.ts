import axios from 'axios';
import { Intents, ControllerAction, createDiscordBot, Guild, Message } from 'discord-bot-server';
import {
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import ytdl from 'ytdl-core';
import fs from 'fs';
import crypto from 'crypto';
import moment from 'moment';

type MusicStatus = 'PLAYING' | 'DONE' | 'SKIP' | 'READY' | 'DOWNLOAD' | 'ERROR';

interface Music {
  id: string;
  title: string;
  status: MusicStatus;
  resource?: AudioResource;
  duration: number;
}

interface ServerMusic {
  list: Music[];
  history: Music[];
}

interface Server extends Guild {
  music?: ServerMusic;
}

const audioPlayer = createAudioPlayer({
  behaviors: {
    // 듣는 사람이 없을 경우 중지시킵니다.
    noSubscriber: NoSubscriberBehavior.Pause,
  },
});

function leaveBot(message: Message): boolean {
  if (message.guildId) {
    const connection = getVoiceConnection(message.guildId);
    if (connection) {
      connection?.destroy();
      return true;
    } else {
      return false;
    }
  }
  return false;
}

function skipMusic(message: Message, server: Server, isSkip: boolean = false): boolean {
  if (server.music) {
    if (isSkip) {
      server.music.list[0].status = 'SKIP';
    } else {
      server.music.list[0].status = 'DONE';
    }

    server.music.list.shift();

    // 재생목록이 1개 이상일때
    if (server.music.list.length > 0) {
      playingMusic(message, server);

      return true;
    }
    // 재생목록에 음악이 존재하지 않을 경우
    else {
      return false;
    }
  }
  return false;
}

function playingMusic(message: Message, server: Server, musicId?: string) {
  if (server.music) {
    // 재생목록이 1개 이상일 경우
    if (server.music.list.length) {
      if (musicId) {
        // TODO: musicID가 존재할 경우 해당 musicId 최우선으로 적용
      }
      server.music.list[0].status = 'PLAYING';
      const historyIndex = server.music.history.findIndex((music: Music) => music.id === server.music?.list[0].id);
      server.music.history[historyIndex].status = 'PLAYING';

      const [music] = server.music.list;

      // 음악 리소스
      if (music.resource) {
        // 그룹 아이디가 존재하는지
        if (message.guildId) {
          message.channel.send(`노래 '${music.title}'을(를) 재생 합니다.`);

          const connection = getVoiceConnection(message.guildId);

          // 음성채팅 커넥션
          if (connection) {
            audioPlayer.play(music.resource);
            connection.subscribe(audioPlayer);
            setTimeout(() => {
              const result = skipMusic(message, server);
              if (!result) {
                message.channel.send('재생목록에 음악이 존재하지 않아 음성채팅을 떠납니다.');
                leaveBot(message);
              }
            }, music.duration * 1000);
          }
          // 음성채팅에 존재하지 않을 경우
          else {
            message.channel.send('봇이 음성채팅에 존재하지 않습니다.');
          }
        }
        // 그룹이 존재하지 않을 경우
        else {
          message.channel.send('그룹이 존재하지 않습니다.');
        }
      }
      // 음악 리소스가 존재하지 않을 경우
      else {
        message.channel.send(`${music.title}의 리소스가 존재하지 않아 스킵합니다.`);
        // TODO: 스킵 노래
      }
    }
    // 재생목록이 존재하지 않을 경우
    else {
      message.channel.send('재생목록에 음악이 존재하지 않습니다.');
    }
  } else {
    message.channel.send('재생목록에 음악이 존재하지 않습니다.');
  }
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
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.guild) {
          const server: Server = controllerAction.servers[controllerAction.message.guild.id];

          if (server.music) {
            controllerAction.message.channel.send(
              server.music.list.map(({ title }, index) => `${index + 1}. ${title}`).join('\n'),
            );
          } else {
            controllerAction.message.channel.send('현재 재생중인 음악이 없습니다.');
          }
        } else {
          controllerAction.message.channel.send('그룹이 존재하지 않습니다.');
        }
      },
    },
    {
      command: 'music play {keyword}',
      description: '노래를 재생합니다',
      action: (controllerAction: ControllerAction): void => {
        // 길드 id가 존재할 경우
        if (controllerAction.message.guild) {
          // 음성채팅이 존재할 경우
          if (controllerAction.message.member?.voice.channelId) {
            const server: Server = controllerAction.servers[controllerAction.message.guild.id];

            if (server) {
              const connection = getVoiceConnection(controllerAction.message.guild.id);

              // 음성채팅에 존재할경우
              if (!connection) {
                // 새 connection 만들어주기.
                joinVoiceChannel({
                  // 채팅한 사람의 보이스 채널 아이디
                  channelId: controllerAction.message.member?.voice.channelId,
                  // 해당 길드 아이디
                  guildId: controllerAction.message.guild.id,
                  // 어댑터를 빌드하는데 만드는 함수.
                  adapterCreator: controllerAction.message.guild.voiceAdapterCreator,
                });
              }

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

                  if (item) {
                    // 비디오 정보 가져오는 api
                    axios
                      .get('https://www.googleapis.com/youtube/v3/videos', {
                        params: {
                          key: process.env.YOUTUBE_API_KEY,
                          part: 'contentDetails,snippet',
                          q: controllerAction.variables.keyword,
                          id: item.id.videoId,
                        },
                      })
                      .then(({ data: responseData }) => {
                        const [item] = responseData.items ?? [];

                        // 검색 결과가 존재할 경우
                        if (item) {
                          const id = crypto.randomBytes(20).toString('hex');
                          const title = item.snippet.title;
                          controllerAction.message.channel.send(`노래 '${title}'을(를) 다운로드 합니다.`);
                          const musicPath = __dirname + '/music';
                          const duration = moment.duration(item.contentDetails.duration).asSeconds();

                          const music: Music = {
                            id,
                            title,
                            duration,
                            status: 'DOWNLOAD',
                            resource: undefined,
                          };

                          // 서버에 음악이 있을 경우
                          if (server.music) {
                            server.music.list.push(music);
                            server.music.history.push(music);
                          } else {
                            server.music = {
                              list: [music],
                              history: [music],
                            };
                          }

                          // music 폴더가 존재하지 않을 경우
                          if (!fs.existsSync(musicPath)) {
                            // 음악 폴더 생성
                            fs.mkdirSync(musicPath);
                          }
                          const filePath = musicPath + `/${id}.mp3`;

                          ytdl(`https://www.youtube.com/watch?v=${item.id}`, { filter: 'audioonly' })
                            .pipe(fs.createWriteStream(filePath))
                            .on('finish', () => {
                              const resource = createAudioResource(filePath, { inlineVolume: true });
                              resource.volume?.setVolume(0.5);

                              // 음악이 존재할경우
                              if (server.music) {
                                const musicIndex = server.music.list.findIndex((music: Music) => music.id === id);
                                const musicHistoryIndex = server.music.list.findIndex(
                                  (music: Music) => music.id === id,
                                );

                                server.music.list[musicIndex].status = 'READY';
                                server.music.list[musicIndex].resource = resource;

                                server.music.list[musicHistoryIndex].status = 'READY';
                                server.music.list[musicHistoryIndex].resource = resource;

                                // 재생목록에 리스트가 존재할때
                                if (server.music.list.length > 1) {
                                  controllerAction.message.channel.send(
                                    `노래 '${music.title}'을(를) 재생목록에 ${server.music.list.length}번째로 추가 합니다.`,
                                  );
                                }
                                // 재생목록에 리스트가 존재하지 않을때
                                else {
                                  playingMusic(controllerAction.message, server);
                                }
                              }
                              // 음악이 존재하지 않을 경우
                              else {
                                controllerAction.message.channel.send(`음악이 존재하지 않습니다.`);
                              }
                            })
                            .on('error', () => {
                              controllerAction.message.channel.send(
                                `데이터 ${filePath}을(를) 다운로드 하는데 실패했습니다.`,
                              );
                            });
                        }
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
            } else {
              controllerAction.message.channel.send('서버를 찾을 수 없습니다.');
            }
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
        const result = leaveBot(controllerAction.message);
        if (result) {
          controllerAction.message.channel.send('봇이 음성채팅에서 나갑니다.');
        } else {
          controllerAction.message.channel.send('봇이 음성채팅에 존재하지 않습니다.');
        }
      },
    },
  ],
})
  .then(() => {
    console.log('✅ SUCCESSES');
  })
  .catch(console.error);
