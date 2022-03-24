import axios from 'axios';
import {
  Intents,
  ControllerAction,
  createDiscordBot,
  Guild,
  Message,
  Client,
  Channel,
  AnyChannel,
} from 'discord-bot-server';
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

const pjson = require('./package.json');

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
  playTime: number;
  _timeout?: NodeJS.Timeout;
  _playTimeInterval?: NodeJS.Timer;
}

interface Server extends Guild {
  music?: ServerMusic;
}

if (!process.env.DISCORD_BOT_TOKEN) {
  throw Error('must require DISCORD_BOT_TOKEN');
}

if (!process.env.CLIENT_ID) {
  throw Error('must require CLIENT_ID');
}

const audioPlayer = createAudioPlayer({
  behaviors: {
    // 듣는 사람이 없을 경우 중지시킵니다.
    noSubscriber: NoSubscriberBehavior.Pause,
  },
});

function onLeaveBot(guildId: string): boolean {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection?.destroy();
    return true;
  }
  return false;
}

function onSkipMusic(message: Message, server: Server): boolean {
  if (server.music) {
    server.music.list[0].status = 'SKIP';

    server.music.list.shift();
    if (server.music._timeout) {
      clearTimeout(server.music._timeout);
    }
    if (server.music._playTimeInterval) {
      clearInterval(server.music._playTimeInterval);
    }

    // 재생목록이 1개 이상일때
    if (server.music.list.length > 0) {
      onPlayMusic(message, server);

      return true;
    }
    // 재생목록에 음악이 존재하지 않을 경우
    else {
      return false;
    }
  }
  return false;
}

function onNextMusic(message: Message, server: Server): boolean {
  if (server.music) {
    server.music.list[0].status = 'DONE';

    server.music.list.shift();
    if (server.music._timeout) {
      clearTimeout(server.music._timeout);
    }
    if (server.music._playTimeInterval) {
      clearInterval(server.music._playTimeInterval);
    }

    // 재생목록이 1개 이상일때
    if (server.music.list.length > 0) {
      onPlayMusic(message, server);

      return true;
    }
    // 재생목록에 음악이 존재하지 않을 경우
    else {
      return false;
    }
  }
  return false;
}

function onPlayMusic(message: Message, server: Server, musicId?: string) {
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
            server.music._timeout = setTimeout(() => {
              const result = onNextMusic(message, server);
              if (!result) {
                message.channel.send('재생목록에 음악이 존재하지 않아 음성채팅을 떠납니다.');
                if (message.guildId) {
                  onLeaveBot(message.guildId);
                }
              }
            }, music.duration * 1000);

            server.music.playTime = 0;
            server.music._playTimeInterval = setInterval(() => {
              if (server.music?.playTime) {
                server.music.playTime = server.music.playTime + 10;
              }
            }, 10);
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

function onClearMusic(server: Server): boolean {
  if (server) {
    if (server.music) {
      audioPlayer.stop();
      server.music.list = [];
      server.music.history = server.music.history.map<Music>((music: Music) => ({
        ...music,
        status: 'READY' || 'PLAYING' ? 'SKIP' : music.status,
      }));
      if (server.music._timeout) {
        clearTimeout(server.music._timeout);
      }
      if (server.music._playTimeInterval) {
        clearInterval(server.music._playTimeInterval);
      }
      server.music.playTime = 0;

      return true;
    }
  }
  return false;
}

createDiscordBot({
  clientOptions: {
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES],
  },
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.CLIENT_ID,
  commands: [],
  onReady(client: Client) {
    client.guilds.cache.forEach((guild: Guild): void => {
      guild.channels.cache.forEach((channel: any): void => {
        if (channel?.send) {
          channel.send(
            `사나DJ봇이 업데이트 되었어요, (v${pjson.version})\n` +
              '#### 업데이트 내역 ####\n' +
              '1. 커맨드 단축해서 쓸 수 있어요 자세한 내용은 ~help 명령어로 확인해주세요\n' +
              '2. 후원번호를 열었어요 후원은 01052363219 지금 이 번호로 전화해줘\n' +
              '##############\n' +
              '많은 사랑과 관심이 쾌적한 봇 환경을 만듭니다 gg요',
          );
          return;
        }
      });
    });
  },
  controllerConfig: {
    prefix: '~',
    helpTitle: '사나쇼DJ봇 설명서',
  },
  controllers: [
    {
      command: ['voice list', 'vl'],
      description: '현재 음성채팅 목록을 조회합니다.',
      action: (controllerAction: ControllerAction): void => {
        controllerAction.message.channel.send('개발중 입니다.');
      },
    },
    {
      command: ['music list', 'ml'],
      description: '현재 재생목록을 봅니다.',
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.guild) {
          const server: Server = controllerAction.servers[controllerAction.message.guild.id];

          if (server.music) {
            if (server.music.list.length) {
              controllerAction.message.channel.send(
                server.music.list
                  .map(({ title }, index) => `${index + 1}. ${title}${index === 0 ? ' - (재생중)' : ''}`)
                  .join('\n'),
              );
            } else {
              controllerAction.message.channel.send('현재 재생중인 음악이 없습니다.');
            }
          } else {
            controllerAction.message.channel.send('현재 재생중인 음악이 없습니다.');
          }
        } else {
          controllerAction.message.channel.send('그룹이 존재하지 않습니다.');
        }
      },
    },
    {
      command: ['music history', 'mh'],
      description: '재생 히스토리를 봅니다.',
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.guild) {
          const server: Server = controllerAction.servers[controllerAction.message.guild.id];

          if (server.music) {
            if (server.music.history.length) {
              controllerAction.message.channel.send(
                server.music.history.map(({ title }, index) => `${index + 1}. ${title}`).join('\n'),
              );
            } else {
              controllerAction.message.channel.send('재생했던 음악이 없습니다.');
            }
          } else {
            controllerAction.message.channel.send('재생했던 음악이 없습니다.');
          }
        } else {
          controllerAction.message.channel.send('그룹이 존재하지 않습니다.');
        }
      },
    },
    {
      command: ['music play {keyword}', 'mp {keyword}'],
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
                              playTime: 0,
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
                                  onPlayMusic(controllerAction.message, server);
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
      command: ['music skip', 'ms'],
      description: '현재 재생중인 음악을 스킵합니다.',
      action: (controllerAction: ControllerAction) => {
        if (controllerAction.message.guildId) {
          controllerAction.message.channel.send('재생중인 음악을 스킵합니다.');
          onSkipMusic(controllerAction.message, controllerAction.servers[controllerAction.message.guildId]);
        }
      },
    },
    {
      command: ['music delete {index}', 'md {index}'],
      description: '재생목록에서 음악을 삭제합니다.',
      action: (controllerAction: ControllerAction) => {
        // 인덱스가 존재할 때
        if (controllerAction.variables.index) {
          // 길드 아이디가 존재할때
          if (controllerAction.message.guildId) {
            const server: Server = controllerAction.servers[controllerAction.message.guildId];

            if (server) {
              const [deletedMusic] = server.music?.list.splice(Number(controllerAction.variables.index) - 1, 1) ?? [];

              // 삭제한 노래가 있을 경우
              if (deletedMusic) {
                controllerAction.message.channel.send(
                  `${controllerAction.variables.index}번 ${deletedMusic.title} 음악이 삭제되었습니다.`,
                );
              }
              // 삭제한 노래가 없을 경우
              else {
                controllerAction.message.channel.send('삭제할 음악이 존재하지 않습니다.');
              }
            }
            // 서버가 존재하지 않을 때
            else {
              controllerAction.message.channel.send('서버가 존재하지 않습니다.');
            }
          }
          // 길드 아이디가 존재하지 않을때
          else {
            controllerAction.message.channel.send('서버가 존재하지 않습니다.');
          }
        } else {
          controllerAction.message.channel.send('인덱스가 존재하지 않습니다.');
        }
      },
    },
    {
      command: ['music clear', 'mc'],
      description: '재생목록을 초기화 합니다.',
      action: (controllerAction: ControllerAction) => {
        if (controllerAction.message.guildId) {
          const server: Server = controllerAction.servers[controllerAction.message.guildId];
          const result = onClearMusic(server);

          if (result) {
            controllerAction.message.channel.send('재생목록을 초기화했습니다.');
          }
        } else {
          controllerAction.message.channel.send('길드 아이디가 존재하지 않습니다.');
        }
      },
    },
    {
      command: ['leave', 'l'],
      description: '봇이 음성채팅에서 나갑니다',
      action: (controllerAction: ControllerAction): void => {
        if (controllerAction.message.guildId) {
          const server: Server = controllerAction.servers[controllerAction.message.guildId];
          const result = onLeaveBot(controllerAction.message.guildId);
          if (result) {
            onClearMusic(server);
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
