/* eslint no-underscore-dangle: ["error", { "allow": ["_eventId"] }] */
const request = require('request');
const Promise = require('bluebird');

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
                'User-Agent': 'pokemongo/1 CFNetwork/811.4.18 Darwin/16.5.0',
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
        return self.getSession()
            .then(sessionData => self.getTicket(sessionData, username, password));
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
            const body = response.body;

            if (response.statusCode !== 200) {
                throw new Error(`Status ${response.statusCode} received from PTC login`);
            }

            var sessionResponse = null;
            try {
                sessionResponse = JSON.parse(body);
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

    /**
     * Sets a proxy address to use for PTC logins.
     * @param {string} proxy
     */
    this.setProxy = function(proxy) {
        self.proxy = proxy;
    };
}

module.exports = PTCLogin;
