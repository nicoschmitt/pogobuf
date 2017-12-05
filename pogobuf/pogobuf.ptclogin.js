/* eslint no-underscore-dangle: ["error", { "allow": ["_eventId"] }] */
const request = require('request');
const Promise = require('bluebird');
const querystring = require('querystring');

const PTC_CLIENT_SECRET = 'w8ScCUXJQc6kXKw8FiOhd8Fixzht18Dq3PEVkUCP5ZPxtgyWsbTvWHFLm2wNY0JR';

/**
 * Pokémon Trainer Club login client.
 * @class PTCLogin
 * @memberof pogobuf
 */
function PTCLogin() {
    if (!(this instanceof PTCLogin)) {
        return new PTCLogin();
    }

    const self = this;
    this.proxy = undefined;
    this.cookies = undefined;

    /**
     * Reset login so it can be reused
     */
    this.reset = function() {
        self.cookies = request.jar();
        self.request = request.defaults({
            headers: {
                'Accept': '*/*',
                'User-Agent': 'pokemongo/0 CFNetwork/811.5.4 Darwin/16.7.0',
                'Accept-Language': 'en-us',
                'Accept-Encoding': 'gzip, deflate',
                'X-Unity-Version': '2017.1.2f1',
            },
            gzip: true,
            jar: self.cookies,
        });
        Promise.promisifyAll(self.request);
    };

    this.reset();

    /**
     * Performs the PTC login process and returns a Promise that will be resolved with the
     * auth token.
     * @param {string} username
     * @param {string} password
     * @return {Promise}
     */
    this.login = function(username, password) {
        // return self.getSession()
        //     .then(sessionData => self.getTicket(sessionData, username, password));
        return self.init()
            .then(data => self.auth(data, username, password))
            .then(data => self.getAccessToken(data));
    };

    /**
     * Starts a session on the PTC website and returns a Promise that will be resolved with
     * the session parameters lt and execution.
     * @private
     * @return {Promise}
     */
    this.getSession = function() {
        return self.request.getAsync({
            url: 'https://sso.pokemon.com/sso/oauth2.0/authorize',
            qs: {
                client_id: 'mobile-app_pokemon-go',
                redirect_uri: 'https://www.nianticlabs.com/pokemongo/error',
                locale: 'en_US',
            },
            proxy: self.proxy,
        })
            .then(response => {
                if (response.statusCode !== 200) {
                    throw new Error(`Status ${response.statusCode} received from PTC login`);
                }

                let sessionResponse = null;
                try {
                    sessionResponse = JSON.parse(response.body);
                } catch (e) {
                    throw new Error('Unexpected response received from PTC login (invalid json)');
                }

                if (!sessionResponse || !sessionResponse.lt && !sessionResponse.execution) {
                    throw new Error('No session data received from PTC login');
                }

                return sessionResponse;
            });
    };

    /**
     * Performs the actual login on the PTC website and returns a Promise that will be resolved
     * with a login ticket.
     * @private
     * @param {Object} sessionData - Session parameters from the {@link #getSession} method
     * @param {string} username
     * @param {string} password
     * @return {Promise}
     */
    this.getTicket = function(sessionData, username, password) {
        sessionData._eventId = 'submit';
        sessionData.username = username;
        sessionData.password = password;
        sessionData.locale = 'en_US';

        return self.request.postAsync({
            url: 'https://sso.pokemon.com/sso/login',
            qs: {
                service: 'https://sso.pokemon.com/sso/oauth2.0/callbackAuthorize',
            },
            form: sessionData,
            proxy: self.proxy,
        })
            .then(response => {
                if (response.headers['set-cookie'] && response.headers['set-cookie'].length > 0) {
                    var cookieString = response.headers['set-cookie'].filter(c => c.startsWith('CASTGC'));
                    if (cookieString && cookieString.length > 0) {
                        const cookie = request.cookie(cookieString[0]);
                        return cookie.value;
                    }
                }

                // something went wrong
                if (response.body) {
                    if (response.body.indexOf('password is incorrect') >= 0) {
                        throw new Error('Invalid PTC login or password.');
                    } if (response.body.indexOf('failed to log in correctly too many times') >= 0) {
                        throw new Error('Account temporarily disabled, please check your password.');
                    }
                }

                // don't know what happend
                throw new Error('Something went wrong during PTC login.');
            });
    };

    this.init = function() {
        return self.request.getAsync({
            url: 'https://sso.pokemon.com/sso/login',
            qs: {
                service: 'https://sso.pokemon.com/sso/oauth2.0/callbackAuthorize',
                locale: 'en_US',
            },
            proxy: self.proxy,
        })
            .then(response => {
                if (response.statusCode !== 200) {
                    throw new Error(`Status ${response.statusCode} received from PTC login`);
                }

                let sessionResponse = null;
                try {
                    sessionResponse = JSON.parse(response.body);
                } catch (e) {
                    throw new Error('Unexpected response received from PTC login (invalid json)');
                }

                if (!sessionResponse || !sessionResponse.lt && !sessionResponse.execution) {
                    throw new Error('No session data received from PTC login');
                }

                return sessionResponse;
            });
    };

    this.auth = function(sessionData, username, password) {
        sessionData._eventId = 'submit';
        sessionData.username = username;
        sessionData.password = password;
        sessionData.locale = 'en_US';

        return self.request.postAsync({
            url: 'https://sso.pokemon.com/sso/login',
            qs: {
                service: 'https://sso.pokemon.com/sso/oauth2.0/callbackAuthorize',
                locale: 'en_US',
            },
            form: sessionData,
            proxy: self.proxy,
        }).then(response => {
            if (response.statusCode === 302 && response.headers) {
                const location = response.headers.location;
                return location.substring(location.indexOf('?ticket=') + '?ticket='.length);
            } else {
                let data;
                try {
                    data = JSON.parse(response.body);
                } catch (e) {
                    throw new Error('Incorrect response from PTC.');
                }
                if (data.errors) {
                    throw new Error(data.errors[0]);
                } else {
                    throw new Error('Incorrect response from PTC.');
                }
            }
        });
    };

    this.getAccessToken = function(ticket) {
        return self.request.postAsync({
            url: 'https://sso.pokemon.com/sso/oauth2.0/accessToken',
            form: {
                client_id: 'mobile-app_pokemon-go',
                redirect_uri: 'https://www.nianticlabs.com/pokemongo/error',
                client_secret: PTC_CLIENT_SECRET,
                grant_type: 'refresh_token',
                code: ticket,
            },
            proxy: self.proxy,
        }).then(response => {
            if (response.statusCode !== 200) {
                throw new Error(`Status ${response.statusCode} received from PTC login`);
            }

            const resp = querystring.parse(response.body);
            return resp.access_token;
        });
    };

    /**
     * Sets a proxy address to use for PTC logins.
     * @param {string} proxy
     */
    this.setProxy = function(proxy) {
        self.proxy = proxy;
    };
}

module.exports = PTCLogin;
