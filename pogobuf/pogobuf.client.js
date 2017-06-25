'use strict';

const Long = require('long'),
    POGOProtos = require('node-pogo-protos-vnext'),
    Signature = require('pogobuf-signature'),
    Promise = require('bluebird'),
    request = require('request'),
    retry = require('bluebird-retry'),
    Utils = require('./pogobuf.utils.js'),
    PTCLogin = require('./pogobuf.ptclogin.js'),
    GoogleLogin = require('./pogobuf.googlelogin.js');

const Lehmer = Utils.Random;

const RequestType = POGOProtos.Networking.Requests.RequestType,
    PlatformRequestType = POGOProtos.Networking.Platform.PlatformRequestType,
    PlatformRequestMessages = POGOProtos.Networking.Platform.Requests,
    PlatformResponses = POGOProtos.Networking.Platform.Responses,
    RequestMessages = POGOProtos.Networking.Requests.Messages,
    Responses = POGOProtos.Networking.Responses;

const INITIAL_ENDPOINT = 'https://pgorelease.nianticlabs.com/plfe/rpc';
const INITIAL_PTR8 = '15c79df0558009a4242518d2ab65de2a59e09499';

// See pogobuf wiki for description of options
const defaultOptions = {
    authType: 'ptc',
    authToken: null,
    username: null,
    password: null,
    downloadSettings: true,
    appSimulation: false,
    proxy: null,
    maxTries: 5,
    automaticLongConversion: true,
    includeRequestTypeInResponse: false,
    version: 6703,
    useHashingServer: true,
    hashingServer: 'http://hashing.pogodev.io/',
    hashingKey: null,
    deviceId: null,
};

/**
 * Helper function to encode proto
 * @param {Messsage} proto 
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
     * @return {any} Option value
     */
    this.getOption = function(option) {
        return self.options[option];
    }

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
     * @param {boolean} [appSimulation] - Deprecated, use appSimulation option instead
     * @return {Promise} promise
     */
    this.init = function(appSimulation) {
        // For backwards compatibility only
        if (typeof appSimulation !== 'undefined') self.setOption('appSimulation', appSimulation);

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
        self.signatureEncryption.encryptAsync = Promise.promisify(self.signatureEncryption.encrypt,
                                                                { context: self.signatureEncryption });

        let promise = Promise.resolve(true);

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

            promise = promise
                        .then(() => self.login.login(self.options.username, self.options.password)
                        .then(token => {
                            if (!token) throw new Error('Error during login, no token returned.');
                            self.options.authToken = token;
                        }));
        }

        if (self.options.useHashingServer) {
            promise = promise.then(self.initializeHashingServer);
        }

        if (self.options.appSimulation) {
            const ios = POGOProtos.Enums.Platform.IOS;
            const version = +self.options.version;
            promise = promise.then(() => self.batchStart().batchCall())
                        .then(() => self.getPlayer('US', 'en', 'Europe/Paris'))
                        .then(() => self.batchStart()
                                        .downloadRemoteConfigVersion(ios, '', '', '', version)
                                        .checkChallenge()
                                        .getHatchedEggs()
                                        .getInventory()
                                        .checkAwardedBadges()
                                        .downloadSettings()
                                        .batchCall());
        }

        return promise;
    };

    /**
     * Clean up ressources, like timer and token
     */
    this.cleanUp = function() {
        if (self.signatureGenerator) self.signatureGenerator.clean();
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
     * API CALLS (in order of RequestType enum)
     */

    this.getPlayer = function(country, language, timezone) {
        return self.callOrChain({
            type: RequestType.GET_PLAYER,
            message: RequestMessages.GetPlayerMessage.fromObject({
                player_locale: {
                    country: country,
                    language: language,
                    timezone: timezone
                }
            }),
            responseType: Responses.GetPlayerResponse
        });
    };

    this.getInventory = function(lastTimestamp) {
        return self.callOrChain({
            type: RequestType.GET_INVENTORY,
            message: RequestMessages.GetInventoryMessage.fromObject({
                last_timestamp_ms: lastTimestamp
            }),
            responseType: Responses.GetInventoryResponse
        });
    };

    this.downloadSettings = function(hash) {
        return self.callOrChain({
            type: RequestType.DOWNLOAD_SETTINGS,
            message: RequestMessages.DownloadSettingsMessage.fromObject({
                hash: hash
            }),
            responseType: Responses.DownloadSettingsResponse
        });
    };

    this.downloadItemTemplates = function(paginate, pageOffset, pageTimestamp) {
        return self.callOrChain({
            type: RequestType.DOWNLOAD_ITEM_TEMPLATES,
            message: RequestMessages.DownloadItemTemplatesMessage.fromObject({
                paginate: paginate,
                page_offset: pageOffset,
                page_timestamp: pageTimestamp
            }),
            responseType: Responses.DownloadItemTemplatesResponse
        });
    };

    this.downloadRemoteConfigVersion = function(platform, deviceManufacturer, deviceModel, locale, appVersion) {
        return self.callOrChain({
            type: RequestType.DOWNLOAD_REMOTE_CONFIG_VERSION,
            message: RequestMessages.DownloadRemoteConfigVersionMessage.fromObject({
                platform: platform,
                device_manufacturer: deviceManufacturer,
                device_model: deviceModel,
                locale: locale,
                app_version: appVersion,
            }),
            responseType: Responses.DownloadRemoteConfigVersionResponse
        });
    };

    this.registerBackgroundDevice = function(deviceType, deviceID) {
        return self.callOrChain({
            type: RequestType.REGISTER_BACKGROUND_DEVICE,
            message: RequestMessages.RegisterBackgroundDeviceMessage.fromObject({
                device_type: deviceType,
                device_id: deviceID
            }),
            responseType: Responses.RegisterBackgroundDeviceResponse
        });
    };

    this.fortSearch = function(fortID, fortLatitude, fortLongitude) {
        return self.callOrChain({
            type: RequestType.FORT_SEARCH,
            message: RequestMessages.FortSearchMessage.fromObject({
                fort_id: fortID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude,
                fort_latitude: fortLatitude,
                fort_longitude: fortLongitude
            }),
            responseType: Responses.FortSearchResponse
        });
    };

    this.encounter = function(encounterID, spawnPointID) {
        return self.callOrChain({
            type: RequestType.ENCOUNTER,
            message: RequestMessages.EncounterMessage.fromObject({
                encounter_id: encounterID,
                spawn_point_id: spawnPointID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.EncounterResponse
        });
    };

    this.catchPokemon = function(encounterID, pokeballItemID, normalizedReticleSize, spawnPointID, hitPokemon,
        spinModifier, normalizedHitPosition) {
        return self.callOrChain({
            type: RequestType.CATCH_POKEMON,
            message: RequestMessages.CatchPokemonMessage.fromObject({
                encounter_id: encounterID,
                pokeball: pokeballItemID,
                normalized_reticle_size: normalizedReticleSize,
                spawn_point_id: spawnPointID,
                hit_pokemon: hitPokemon,
                spin_modifier: spinModifier,
                normalized_hit_position: normalizedHitPosition
            }),
            responseType: Responses.CatchPokemonResponse
        });
    };

    this.fortDetails = function(fortID, fortLatitude, fortLongitude) {
        return self.callOrChain({
            type: RequestType.FORT_DETAILS,
            message: RequestMessages.FortDetailsMessage.fromObject({
                fort_id: fortID,
                latitude: fortLatitude,
                longitude: fortLongitude
            }),
            responseType: Responses.FortDetailsResponse
        });
    };

    this.getMapObjects = function(cellIDs, sinceTimestamps) {
        return self.callOrChain({
            type: RequestType.GET_MAP_OBJECTS,
            message: RequestMessages.GetMapObjectsMessage.fromObject({
                cell_id: cellIDs,
                since_timestamp_ms: sinceTimestamps,
                latitude: self.playerLatitude,
                longitude: self.playerLongitude
            }),
            responseType: Responses.GetMapObjectsResponse
        });
    };

    this.fortDeployPokemon = function(fortID, pokemonID) {
        return self.callOrChain({
            type: RequestType.FORT_DEPLOY_POKEMON,
            message: RequestMessages.FortDeployPokemonMessage.fromObject({
                fort_id: fortID,
                pokemon_id: pokemonID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.FortDeployPokemonResponse
        });
    };

    this.fortRecallPokemon = function(fortID, pokemonID) {
        return self.callOrChain({
            type: RequestType.FORT_RECALL_POKEMON,
            message: RequestMessages.FortRecallPokemonMessage.fromObject({
                fort_id: fortID,
                pokemon_id: pokemonID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.FortRecallPokemonResponse
        });
    };

    this.releasePokemon = function(pokemonIDs) {
        if (!Array.isArray(pokemonIDs)) pokemonIDs = [pokemonIDs];

        return self.callOrChain({
            type: RequestType.RELEASE_POKEMON,
            message: RequestMessages.ReleasePokemonMessage.fromObject({
                pokemon_id: pokemonIDs.length === 1 ? pokemonIDs[0] : undefined,
                pokemon_ids: pokemonIDs.length > 1 ? pokemonIDs : undefined
            }),
            responseType: Responses.ReleasePokemonResponse
        });
    };

    this.useItemPotion = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_POTION,
            message: RequestMessages.UseItemPotionMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemPotionResponse
        });
    };

    this.useItemCapture = function(itemID, encounterID, spawnPointID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_CAPTURE,
            message: RequestMessages.UseItemCaptureMessage.fromObject({
                item_id: itemID,
                encounter_id: encounterID,
                spawn_point_id: spawnPointID
            }),
            responseType: Responses.UseItemCaptureResponse
        });
    };

    this.useItemRevive = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_REVIVE,
            message: RequestMessages.UseItemReviveMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemReviveResponse
        });
    };

    this.getPlayerProfile = function(playerName) {
        return self.callOrChain({
            type: RequestType.GET_PLAYER_PROFILE,
            message: RequestMessages.GetPlayerProfileMessage.fromObject({
                player_name: playerName
            }),
            responseType: Responses.GetPlayerProfileResponse
        });
    };

    this.evolvePokemon = function(pokemonID, evolutionRequirementItemID) {
        return self.callOrChain({
            type: RequestType.EVOLVE_POKEMON,
            message: RequestMessages.EvolvePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                evolution_item_requirement: evolutionRequirementItemID
            }),
            responseType: Responses.EvolvePokemonResponse
        });
    };

    this.getHatchedEggs = function() {
        return self.callOrChain({
            type: RequestType.GET_HATCHED_EGGS,
            responseType: Responses.GetHatchedEggsResponse
        });
    };

    this.encounterTutorialComplete = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.ENCOUNTER_TUTORIAL_COMPLETE,
            message: RequestMessages.EncounterTutorialCompleteMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.EncounterTutorialCompleteResponse
        });
    };

    this.levelUpRewards = function(level) {
        return self.callOrChain({
            type: RequestType.LEVEL_UP_REWARDS,
            message: RequestMessages.LevelUpRewardsMessage.fromObject({
                level: level
            }),
            responseType: Responses.LevelUpRewardsResponse
        });
    };

    this.checkAwardedBadges = function() {
        return self.callOrChain({
            type: RequestType.CHECK_AWARDED_BADGES,
            responseType: Responses.CheckAwardedBadgesResponse
        });
    };

    this.useItemGym = function(itemID, gymID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_GYM,
            message: RequestMessages.UseItemGymMessage.fromObject({
                item_id: itemID,
                gym_id: gymID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.UseItemGymResponse
        });
    };

    this.getGymDetails = function(gymID, gymLatitude, gymLongitude, clientVersion) {
        return self.callOrChain({
            type: RequestType.GET_GYM_DETAILS,
            message: RequestMessages.GetGymDetailsMessage.fromObject({
                gym_id: gymID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude,
                gym_latitude: gymLatitude,
                gym_longitude: gymLongitude,
                client_version: clientVersion
            }),
            responseType: Responses.GetGymDetailsResponse
        });
    };

    this.recycleInventoryItem = function(itemID, count) {
        return self.callOrChain({
            type: RequestType.RECYCLE_INVENTORY_ITEM,
            message: RequestMessages.RecycleInventoryItemMessage.fromObject({
                item_id: itemID,
                count: count
            }),
            responseType: Responses.RecycleInventoryItemResponse
        });
    };

    this.collectDailyBonus = function() {
        return self.callOrChain({
            type: RequestType.COLLECT_DAILY_BONUS,
            responseType: Responses.CollectDailyBonusResponse
        });
    };

    this.useItemXPBoost = function(itemID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_XP_BOOST,
            message: RequestMessages.UseItemXpBoostMessage.fromObject({
                item_id: itemID
            }),
            responseType: Responses.UseItemXpBoostResponse
        });
    };

    this.useItemEggIncubator = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_EGG_INCUBATOR,
            message: RequestMessages.UseItemEggIncubatorMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemEggIncubatorResponse
        });
    };

    this.useIncense = function(itemID) {
        return self.callOrChain({
            type: RequestType.USE_INCENSE,
            message: RequestMessages.UseIncenseMessage.fromObject({
                incense_type: itemID
            }),
            responseType: Responses.UseIncenseResponse
        });
    };

    this.getIncensePokemon = function() {
        return self.callOrChain({
            type: RequestType.GET_INCENSE_POKEMON,
            message: RequestMessages.GetIncensePokemonMessage.fromObject({
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.GetIncensePokmeonResponse
        });
    };

    this.incenseEncounter = function(encounterID, encounterLocation) {
        return self.callOrChain({
            type: RequestType.INCENSE_ENCOUNTER,
            message: RequestMessages.IncenseEncounterMessage.fromObject({
                encounter_id: encounterID,
                encounter_location: encounterLocation
            }),
            responseType: Responses.IncenseEncounterResponse
        });
    };

    this.addFortModifier = function(modifierItemID, fortID) {
        return self.callOrChain({
            type: RequestType.ADD_FORT_MODIFIER,
            message: RequestMessages.AddFortModifierMessage.fromObject({
                modifier_type: modifierItemID,
                fort_id: fortID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            })
        });
    };

    this.diskEncounter = function(encounterID, fortID) {
        return self.callOrChain({
            type: RequestType.DISK_ENCOUNTER,
            message: RequestMessages.DiskEncounterMessage.fromObject({
                encounter_id: encounterID,
                fort_id: fortID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.DiskEncounterResponse
        });
    };

    this.collectDailyDefenderBonus = function() {
        return self.callOrChain({
            type: RequestType.COLLECT_DAILY_DEFENDER_BONUS,
            responseType: Responses.CollectDailyDefenderBonusResponse
        });
    };

    this.upgradePokemon = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.UPGRADE_POKEMON,
            message: RequestMessages.UpgradePokemonMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.UpgradePokemonResponse
        });
    };

    this.setFavoritePokemon = function(pokemonID, isFavorite) {
        return self.callOrChain({
            type: RequestType.SET_FAVORITE_POKEMON,
            message: RequestMessages.SetFavoritePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                is_favorite: isFavorite
            }),
            responseType: Responses.SetFavoritePokemonResponse
        });
    };

    this.nicknamePokemon = function(pokemonID, nickname) {
        return self.callOrChain({
            type: RequestType.NICKNAME_POKEMON,
            message: RequestMessages.NicknamePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                nickname: nickname
            }),
            responseType: Responses.NicknamePokemonResponse
        });
    };

    this.equipBadge = function(badgeType) {
        return self.callOrChain({
            type: RequestType.EQUIP_BADGE,
            message: RequestMessages.EquipBadgeMessage.fromObject({
                badge_type: badgeType
            }),
            responseType: Responses.EquipBadgeResponse
        });
    };

    this.setContactSettings = function(sendMarketingEmails, sendPushNotifications) {
        return self.callOrChain({
            type: RequestType.SET_CONTACT_SETTINGS,
            message: RequestMessages.SetContactSettingsMessage.fromObject({
                contact_settings: {
                    send_marketing_emails: sendMarketingEmails,
                    send_push_notifications: sendPushNotifications
                }
            }),
            responseType: Responses.SetContactSettingsResponse
        });
    };

    this.setBuddyPokemon = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.SET_BUDDY_POKEMON,
            message: RequestMessages.SetBuddyPokemonMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.SetBuddyPokemonResponse
        });
    };

    this.getBuddyWalked = function() {
        return self.callOrChain({
            type: RequestType.GET_BUDDY_WALKED,
            responseType: Responses.GetBuddyWalkedResponse
        });
    };

    this.useItemEncounter = function(itemID, encounterID, spawnPointGUID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_ENCOUNTER,
            message: RequestMessages.UseItemEncounterMessage.fromObject({
                item: itemID,
                encounter_id: encounterID,
                spawn_point_guid: spawnPointGUID
            }),
            responseType: Responses.UseItemEncounterResponse
        });
    };

    this.gymGetInfo = function(gymId, gymLat, gymLng) {
        return self.callOrChain({
            type: RequestType.GYM_GET_INFO,
            message: RequestMessages.GymGetInfoMessage.fromObject({
	            gym_id: gymId,
	            player_lat_degrees: self.playerLatitude,
	            player_lng_degrees: self.playerLatitude,
	            gym_lat_degrees: gymLat,
	            gym_lng_degrees: gymLng,
            }),
            responseType: Responses.GymGetInfoResponse
        });
    };

    this.getAssetDigest = function(platform, deviceManufacturer, deviceModel, locale, appVersion,
                                    paginate, pageOffset, pageTimestamp) {
        return self.callOrChain({
            type: RequestType.GET_ASSET_DIGEST,
            message: RequestMessages.GetAssetDigestMessage.fromObject({
                platform: platform,
                device_manufacturer: deviceManufacturer,
                device_model: deviceModel,
                locale: locale,
                app_version: appVersion,
                paginate: paginate,
                page_offset: pageOffset,
                page_timestamp: pageTimestamp,
            }),
            responseType: Responses.GetAssetDigestResponse
        });
    };

    this.getDownloadURLs = function(assetIDs) {
        return self.callOrChain({
            type: RequestType.GET_DOWNLOAD_URLS,
            message: RequestMessages.GetDownloadUrlsMessage.fromObject({
                asset_id: assetIDs
            }),
            responseType: Responses.GetDownloadUrlsResponse
        });
    };

    this.claimCodename = function(codename, force) {
        return self.callOrChain({
            type: RequestType.CLAIM_CODENAME,
            message: RequestMessages.ClaimCodenameMessage.fromObject({
                codename: codename,
                force: force,
            }),
            responseType: Responses.ClaimCodenameResponse
        });
    };

    this.setAvatar = function(playerAvatar) {
        return self.callOrChain({
            type: RequestType.SET_AVATAR,
            message: RequestMessages.SetAvatarMessage.fromObject({
                player_avatar: playerAvatar
            }),
            responseType: Responses.SetAvatarResponse
        });
    };

    this.setPlayerTeam = function(teamColor) {
        return self.callOrChain({
            type: RequestType.SET_PLAYER_TEAM,
            message: RequestMessages.SetPlayerTeamMessage.fromObject({
                team: teamColor
            }),
            responseType: Responses.SetPlayerTeamResponse
        });
    };

    this.markTutorialComplete = function(tutorialsCompleted, sendMarketingEmails, sendPushNotifications) {
        return self.callOrChain({
            type: RequestType.MARK_TUTORIAL_COMPLETE,
            message: RequestMessages.MarkTutorialCompleteMessage.fromObject({
                tutorials_completed: tutorialsCompleted,
                send_marketing_emails: sendMarketingEmails,
                send_push_notifications: sendPushNotifications
            }),
            responseType: Responses.MarkTutorialCompleteResponse
        });
    };

    this.checkChallenge = function(isDebugRequest) {
        return self.callOrChain({
            type: RequestType.CHECK_CHALLENGE,
            message: RequestMessages.CheckChallengeMessage.fromObject({
                debug_request: isDebugRequest
            }),
            responseType: Responses.CheckChallengeResponse
        });
    };

    this.verifyChallenge = function(token) {
        return self.callOrChain({
            type: RequestType.VERIFY_CHALLENGE,
            message: RequestMessages.VerifyChallengeMessage.fromObject({
                token: token
            }),
            responseType: Responses.VerifyChallengeResponse
        });
    };

    this.echo = function() {
        return self.callOrChain({
            type: RequestType.ECHO,
            responseType: Responses.EchoResponse
        });
    };

    this.sfidaActionLog = function() {
        return self.callOrChain({
            type: RequestType.SFIDA_ACTION_LOG,
            responseType: Responses.SfidaActionLogResponse
        });
    };

    this.listAvatarCustomizations = function(avatarType, slots, filters, start, limit) {
        return self.callOrChain({
            type: RequestType.LIST_AVATAR_CUSTOMIZATIONS,
            message: RequestMessages.ListAvatarCustomizationsMessage.fromObject({
                avatar_type: avatarType,
                slot: slots,
                filters: filters,
                start: start,
                limit: limit
            }),
            responseType: Responses.ListAvatarCustomizationsResponse
        });
    };

    this.setAvatarItemAsViewed = function(avatarTemplateIDs) {
        return self.callOrChain({
            type: RequestType.SET_AVATAR_ITEM_AS_VIEWED,
            message: RequestMessages.SetAvatarItemAsViewedMessage.fromObject({
                avatar_template_id: avatarTemplateIDs
            }),
            responseType: Responses.SetAvatarItemAsViewdResponse
        });
    };

    this.getInbox = function(isHistory, isReverse, notBefore) {
        return self.callOrChain({
            type: RequestType.GET_INBOX,
            message: RequestMessages.GetInboxMessage.fromObject({
                is_history: isHistory,
                is_reverse: isReverse,
                not_before_ms: notBefore,
            }),
            responseType: Responses.GetInboxResponse
        });
    };

    this.updateNotificationStatus = function(notificationIds, createTimestampMs, state) {
        return self.callOrChain({
            type: RequestType.UPDATE_NOTIFICATION_STATUS,
            message: RequestMessages.UpdateNotificationMessage.fromObject({
                notification_ids: notificationIds,
                create_timestamp_ms: createTimestampMs,
                state: state,
            }),
            responseType: Responses.UpdateNotificationResponse
        });
    };

    this.listGymBadges = function() {
        return self.callOrChain({
            type: RequestType.LIST_GYM_BADGES,
            responseType: Responses.ListGymBadgesResponse
        });
    };
    
    this.getGymBadgeDetails = function(fortId, latitude, longitude) {
        return self.callOrChain({
            type: RequestType.GET_GYM_BADGE_DETAILS,
            message: RequestMessages.GetGymBadgeDetailsMessage.fromObject({
                fort_id: fortId,
                latitude: latitude,
                longitude: longitude,
            }),
            responseType: Responses.GetGymBadgeDetailsResponse
        });
    };

    /*
     * Platform Client Actions
     */
    this.registerPushNotification = function(apnToken, gcmToken) {
        return self.callOrChain({
            type: RequestType.REGISTER_PUSH_NOTIFICATION,
            message: RequestMessages.RegisterPushNotificationMessage.fromObject({
                apn_token: apnToken,
                gcm_token: gcmToken,
            }),
            responseType: Responses.RegisterPushNotificationResponse
        });
    };

    this.optOutPushNotificationCategory = function(categories) {
        if (!Array.isArray(categories)) categories = [categories];
        return self.callOrChain({
            type: RequestType.OPT_OUT_PUSH_NOTIFICATION_CATEGORY,
            message: RequestMessages.OptOutPushNotificationCategoryMessage.fromObject({
                categories: categories,
            }),
            responseType: Responses.OptOutPushNotificationCategoryResponse
        });
    };

    /*
     * Advanced user only
     */
    this.batchAddPlatformRequest = function(type, message) {
        if (!self.batchPftmRequests) self.batchPftmRequests = [];
        
        self.batchPftmRequests.push({ 
            type: type,
            message: message,
        });
    }

    /*
     * INTERNAL STUFF
     */

    this.request = request.defaults({
        headers: {
            'User-Agent': 'Niantic App',
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Language': 'en-us',
        },
        gzip: true,
        encoding: null,
    });
    Promise.promisifyAll(this.request);

    this.options = Object.assign({}, defaultOptions, options || {});
    this.authTicket = null;
    this.rpcId = 2;
    this.lastHashingKeyIndex = 0;
    this.firstGetMapObjects = true;
    this.lehmer = new Lehmer(16807);
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
        return new Long(self.rpcId++, this.lehmer.nextInt());
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
     * @return {POGOProtos.Networking.Envelopes.RequestEnvelope}
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
     * @param {RequestEnvelope} envelope - Request envelope
     * @param {PlatformRequestType} requestType - Type of the platform request to add
     * @param {Object} requestMessage - Pre-built but not encoded PlatformRequest protobuf message
     * @return {RequestEnvelope} The envelope (for convenience only)
     */
    this.addPlatformRequestToEnvelope = function(envelope, requestType, requestMessage) {
        let encoded = encode(requestMessage);
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
     * @param {RequestEnvelope} [envelope] - Pre-built request envelope to sign
     * @return {Promise} - A Promise that will be resolved with a RequestEnvelope instance
     */
    this.buildSignedEnvelope = function(requests, envelope) {
        if (!envelope) {
            try {
                envelope = self.buildEnvelope(requests);
            } catch (e) {
                throw new retry.StopError(e);
            }
        }

        if (self.needsPtr8(requests)) {
            self.addPlatformRequestToEnvelope(envelope, PlatformRequestType.UNKNOWN_PTR_8,
                PlatformRequestMessages.UnknownPtr8Request.fromObject({
                    message: self.ptr8,
                }));
        }

        if (self.batchPftmRequests && self.batchPftmRequests.length > 0) {
            for (let i = 0; i < self.batchPftmRequests.length; i++) {
                let ptfm = self.batchPftmRequests[i];
                self.addPlatformRequestToEnvelope(envelope, ptfm.type, ptfm.message);
            }
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

        return retry(() => self.signatureEncryption.encryptAsync(envelope.requests)
                        .catch(err => {
                            if (err.name === 'HashServerError' && err.retry) {
                                throw err;
                            } else {
                                throw new retry.StopError(err);
                            }
                        }),
            {
                interval: 1000,
                backoff: 2,
                max_tries: 5,
                args: envelope.requests,
            })
            .then(sigEncrypted =>
                self.addPlatformRequestToEnvelope(envelope, PlatformRequestType.SEND_ENCRYPTED_SIGNATURE,
                    PlatformRequestMessages.SendEncryptedSignatureRequest.fromObject({
                        encrypted_signature: sigEncrypted
                    })
                )
            );
    };

    /**
     * Handle redirection to new API endpoint and resend last request to new endpoint.
     * @private
     * @param {Object[]} requests - Array of requests
     * @param {RequestEnvelope} signedEnvelope - Request envelope
     * @param {ResponseEnvelope} responseEnvelope - Result from API call
     * @return {Promise}
     */
    this.redirect = function(requests, signedEnvelope, responseEnvelope) {
        return new Promise((resolve, reject) => {
            if (!responseEnvelope.api_url) {
                reject(Error('Fetching RPC endpoint failed, none supplied in response'));
                return;
            }

            self.endpoint = 'https://' + responseEnvelope.api_url + '/rpc';

            signedEnvelope.platform_requests = [];
            resolve(self.callRPC(requests, signedEnvelope));
        });
    };

    /**
     * Executes an RPC call with the given list of requests, retrying if necessary.
     * @private
     * @param {Object[]} requests - Array of requests to send
     * @param {RequestEnvelope} [envelope] - Pre-built request envelope to use
     * @return {Promise} - A Promise that will be resolved with the (list of) response messages,
     *     or true if there aren't any
     */
    this.callRPC = function(requests, envelope) {
        if (self.options.maxTries <= 1) return self.tryCallRPC(requests, envelope);

        return retry(() => self.tryCallRPC(requests, envelope), {
            interval: 300,
            backoff: 2,
            max_tries: self.options.maxTries
        });
    };

    /**
     * Executes an RPC call with the given list of requests.
     * @private
     * @param {Object[]} requests - Array of requests to send
     * @param {RequestEnvelope} [envelope] - Pre-built request envelope to use
     * @return {Promise} - A Promise that will be resolved with the (list of) response messages,
     *     or true if there aren't any
     */
    this.tryCallRPC = function(requests, envelope) {
        return self.buildSignedEnvelope(requests, envelope)
            .then(signedEnvelope =>
                self.request.postAsync({
                    url: self.endpoint,
                    proxy: self.options.proxy,
                    body: encode(signedEnvelope),
                })
                .then(response => ({ signedEnvelope: signedEnvelope, response: response }))
            )
            .then(result => {
                const signedEnvelope = result.signedEnvelope;
                const response = result.response;
                if (response.statusCode !== 200) {
                    if (response.statusCode >= 400 && response.statusCode < 500) {
                        /* These are permanent errors so throw StopError */
                        throw new retry.StopError(
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
                    responseEnvelope =
                        POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(response.body);
                } catch (e) {
                    if (e.decoded) {
                        responseEnvelope = e.decoded;
                    } else {
                        throw new retry.StopError(e);
                    }
                }

                if (responseEnvelope.error) {
                    throw new retry.StopError(responseEnvelope.error);
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
                    signedEnvelope.platform_requests = [];
                    self.login.reset();
                    return self.login
                                .login(self.options.username, self.options.password)
                                .then(token => {
                                    self.options.authToken = token;
                                    self.authTicket = null;
                                    signedEnvelope.auth_ticket = null;
                                    signedEnvelope.auth_info = this.getAuthInfoObject();
                                    return self.callRPC(requests, signedEnvelope);
                                });
                }

                /* Throttling, retry same request later */
                if (responseEnvelope.status_code === 52 && self.endpoint !== INITIAL_ENDPOINT) {
                    signedEnvelope.platform_requests = [];
                    return Promise.delay(2000).then(() => self.callRPC(requests, signedEnvelope));
                }

                /* These codes indicate invalid input, no use in retrying so throw StopError */
                if (responseEnvelope.status_code === 3 || responseEnvelope.status_code === 51 ||
                    responseEnvelope.status_code >= 100) {
                    throw new retry.StopError(
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
                            throw new retry.StopError(e);
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
                            store._requestType = -1,
                            store._ptfmRequestType = PlatformRequestType.GET_STORE_ITEMS,
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
            });
    };

    /**
     * Makes an initial call to the hashing server to verify API version.
     * @private
     * @return {Promise}
     */
    this.initializeHashingServer = function() {
        if (!self.options.hashingServer) throw new Error('Hashing server enabled without host');
        if (!self.options.hashingKey) throw new Error('Hashing server enabled without key');

        if (self.options.hashingServer.slice(-1) !== '/') {
            self.setOption('hashingServer', self.options.hashingServer + '/');
        }

        let version = self.options.version;
        // hack because bossland doesn't want to update their endpoint...
        if (+version === 6304) version = 6301;
        return Signature.versions.getHashingEndpoint(self.options.hashingServer, version)
                .then(version => {
                    self.hashingVersion = version;
                });
    };

    /*
     * DEPRECATED METHODS
     */

    /**
     * Sets the authType and authToken options.
     * @deprecated Use options object or setOption() instead
     * @param {string} authType
     * @param {string} authToken
     */
    this.setAuthInfo = function(authType, authToken) {
        self.setOption('authType', authType);
        self.setOption('authToken', authToken);
    };

    /**
     * Sets the includeRequestTypeInResponse option.
     * @deprecated Use options object or setOption() instead
     * @param {bool} includeRequestTypeInResponse
     */
    this.setIncludeRequestTypeInResponse = function(includeRequestTypeInResponse) {
        self.setOption('includeRequestTypeInResponse', includeRequestTypeInResponse);
    };

    /**
     * Sets the maxTries option.
     * @deprecated Use options object or setOption() instead
     * @param {integer} maxTries
     */
    this.setMaxTries = function(maxTries) {
        self.setOption('maxTries', maxTries);
    };

    /**
     * Sets the proxy option.
     * @deprecated Use options object or setOption() instead
     * @param {string} proxy
     */
    this.setProxy = function(proxy) {
        self.setOption('proxy', proxy);
    };

    /**
     * Sets the automaticLongConversion option.
     * @deprecated Use options object or setOption() instead
     * @param {boolean} enable
     */
    this.setAutomaticLongConversionEnabled = function(enable) {
        if (typeof enable !== 'boolean') return;
        self.setOption('automaticLongConversion', enable);
    };
}

module.exports = Client;
