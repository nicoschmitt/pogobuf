const Long = require('long'),
    POGOProtos = require('node-pogo-protos-vnext'),
    Signature = require('pogobuf-signature'),
    Bluebird = require('bluebird'),
    retry = require('bluebird-retry'),
    request = require('request'),
    Utils = require('./pogobuf.utils.js'),
    PTCLogin = require('./pogobuf.ptclogin.js'),
    GoogleLogin = require('./pogobuf.googlelogin.js'),
    ApiCalls = require('./pogobuf.apicalls.js');

const RequestType = POGOProtos.Networking.Requests.RequestType,
    PlatformRequestType = POGOProtos.Networking.Platform.PlatformRequestType,
    PlatformRequestMessages = POGOProtos.Networking.Platform.Requests,
    PlatformResponses = POGOProtos.Networking.Platform.Responses;

// @ts-ignore
const StopError = retry.StopError;

const INITIAL_ENDPOINT = 'https://pgorelease.nianticlabs.com/plfe/rpc';
const INITIAL_PTR8 = '4d32f6b70cda8539ab82be5750e009d6d05a48ad';

// See pogobuf wiki for description of options
const defaultOptions = {
    authType: 'ptc',
    authToken: null,
    username: null,
    password: null,
    proxy: null,
    maxTries: 5,
    automaticLongConversion: true,
    includeRequestTypeInResponse: false,
    version: 8705,
    useHashingServer: true,
    hashingServer: 'http://pokehash.buddyauth.com/',
    hashingVersion: null,
    hashingKey: null,
    deviceId: null,
};

/**
 * Helper function to encode proto
 * @param {Object} proto message
 * @return {Buffer} buffer
 */
function encode(proto) {
    return proto.constructor.encode(proto).finish();
}

/**
 * Pokémon Go RPC client.
 * @class Client
 * @param {Object} [options] - Client options (see pogobuf wiki for documentation)
 * @memberof pogobuf
 */
function Client(options) {
    if (!(this instanceof Client)) {
        return new Client(options);
    }
    const self = this;

    /*
     * PUBLIC METHODS
     */

    /**
      * Sets the specified client option to the given value.
      * Note that not all options support changes after client initialization.
      * @param {string} option - Option name
      * @param {any} value - Option value
      */
    this.setOption = function(option, value) {
        self.options[option] = value;
    };

    /**
     * Get the specified option
     * @param {string} option name
     * @return {any} Option value
     */
    this.getOption = function(option) {
        return self.options[option];
    };

    /**
     * Sets the player's latitude and longitude.
     * Note that this does not actually update the player location on the server, it only sets
     * the location to be used in following API calls. To update the location on the server you
     * need to make an API call.
     * @param {number|object} latitude - The player's latitude, or an object with parameters
     * @param {number} longitude - The player's longitude
     * @param {number} [accuracy=0] - The location accuracy in m
     * @param {number} [altitude=0] - The player's altitude
     */
    this.setPosition = function(latitude, longitude, accuracy, altitude) {
        if (typeof latitude === 'object') {
            const pos = latitude;
            latitude = pos.latitude;
            longitude = pos.longitude;
            accuracy = pos.accuracy;
            altitude = pos.altitude;
        }
        self.playerLatitude = latitude;
        self.playerLongitude = longitude;
        self.playerLocationAccuracy = accuracy || 0;
        self.playerAltitude = altitude || 0;
    };

    /**
     * Performs client initialization and do a proper api init call.
     */
    this.init = async function() {
        self.lastMapObjectsCall = 0;
        self.endpoint = INITIAL_ENDPOINT;

        // convert app version (5704) to client version (0.57.4)
        let signatureVersion = '0.' + ((+self.options.version) / 100).toFixed(0);
        signatureVersion += '.' + (+self.options.version % 100);

        self.signatureGenerator = new Signature.signature.Generator();
        self.signatureGenerator.register(self, self.options.deviceId);

        self.signatureEncryption = new Signature.encryption.Builder({
            protos: POGOProtos,
            version: signatureVersion,
            initTime: (new Date().getTime() - 3500 - Math.random() * 5000),
        });

        self.signatureEncryption.encryptAsync = Bluebird.promisify(
            self.signatureEncryption.encrypt,
            { context: self.signatureEncryption }
        );

        if (self.options.useHashingServer) {
            await self.initializeHashingServer();
        }

        // Handle login here if no auth token is provided
        if (!self.options.authToken) {
            if (!self.options.username || !self.options.password) throw new Error('No token nor credentials provided.');
            if (self.options.authType === 'ptc') {
                self.login = new PTCLogin();
            } else if (self.options.authType === 'google') {
                self.login = new GoogleLogin();
            } else {
                throw new Error('Invalid auth type provided.');
            }
            if (self.options.proxy) self.login.setProxy(self.options.proxy);

            const token = await self.login.login(self.options.username, self.options.password);
            if (!token) throw new Error('Error during login, no token returned.');
            self.options.authToken = token;
        }
    };

    /**
     * Clean up ressources, like timer and token
     */
    this.cleanUp = function() {
        if (self.signatureGenerator) self.signatureGenerator.clean();
        self.rpcId = 2;
        self.rpcIdHigh = 1;
        self.signatureGenerator = null;
        self.options.authToken = null;
        self.authTicket = null;
        self.batchRequests = [];
        self.batchPftmRequests = [];
        self.signatureEncryption = null;
    };

    /**
     * Sets batch mode. All further API requests will be held and executed in one RPC call when
     * {@link #batchCall} is called.
     * @return {Client} this
     */
    this.batchStart = function() {
        if (!self.batchRequests) {
            self.batchRequests = [];
            self.batchPftmRequests = [];
        }
        return self;
    };

    /**
     * Clears the list of batched requests and aborts batch mode.
     */
    this.batchClear = function() {
        delete self.batchRequests;
        delete self.batchPftmRequests;
    };

    /**
     * Executes any batched requests.
     * @return {Promise}
     */
    this.batchCall = function() {
        const p = self.callRPC(self.batchRequests || []);
        self.batchClear();
        return p;
    };

    /**
     * Gets rate limit info from the latest signature server request, if applicable.
     * @return {Object}
     */
    this.getSignatureRateInfo = function() {
        return self.signatureEncryption.rateInfos;
    };

    /*
     * Implement api calls
     */
    ApiCalls.defineApiCalls(this);

    /*
     * INTERNAL STUFF
     */

    this.request = request.defaults({
        encoding: null,
        gzip: true,
        headers: {
            'Content-Type': 'application/binary',
            'Host': 'pgorelease.nianticlabs.com',
            'User-Agent': 'Niantic App',
            'Content-Length': -1, // for order, will be fixed later
            'Accept-Encoding': 'identity, gzip',
        },
    });

    this.options = Object.assign({}, defaultOptions, options || {});
    this.authTicket = null;
    this.rpcId = 2;
    this.rpcIdHigh = 1; // for requestId generation
    this.lastHashingKeyIndex = 0;
    this.firstGetMapObjects = true;
    this.ptr8 = INITIAL_PTR8;

    /**
     * Executes a request and returns a Promise or, if we are in batch mode, adds it to the
     * list of batched requests and returns this (for chaining).
     * @private
     * @param {object} requestMessage - RPC request object
     * @return {Promise|Client}
     */
    this.callOrChain = function(requestMessage) {
        if (self.batchRequests) {
            self.batchRequests.push(requestMessage);
            return self;
        } else {
            return self.callRPC([requestMessage]);
        }
    };

    /**
     * Generates next rpc request id
     * @private
     * @return {Long}
     */
    this.getRequestID = function() {
        self.rpcIdHigh = (Math.pow(7, 5) * self.rpcIdHigh) % (Math.pow(2, 31) - 1);
        return new Long(self.rpcId++, self.rpcIdHigh, true);
    };

    /**
     * Generate auth_info object from authToken
     * @private
     * @return {object} auth_info to use in envelope
     */
    this.getAuthInfoObject = function() {
        let unknown2 = 0;
        if (self.options.authType === 'ptc') {
            const values = [2, 8, 21, 21, 21, 28, 37, 56, 59, 59, 59];
            unknown2 = values[Math.floor(values.length * Math.random())];
        }
        return {
            provider: self.options.authType,
            token: {
                contents: self.options.authToken,
                unknown2: unknown2,
            }
        };
    };

    /**
     * Creates an RPC envelope with the given list of requests.
     * @private
     * @param {Object[]} requests - Array of requests to build
     * @return {Object} POGOProtos.Networking.Envelopes.RequestEnvelope
     */
    this.buildEnvelope = function(requests) {
        const envelopeData = {
            status_code: 2,
            request_id: self.getRequestID(),
            ms_since_last_locationfix: 100 + Math.floor(Math.random() * 900)
        };

        if (self.playerLatitude) envelopeData.latitude = self.playerLatitude;
        if (self.playerLongitude) envelopeData.longitude = self.playerLongitude;
        if (self.playerLocationAccuracy) {
            envelopeData.accuracy = self.playerLocationAccuracy;
        } else {
            const values = [5, 5, 5, 5, 10, 10, 10, 30, 30, 50, 65];
            values.unshift(Math.floor(Math.random() * (80 - 66)) + 66);
            envelopeData.accuracy = values[Math.floor(values.length * Math.random())];
        }

        if (self.authTicket) {
            envelopeData.auth_ticket = self.authTicket;
        } else if (!self.options.authType || !self.options.authToken) {
            throw Error('No auth info provided');
        } else {
            envelopeData.auth_info = this.getAuthInfoObject();
        }

        if (requests) {
            envelopeData.requests = requests.map(r => {
                const requestData = {
                    request_type: r.type
                };

                if (r.message) {
                    requestData.request_message = encode(r.message);
                }

                return requestData;
            });
        }

        return POGOProtos.Networking.Envelopes.RequestEnvelope.fromObject(envelopeData);
    };

    /**
     * Constructs and adds a platform request to a request envelope.
     * @private
     * @param {Object} envelope - Request envelope
     * @param {Object} requestType - Type of the platform request to add (PlatformRequestType)
     * @param {Object} requestMessage - Pre-built but not encoded PlatformRequest protobuf message
     * @return {Object} The envelope (for convenience only)
     */
    this.addPlatformRequestToEnvelope = function(envelope, requestType, requestMessage) {
        const encoded = encode(requestMessage);
        envelope.platform_requests.push(
            POGOProtos.Networking.Envelopes.RequestEnvelope.PlatformRequest.fromObject({
                type: requestType,
                request_message: encoded,
            })
        );
        return envelope;
    };

    /**
     * Determines whether the as of yet unknown platform request type 8 should be added
     * to the envelope based on the given type of requests.
     * @private
     * @param {Object[]} requests - Array of request data
     * @return {boolean}
     */
    this.needsPtr8 = function(requests) {
        // Single GET_PLAYER request always gets PTR8
        if (requests.length === 1 && requests[0].type === RequestType.GET_PLAYER) {
            return true;
        }

        // Any GET_MAP_OBJECTS requests get PTR8 except the first one in the session
        if (requests.some(r => r.type === RequestType.GET_MAP_OBJECTS)) {
            if (self.firstGetMapObjects) {
                self.firstGetMapObjects = false;
                return false;
            }
            return true;
        }

        return false;
    };

    /**
     * Creates an RPC envelope with the given list of requests and adds the encrypted signature,
     * or adds the signature to an existing envelope.
     * @private
     * @param {Object[]} requests - Array of requests to build
     * @param {Object} [envelope] - Pre-built request envelope to sign (RequestEnvelope)
     * @return {Promise} - A Promise that will be resolved with a RequestEnvelope instance
     */
    this.buildSignedEnvelope = async function(requests, envelope) {
        if (!envelope) {
            try {
                envelope = self.buildEnvelope(requests);
            } catch (e) {
                throw new StopError(e);
            }
        }

        if (self.batchPftmRequests && self.batchPftmRequests.length > 0) {
            for (let i = 0; i < self.batchPftmRequests.length; i++) {
                const ptfm = self.batchPftmRequests[i];
                self.addPlatformRequestToEnvelope(envelope, ptfm.type, ptfm.message);
            }
        }

        const already8 = envelope.platform_requests.some(r => r.type === PlatformRequestType.UNKNOWN_PTR_8);
        if (!already8 && self.needsPtr8(requests)) {
            self.addPlatformRequestToEnvelope(envelope, PlatformRequestType.UNKNOWN_PTR_8,
                PlatformRequestMessages.UnknownPtr8Request.fromObject({
                    message: self.ptr8,
                }));
        }

        let authTicket = envelope.auth_ticket;
        if (!authTicket) {
            authTicket = envelope.auth_info;
        }

        if (self.options.useHashingServer) {
            let key = self.options.hashingKey;
            if (Array.isArray(key)) {
                key = key[self.lastHashingKeyIndex];
                self.lastHashingKeyIndex = (self.lastHashingKeyIndex + 1) % self.options.hashingKey.length;
            }

            self.signatureEncryption.useHashingServer(self.options.hashingServer + self.hashingVersion, key);
        }

        self.signatureEncryption.setAuthTicket(authTicket);

        if (typeof self.options.signatureInfo === 'function') {
            self.signatureEncryption.setFields(self.options.signatureInfo(envelope));
        } else if (self.options.signatureInfo) {
            self.signatureEncryption.setFields(self.options.signatureInfo);
        }

        self.signatureEncryption.setLocation(envelope.latitude, envelope.longitude, envelope.accuracy);

        const sigEncrypted = await retry(() => self.signatureEncryption.encryptAsync(envelope.requests)
            .catch(err => {
                if (err.name === 'HashServerError' && err.retry) {
                    throw err;
                } else {
                    throw new StopError(err);
                }
            }),
        {
            interval: 1000,
            backoff: 2,
            max_tries: 5,
            args: envelope.requests,
        });

        // remove existing signature if any
        envelope.platform_requests = envelope.platform_requests
            .filter(env => env.type !== PlatformRequestType.SEND_ENCRYPTED_SIGNATURE);

        self.addPlatformRequestToEnvelope(envelope,
            PlatformRequestType.SEND_ENCRYPTED_SIGNATURE,
            PlatformRequestMessages.SendEncryptedSignatureRequest.fromObject({
                encrypted_signature: sigEncrypted
            }));

        return envelope;
    };

    /**
     * Handle redirection to new API endpoint and resend last request to new endpoint.
     * @private
     * @param {Object[]} requests - Array of requests
     * @param {Object} signedEnvelope - Request envelope (POGOProtos RequestEnvelope)
     * @param {Object} responseEnvelope - Result from API call (POGOProtos ResponseEnvelope)
     * @return {Promise}
     */
    this.redirect = function(requests, signedEnvelope, responseEnvelope) {
        if (!responseEnvelope.api_url) {
            throw new Error('Fetching RPC endpoint failed, none supplied in response');
        }
        self.endpoint = 'https://' + responseEnvelope.api_url + '/rpc';
        return self.callRPC(requests, signedEnvelope);
    };

    /**
     * Executes an RPC call with the given list of requests, retrying if necessary.
     * @private
     * @param {Object[]} requests - Array of requests to send
     * @param {Object} [envelope] - Pre-built request envelope to use (POGOProtos RequestEnvelope)
     * @return {Bluebird} - A Promise that will be resolved with the (list of) response messages,
     *     or true if there aren't any
     */
    this.callRPC = function(requests, envelope) {
        if (self.options.maxTries <= 1) return self.tryCallRPC(requests, envelope);

        return retry(() => self.tryCallRPC(requests, envelope), {
            interval: 300,
            backoff: 2,
            max_tries: self.options.maxTries,
        });
    };

    /**
     * Actual HTTP post to Niantic server
     * @param {any} body
     * @return {Promise} Promise of a http response
     */
    this.post = async function(body) {
        return new Promise((resolve, reject) => {
            self.request.post({
                url: self.endpoint,
                proxy: self.options.proxy,
                body: body,
                headers: {
                    'Content-Length': body.length,
                },
            }, (err, resp) => {
                if (err) reject(err);
                else resolve(resp);
            }).on('request', req => req.removeHeader('connection'));
        });
    };

    /**
     * Executes an RPC call with the given list of requests.
     * @private
     * @param {Object[]} requests - Array of requests to send
     * @param {Object} [envelope] - Pre-built request envelope to use (POGOPRotos RequestEnvelope)
     * @return {Promise} - A Promise that will be resolved with the (list of) response messages,
     *     or true if there aren't any
     */
    this.tryCallRPC = async function(requests, envelope) {
        const signedEnvelope = await this.buildSignedEnvelope(requests, envelope);
        const response = await this.post(encode(signedEnvelope));

        if (response.statusCode !== 200) {
            if (response.statusCode >= 400 && response.statusCode < 500) {
                /* These are permanent errors so throw StopError */
                throw new StopError(
                    `Status code ${response.statusCode} received from HTTPS request`
                );
            } else {
                /* Anything else might be recoverable so throw regular Error */
                throw new Error(
                    `Status code ${response.statusCode} received from HTTPS request`
                );
            }
        }

        let responseEnvelope;
        try {
            responseEnvelope = POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(response.body);
        } catch (e) {
            if (e.decoded) {
                responseEnvelope = e.decoded;
            } else {
                throw new StopError(e);
            }
        }

        if (responseEnvelope.error) {
            throw new StopError(responseEnvelope.error);
        }

        if (responseEnvelope.auth_ticket) self.authTicket = responseEnvelope.auth_ticket;

        if (responseEnvelope.status_code === 53 ||
            (responseEnvelope.status_code === 2 && self.endpoint === INITIAL_ENDPOINT)) {
            return self.redirect(requests, signedEnvelope, responseEnvelope);
        }

        responseEnvelope.platform_returns.forEach(platformReturn => {
            if (platformReturn.type === PlatformRequestType.UNKNOWN_PTR_8) {
                const ptr8 = PlatformResponses.UnknownPtr8Response.decode(platformReturn.response);
                if (ptr8) self.ptr8 = ptr8.message;
            }
        });

        /* Auth expired, auto relogin */
        if (responseEnvelope.status_code === 102 && self.login) {
            self.login.reset();
            const token = await self.login.login(self.options.username, self.options.password);
            self.options.authToken = token;
            self.authTicket = null;
            signedEnvelope.auth_ticket = null;
            signedEnvelope.auth_info = this.getAuthInfoObject();
            return self.callRPC(requests, signedEnvelope);
        }

        /* Throttling, retry same request later */
        if (responseEnvelope.status_code === 52 && self.endpoint !== INITIAL_ENDPOINT) {
            await Bluebird.delay(2000);
            return self.callRPC(requests, signedEnvelope);
        }

        /* These codes indicate invalid input, no use in retrying so throw StopError */
        if (responseEnvelope.status_code === 3 || responseEnvelope.status_code === 51 ||
            responseEnvelope.status_code >= 100) {
            throw new StopError(
                `Status code ${responseEnvelope.status_code} received from RPC`
            );
        }

        /* These can be temporary so throw regular Error */
        if (responseEnvelope.status_code !== 2 && responseEnvelope.status_code !== 1) {
            throw new Error(
                `Status code ${responseEnvelope.status_code} received from RPC`
            );
        }

        let responses = [];

        if (requests && requests.length > 0) {
            if (requests.length !== responseEnvelope.returns.length) {
                throw new Error('Request count does not match response count');
            }

            for (let i = 0; i < responseEnvelope.returns.length; i++) {
                if (!requests[i].responseType) continue;

                let responseMessage;
                try {
                    responseMessage = requests[i].responseType.decode(
                        responseEnvelope.returns[i]
                    );
                    responseMessage = requests[i].responseType.toObject(
                        responseMessage, { defaults: true }
                    );
                } catch (e) {
                    throw new StopError(e);
                }

                if (self.options.includeRequestTypeInResponse) {
                    // eslint-disable-next-line no-underscore-dangle
                    responseMessage._requestType = requests[i].type;
                }
                responses.push(responseMessage);
            }
        } else {
            responseEnvelope.platform_returns.forEach(platformReturn => {
                if (platformReturn.type === PlatformRequestType.GET_STORE_ITEMS) {
                    const store = PlatformResponses.GetStoreItemsResponse.decode(platformReturn.response);
                    store._requestType = -1;
                    store._ptfmRequestType = PlatformRequestType.GET_STORE_ITEMS;
                    responses.push(store);
                }
            });
        }

        if (self.options.automaticLongConversion) {
            responses = Utils.convertLongs(responses);
        }

        if (!responses.length) return true;
        else if (responses.length === 1) return responses[0];
        return responses;
    };

    /**
     * Makes an initial call to the hashing server to verify API version.
     * @private
     */
    this.initializeHashingServer = async function() {
        if (!self.options.hashingServer) throw new Error('Hashing server enabled without host');
        if (!self.options.hashingKey) throw new Error('Hashing server enabled without key');

        if (self.options.hashingServer.slice(-1) !== '/') {
            self.setOption('hashingServer', self.options.hashingServer + '/');
        }

        if (self.options.hashingVersion != null) {
            self.hashingVersion = self.options.hashingVersion;
        } else {
            let version = +self.options.version;
            if (version === 8900) version = 8901; // fix for bossland endpoint naming
            if (version === 9100) version = 8901; // fix for unpublished bossland endpoint
            self.hashingVersion = await Signature.versions.getHashingEndpoint(self.options.hashingServer, version);
        }
    };
}

module.exports = Client;
