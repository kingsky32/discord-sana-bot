"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const discord_bot_server_1 = require("discord-bot-server");
(0, discord_bot_server_1.createDiscrodBot)({
    clientOptions: {
        intents: [discord_bot_server_1.Intents.FLAGS.GUILDS, discord_bot_server_1.Intents.FLAGS.GUILD_MESSAGES],
    },
    token: (_a = process.env.DISCORD_BOT_TOKEN) !== null && _a !== void 0 ? _a : '',
    clientId: (_b = process.env.CLIENT_ID) !== null && _b !== void 0 ? _b : '',
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
