'use strict';
const WebSocket = require('ws');
const streamUrl = 'wss://feed.cobinhood.com/ws';

function handleWebSocketEventMessage(message) {
    switch (message.event) {
        case 'subscribed':
            console.log('Websocket channel subscribed:', message.channel_id);
            break;
        case 'unsubscribed':
            console.log('Websocket channel unsubscribed:', message.channel_id);
            break;
        case 'error':
            console.log('Websocket error message:', message);
            break;
        default:
            console.log('Websocket event message:', message);
    }
}

module.exports = function createClient(options) {
    return function subscribeWebSocket(channels, callback, reconnect = true) {
        if (!Array.isArray(channels))
            channels = [channels];

        const ws = new WebSocket(streamUrl, {
            headers: {
                authorization: options.apiKey
            }
        });

        ws.on('open', function() {
            if (options.verbose)
                console.log('Websocket connected');
            ws.isAlive = true;
            ws.pingInterval = setInterval(function() {
                if (ws.isAlive) {
                    ws.isAlive = false;
                    ws.send('{"action":"ping"}', function(error) {
                        if (error)
                            console.log(error);
                    });
                } else {
                    console.log('Websocket not response, terminating connection');
                    ws.terminate();
                }
            }, 30000);

            channels.forEach(function(channel) {
                channel.action = 'subscribe';
                ws.send(JSON.stringify(channel), function(error) {
                    if (error)
                        console.log(error);
                });
            });
        });

        ws.on('close', function() {
            clearInterval(ws.pingInterval);

            if (options.verbose)
                console.log('Websocket connection closed');

            if (reconnect) {
                if (options.verbose)
                    console.log('Reconnecting websocket...');
                subscribeWebSocket(channels, callback);
            }
        });

        ws.on('message', function(message) {
            try {
                message = JSON.parse(message);
                if ('pong' === message.event) {
                    ws.isAlive = true;
                } else if (message.event && options.verbose) {
                    handleWebSocketEventMessage(message);
                } else {
                    callback(false, message);
                }
            } catch (error) {
                callback(error);
            }
        });

        return ws;
    };
};
