'use strict';

function createRequest(requestFn) {
    return function doRequest(opts, resultKey, callback) {
        if (typeof resultKey === 'function') {
            callback = resultKey;
            resultKey = null;
        }
        return requestFn(opts, (error, response, body) => {
            if (error) return callback(error);
            if (response && response.statusCode !== 200) {
                const parsedError = safeError(response);
                return callback(parsedError);
            }
            let result;
            if (typeof body !== 'object') result = JSON.parse(body);
            else result = body;
            if (resultKey && result.result) return callback(undefined, result.result[resultKey]);
            return callback(undefined, result);
        });
    };
}

function safeError(response) {
    try {
        return JSON.parse(response.body).error.error_code;
    } catch (err) {
        console.log('Cobinhood connection error:', err, response.statusCode, response.body);
        return 'JSON response from Cobinhood is malformed';
    }
}

function mapOrders(orders) {
    return orders.map((order) => {
        return {
            price: order[0],
            orders: order[1],
            quantity: order[2]
        };
    });
}

module.exports = function createClient(options) {
    const webSocketApi = require('./websocketapi.js');
    const baseUrl = 'https://api.cobinhood.com';
    
    options = Object.keys(options).reduce((opts, key) => {
        opts[key] = options[key];
        return opts;
    }, {
        apiKey: '',
        verbose: false,
        requestTimeout: 30000
    });

    const request = require('request').defaults({
        baseUrl: baseUrl,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/4.0 (compatible; Node Cobinhood API)',
            'Content-type': 'application/x-www-form-urlencoded'
        },
        timeout: options.requestTimeout
    });

    const requestWithAuth = request.defaults({
        headers: {
            authorization: options.apiKey
        }
    });

    const doRequest = createRequest(request);
    const doRequestWithAuth = createRequest(requestWithAuth);


    function placeOrder(symbol, price, quantity, side, type, callback) {
        let opt = {
            method: 'POST',
            url: '/v1/trading/orders',
            json: {
                'trading_pair_id': symbol,
                'side': side,
                'type': type,
                'price': price.toString(),
                'size': quantity.toString()
            },
            headers: {
                nonce: (new Date()).getTime()
            }
        };
        return doRequestWithAuth(opt, 'order', callback);
    }

    return {
        serverTime: (callback) => {
            doRequest('/v1/system/time', 'time', callback);
        },
        serverInfo: (callback) => {
            doRequest('/v1/system/info', 'info', callback);
        },
        currencies: (callback) => {
            doRequest('/v1/market/currencies', 'currencies', callback);
        },
        tradingPairs: (callback) => {
            doRequest('/v1/market/trading_pairs', 'trading_pairs', callback);
        },
        orderBook: (symbol, callback, limit = 50) => {
            let opt = {
                url: `/v1/market/orderbooks/${symbol}`,
                qs: {
                    limit: limit
                }
            };
            doRequest(opt, 'orderbook', (error, orderbook) => {
                if (error) return callback(error);
                const result = {
                    sequence: orderbook.sequence,
                    bids: mapOrders(orderbook.asks),
                    asks: mapOrders(orderbook.bids)
                };
                return callback(undefined, result);
            });
        },
        stats: (callback) => {
            doRequest('/v1/market/stats', callback);
        },
        ticker: (symbol, callback) => {
            doRequest(`/v1/market/tickers/${symbol}`, 'ticker', callback);
        },
        tickers: (callback) => {
            doRequest('/v1/market/tickers', 'tickers', callback);
        },
        lastPrice: (symbol, callback) => {
            doRequest(`/v1/market/tickers/${symbol}`, 'ticker', (error, ticker) => {
                if (error) return callback(error);
                return callback(undefined, ticker.last_trade_price);
            });
        },
        trades: (symbol, callback, limit = 20) => {
            let opt = {
                url: `/v1/market/trades/${symbol}`,
                qs: {
                    limit: limit
                }
            };  
            doRequest(opt, 'trades', callback);
        },
        candles: (symbol, timeframe, callback, endTime = false, startTime = false) => { // Timeframes: 1m, 5m, 15m, 30m, 1h, 3h, 6h, 12h, 1D, 7D, 14D, 1M
            let opt = {
                url: `/v1/chart/candles/${symbol}`,
                qs: {
                    timeframe: timeframe
                }
            };
            if (endTime) opt.qs.end_time = endTime;
            if (startTime) opt.qs.start_time = startTime;   
            doRequest(opt, 'candles', callback);
        },
        orderStatus: (orderId, callback) => {
            doRequestWithAuth(`/v1/trading/orders/${orderId}`, 'order', callback);
        },
        orderTrades: (orderId, callback) => {
            doRequestWithAuth(`/v1/trading/orders/${orderId}/trades`, 'trades', callback);
        },
        openOrders: (symbol, callback, limit = 20) => {
            let opt = {
                url: '/v1/trading/orders',
                qs: {
                    trading_pair_id: symbol,
                    limit: limit
                }
            };      
            doRequestWithAuth(opt, 'orders', callback);
        },
        openOrdersAll: (callback, limit = 20) => {
            let opt = {
                url: '/v1/trading/orders',
                qs: {
                    limit: limit
                }
            };              
            doRequestWithAuth(opt, 'orders', callback);
        },
        orderCancel: (orderId, callback) => {
            let opt = {
                method: 'DELETE',
                url: `/v1/trading/orders/${orderId}`,
                headers: {
                    nonce: (new Date()).getTime()
                }
            };
            doRequestWithAuth(opt, 'orders', (error, result) => {
                if (error) return callback(error);
                return callback(undefined, result.success);
            });
        },
        orderModify: (orderId, price, quantity, callback) => {
            let opt = {
                method: 'PUT',
                url: `/v1/trading/orders/${orderId}`,
                json: {
                    'price': price.toString(),
                    'size': quantity.toString()
                },
                headers: {
                    nonce: (new Date()).getTime()
                }
            };
            doRequestWithAuth(opt, (error, result) => {
                if (error) return callback(error);
                return callback(undefined, result.success);
            });
        },
        orderHistory: (symbol, callback, limit = 50) => {
            let opt = {
                url: '/v1/trading/order_history',
                qs: {
                    trading_pair_id: symbol,
                    limit: limit
                }
            };
            doRequestWithAuth(opt, 'orders', callback);
        },
        orderHistoryAll: (callback, limit = 50) => {
            let opt = {
                url: '/v1/trading/order_history',
                qs: {
                    limit: limit
                }
            };
            doRequestWithAuth(opt, 'orders', callback);
        },
        limitBuy: (symbol, price, quantity, callback) => {
            placeOrder(symbol, price, quantity, 'bid', 'limit', callback);
        },
        limitSell: (symbol, price, quantity, callback) => {
            placeOrder(symbol, price, quantity, 'ask', 'limit', callback);
        },
        marketBuy: (symbol, quantity, callback) => {
            placeOrder(symbol, '', quantity, 'bid', 'market', callback);
        },
        marketSell: (symbol, quantity, callback) => {
            placeOrder(symbol, '', quantity, 'ask', 'market', callback);
        },
        balances: (callback) => {
            return doRequestWithAuth('/v1/wallet/balances', 'balances', callback);
        },
        balanceHistory: (currency, callback, limit = 20) => {
            let opt = {
                url: '/v1/wallet/ledger',
                qs: {
                    limit: limit,
                    currency: currency
                }
            };
            return doRequestWithAuth(opt, 'ledger', callback);
        },
        balanceHistoryAll: (callback, limit = 20) => {
            let opt = {
                url: '/v1/wallet/ledger',
                qs: {
                    limit: limit
                }
            };
            return doRequestWithAuth(opt, 'ledger', callback);
        },
        depositAddresses: (currency, callback) => {
            let opt = {
                url: '/v1/wallet/deposit_addresses',
                qs: {
                    currency: currency
                }
            };
            return doRequestWithAuth(opt, 'deposit_addresses', callback);
        },
        depositAddressesAll: (callback) => {
            return doRequestWithAuth('/v1/wallet/deposit_addresses', 'deposit_addresses', callback);
        },
        depositStatus: (depositId, callback) => {
            return doRequestWithAuth(`/v1/wallet/deposits/${depositId}`, 'deposit', callback);
        },
        deposits: (callback) => {
            return doRequestWithAuth('/v1/wallet/deposits', 'deposits', callback);
        },
        withdrawalAddresses: (currency, callback) => {
            let opt = {
                url: '/v1/wallet/withdrawal_addresses',
                qs: {
                    currency: currency
                }
            };
            return doRequestWithAuth(opt, 'withdrawal_addresses', callback);
        },
        withdrawalAddressesAll: (callback) => {
            return doRequestWithAuth('/v1/wallet/withdrawal_addresses', 'withdrawal_addresses', callback);
        },
        withdrawalStatus: (withdrawalId, callback) => {
            return doRequestWithAuth(`/v1/wallet/withdrawals/${withdrawalId}`, 'withdrawal', callback);
        },
        withdrawals: (callback) => {
            return doRequestWithAuth('/v1/wallet/withdrawals', 'withdrawals', callback);
        },
        websocket: webSocketApi(options)
    };
};
