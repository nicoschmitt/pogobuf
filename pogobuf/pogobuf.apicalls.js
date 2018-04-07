const POGOProtos = require('node-pogo-protos-vnext');
const RequestType = POGOProtos.Networking.Requests.RequestType;
const RequestMessages = POGOProtos.Networking.Requests.Messages;
const Responses = POGOProtos.Networking.Responses;

module.exports.defineApiCalls = function(self) {
    self.getPlayer = function(country, language, timezone) {
        return self.callOrChain({
            type: RequestType.GET_PLAYER,
            message: RequestMessages.GetPlayerMessage.fromObject({
                player_locale: {
                    country,
                    language,
                    timezone
                },
            }),
            responseType: Responses.GetPlayerResponse
        });
    };

    self.getInventory = function(lastTimestamp) {
        return self.callOrChain({
            type: RequestType.GET_HOLO_INVENTORY,
            message: RequestMessages.GetHoloInventoryMessage.fromObject({
                last_timestamp_ms: lastTimestamp
            }),
            responseType: Responses.GetHoloInventoryResponse
        });
    };

    self.downloadSettings = function(hash) {
        return self.callOrChain({
            type: RequestType.DOWNLOAD_SETTINGS,
            message: RequestMessages.DownloadSettingsMessage.fromObject({
                hash,
            }),
            responseType: Responses.DownloadSettingsResponse
        });
    };

    self.downloadItemTemplates = function(paginate, pageOffset, pageTimestamp) {
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

    self.downloadRemoteConfigVersion = function(platform, deviceManufacturer, deviceModel, locale, appVersion) {
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

    self.registerBackgroundDevice = function(deviceType, deviceID) {
        return self.callOrChain({
            type: RequestType.REGISTER_BACKGROUND_DEVICE,
            message: RequestMessages.RegisterBackgroundDeviceMessage.fromObject({
                device_type: deviceType,
                device_id: deviceID
            }),
            responseType: Responses.RegisterBackgroundDeviceResponse
        });
    };

    self.fortSearch = function(fortID, fortLatitude, fortLongitude) {
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

    self.encounter = function(encounterID, spawnPointID) {
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

    self.catchPokemon = function(
        encounterID, pokeballItemID, normalizedReticleSize, spawnPointID, hitPokemon,
        spinModifier, normalizedHitPosition
    ) {
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

    self.fortDetails = function(fortID, fortLatitude, fortLongitude) {
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

    self.getMapObjects = function(cellIDs, sinceTimestamps) {
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

    self.fortDeployPokemon = function(fortID, pokemonID) {
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

    self.fortRecallPokemon = function(fortID, pokemonID) {
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

    self.releasePokemon = function(pokemonIDs) {
        if (!pokemonIDs) pokemonIDs = [];
        else if (!Array.isArray(pokemonIDs)) pokemonIDs = [pokemonIDs];
        return self.callOrChain({
            type: RequestType.RELEASE_POKEMON,
            message: RequestMessages.ReleasePokemonMessage.fromObject({
                pokemon_id: pokemonIDs.length === 1 ? pokemonIDs[0] : undefined,
                pokemon_ids: pokemonIDs.length > 1 ? pokemonIDs : undefined
            }),
            responseType: Responses.ReleasePokemonResponse
        });
    };

    self.useItemPotion = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_POTION,
            message: RequestMessages.UseItemPotionMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemPotionResponse
        });
    };

    self.useItemCapture = function(itemID, encounterID, spawnPointID) {
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

    self.useItemRevive = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_REVIVE,
            message: RequestMessages.UseItemReviveMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemReviveResponse
        });
    };

    self.getPlayerProfile = function(playerName) {
        return self.callOrChain({
            type: RequestType.GET_PLAYER_PROFILE,
            message: RequestMessages.GetPlayerProfileMessage.fromObject({
                player_name: playerName
            }),
            responseType: Responses.GetPlayerProfileResponse
        });
    };

    self.evolvePokemon = function(pokemonID, evolutionRequirementItemID) {
        return self.callOrChain({
            type: RequestType.EVOLVE_POKEMON,
            message: RequestMessages.EvolvePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                evolution_item_requirement: evolutionRequirementItemID
            }),
            responseType: Responses.EvolvePokemonResponse
        });
    };

    self.getHatchedEggs = function() {
        return self.callOrChain({
            type: RequestType.GET_HATCHED_EGGS,
            responseType: Responses.GetHatchedEggsResponse
        });
    };

    self.encounterTutorialComplete = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.ENCOUNTER_TUTORIAL_COMPLETE,
            message: RequestMessages.EncounterTutorialCompleteMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.EncounterTutorialCompleteResponse
        });
    };

    self.levelUpRewards = function(level) {
        return self.callOrChain({
            type: RequestType.LEVEL_UP_REWARDS,
            message: RequestMessages.LevelUpRewardsMessage.fromObject({
                level: level
            }),
            responseType: Responses.LevelUpRewardsResponse
        });
    };

    self.checkAwardedBadges = function() {
        return self.callOrChain({
            type: RequestType.CHECK_AWARDED_BADGES,
            responseType: Responses.CheckAwardedBadgesResponse
        });
    };

    self.useItemGym = function(itemID, gymID) {
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

    self.getGymDetails = function(gymID, gymLatitude, gymLongitude, clientVersion) {
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

    self.recycleInventoryItem = function(itemID, count) {
        return self.callOrChain({
            type: RequestType.RECYCLE_INVENTORY_ITEM,
            message: RequestMessages.RecycleInventoryItemMessage.fromObject({
                item_id: itemID,
                count: count
            }),
            responseType: Responses.RecycleInventoryItemResponse
        });
    };

    self.collectDailyBonus = function() {
        return self.callOrChain({
            type: RequestType.COLLECT_DAILY_BONUS,
            responseType: Responses.CollectDailyBonusResponse
        });
    };

    self.useItemXPBoost = function(itemID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_XP_BOOST,
            message: RequestMessages.UseItemXpBoostMessage.fromObject({
                item_id: itemID
            }),
            responseType: Responses.UseItemXpBoostResponse
        });
    };

    self.useItemEggIncubator = function(itemID, pokemonID) {
        return self.callOrChain({
            type: RequestType.USE_ITEM_EGG_INCUBATOR,
            message: RequestMessages.UseItemEggIncubatorMessage.fromObject({
                item_id: itemID,
                pokemon_id: pokemonID
            }),
            responseType: Responses.UseItemEggIncubatorResponse
        });
    };

    self.useIncense = function(itemID) {
        return self.callOrChain({
            type: RequestType.USE_INCENSE,
            message: RequestMessages.UseIncenseMessage.fromObject({
                incense_type: itemID
            }),
            responseType: Responses.UseIncenseResponse
        });
    };

    self.getIncensePokemon = function() {
        return self.callOrChain({
            type: RequestType.GET_INCENSE_POKEMON,
            message: RequestMessages.GetIncensePokemonMessage.fromObject({
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.GetIncensePokmeonResponse
        });
    };

    self.incenseEncounter = function(encounterID, encounterLocation) {
        return self.callOrChain({
            type: RequestType.INCENSE_ENCOUNTER,
            message: RequestMessages.IncenseEncounterMessage.fromObject({
                encounter_id: encounterID,
                encounter_location: encounterLocation
            }),
            responseType: Responses.IncenseEncounterResponse
        });
    };

    self.addFortModifier = function(modifierItemID, fortID) {
        return self.callOrChain({
            type: RequestType.ADD_FORT_MODIFIER,
            message: RequestMessages.AddFortModifierMessage.fromObject({
                modifier_type: modifierItemID,
                fort_id: fortID,
                player_latitude: self.playerLatitude,
                player_longitude: self.playerLongitude
            }),
            responseType: Responses.AddFortModifierResponse
        });
    };

    self.diskEncounter = function(encounterID, fortID) {
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

    self.collectDailyDefenderBonus = function() {
        return self.callOrChain({
            type: RequestType.COLLECT_DAILY_DEFENDER_BONUS,
            responseType: Responses.CollectDailyDefenderBonusResponse
        });
    };

    self.upgradePokemon = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.UPGRADE_POKEMON,
            message: RequestMessages.UpgradePokemonMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.UpgradePokemonResponse
        });
    };

    self.setFavoritePokemon = function(pokemonID, isFavorite) {
        return self.callOrChain({
            type: RequestType.SET_FAVORITE_POKEMON,
            message: RequestMessages.SetFavoritePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                is_favorite: isFavorite
            }),
            responseType: Responses.SetFavoritePokemonResponse
        });
    };

    self.nicknamePokemon = function(pokemonID, nickname) {
        return self.callOrChain({
            type: RequestType.NICKNAME_POKEMON,
            message: RequestMessages.NicknamePokemonMessage.fromObject({
                pokemon_id: pokemonID,
                nickname: nickname
            }),
            responseType: Responses.NicknamePokemonResponse
        });
    };

    self.equipBadge = function(badgeType) {
        return self.callOrChain({
            type: RequestType.EQUIP_BADGE,
            message: RequestMessages.EquipBadgeMessage.fromObject({
                badge_type: badgeType
            }),
            responseType: Responses.EquipBadgeResponse
        });
    };

    self.setContactSettings = function(sendMarketingEmails, sendPushNotifications) {
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

    self.setBuddyPokemon = function(pokemonID) {
        return self.callOrChain({
            type: RequestType.SET_BUDDY_POKEMON,
            message: RequestMessages.SetBuddyPokemonMessage.fromObject({
                pokemon_id: pokemonID
            }),
            responseType: Responses.SetBuddyPokemonResponse
        });
    };

    self.getBuddyWalked = function() {
        return self.callOrChain({
            type: RequestType.GET_BUDDY_WALKED,
            responseType: Responses.GetBuddyWalkedResponse
        });
    };

    self.useItemEncounter = function(itemID, encounterID, spawnPointGUID) {
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

    self.gymGetInfo = function(gymId, gymLat, gymLng) {
        return self.callOrChain({
            type: RequestType.GYM_GET_INFO,
            message: RequestMessages.GymGetInfoMessage.fromObject({
                gym_id: gymId,
                player_lat_degrees: self.playerLatitude,
                player_lng_degrees: self.playerLongitude,
                gym_lat_degrees: gymLat,
                gym_lng_degrees: gymLng,
            }),
            responseType: Responses.GymGetInfoResponse
        });
    };

    self.getRaidDetails = function(raidSeed, gymId, lobbyIds) {
        if (!lobbyIds) lobbyIds = [];
        else if (!Array.isArray(lobbyIds)) lobbyIds = [lobbyIds];
        return self.callOrChain({
            type: RequestType.GET_RAID_DETAILS,
            message: RequestMessages.GetRaidDetailsMessage.fromObject({
                raid_seed: raidSeed,
                gym_id: gymId,
                lobby_id: lobbyIds,
                player_lat_degrees: self.playerLatitude,
                player_lng_degrees: self.playerLongitude,
            }),
            responseType: Responses.GetRaidDetailsResponse,
        });
    };

    self.getAssetDigest = function(
        platform, deviceManufacturer, deviceModel, locale, appVersion,
        paginate, pageOffset, pageTimestamp
    ) {
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

    self.getDownloadURLs = function(assetIDs) {
        return self.callOrChain({
            type: RequestType.GET_DOWNLOAD_URLS,
            message: RequestMessages.GetDownloadUrlsMessage.fromObject({
                asset_id: assetIDs
            }),
            responseType: Responses.GetDownloadUrlsResponse
        });
    };

    self.claimCodename = function(codename, force) {
        return self.callOrChain({
            type: RequestType.CLAIM_CODENAME,
            message: RequestMessages.ClaimCodenameMessage.fromObject({
                codename: codename,
                force: force,
            }),
            responseType: Responses.ClaimCodenameResponse
        });
    };

    self.setAvatar = function(playerAvatar) {
        return self.callOrChain({
            type: RequestType.SET_AVATAR,
            message: RequestMessages.SetAvatarMessage.fromObject({
                player_avatar: playerAvatar
            }),
            responseType: Responses.SetAvatarResponse
        });
    };

    self.setPlayerTeam = function(teamColor) {
        return self.callOrChain({
            type: RequestType.SET_PLAYER_TEAM,
            message: RequestMessages.SetPlayerTeamMessage.fromObject({
                team: teamColor
            }),
            responseType: Responses.SetPlayerTeamResponse
        });
    };

    self.markTutorialComplete = function(tutorialsCompleted, sendMarketingEmails, sendPushNotifications) {
        if (!Array.isArray(tutorialsCompleted)) tutorialsCompleted = [tutorialsCompleted];
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

    self.checkChallenge = function(isDebugRequest) {
        return self.callOrChain({
            type: RequestType.CHECK_CHALLENGE,
            message: RequestMessages.CheckChallengeMessage.fromObject({
                debug_request: isDebugRequest
            }),
            responseType: Responses.CheckChallengeResponse
        });
    };

    self.verifyChallenge = function(token) {
        return self.callOrChain({
            type: RequestType.VERIFY_CHALLENGE,
            message: RequestMessages.VerifyChallengeMessage.fromObject({
                token: token
            }),
            responseType: Responses.VerifyChallengeResponse
        });
    };

    self.echo = function() {
        return self.callOrChain({
            type: RequestType.ECHO,
            responseType: Responses.EchoResponse
        });
    };

    self.sfidaActionLog = function() {
        return self.callOrChain({
            type: RequestType.SFIDA_ACTION_LOG,
            responseType: Responses.SfidaActionLogResponse
        });
    };

    self.listAvatarCustomizations = function(avatarType, slots, filters, start, limit) {
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

    self.setAvatarItemAsViewed = function(avatarTemplateIDs) {
        return self.callOrChain({
            type: RequestType.SET_AVATAR_ITEM_AS_VIEWED,
            message: RequestMessages.SetAvatarItemAsViewedMessage.fromObject({
                avatar_template_id: avatarTemplateIDs
            }),
            responseType: Responses.SetAvatarItemAsViewdResponse
        });
    };

    self.getInbox = function(isHistory, isReverse, notBefore) {
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

    self.updateNotificationStatus = function(notificationIds, createTimestampMs, state) {
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

    self.listGymBadges = function() {
        return self.callOrChain({
            type: RequestType.LIST_GYM_BADGES,
            responseType: Responses.ListGymBadgesResponse
        });
    };

    self.getGymBadgeDetails = function(fortId, latitude, longitude) {
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

    self.fetchAllNews = function() {
        return self.callOrChain({
            type: RequestType.FETCH_ALL_NEWS,
            responseType: Responses.FetchAllNewsResponse,
        });
    };

    self.markReadNewsArticle = function(newsIds) {
        return self.callOrChain({
            type: RequestType.MARK_READ_NEWS_ARTICLE,
            message: RequestMessages.MarkReadNewsArticleMessage.fromObject({
                news_ids: newsIds,
            }),
            responseType: Responses.MarkReadNewsArticleResponse,
        });
    };

    self.getNewQuests = function() {
        return self.callOrChain({
            type: RequestType.GET_NEW_QUESTS,
            responseType: Responses.GetNewQuestsResponse,
        });
    };

    self.getQuestDetails = function(questIds) {
        return self.callOrChain({
            type: RequestType.GET_QUEST_DETAILS,
            message: RequestMessages.GetQuestDetailsMessage.fromObject({
                quest_id: questIds,
            }),
            responseType: Responses.GetQuestDetailsResponse,
        });
    }

    /*
     * Platform Client Actions
     */
    self.optOutPushNotificationCategory = function(categories) {
        if (!categories) categories = [];
        else if (!Array.isArray(categories)) categories = [categories];
        return self.callOrChain({
            type: RequestType.OPT_OUT_PUSH_NOTIFICATION_CATEGORY,
            message: RequestMessages.OptOutPushNotificationCategoryMessage.fromObject({
                categories: categories,
            }),
            responseType: Responses.OptOutPushNotificationCategoryResponse
        });
    };

    self.registerPushNotification = function(apnToken, gcmToken) {
        return self.callOrChain({
            type: RequestType.REGISTER_PUSH_NOTIFICATION,
            message: RequestMessages.RegisterPushNotificationMessage.fromObject({
                apn_token: apnToken,
                gcm_token: gcmToken,
            }),
            responseType: Responses.RegisterPushNotificationResponse
        });
    };

    /*
     * Advanced user only
     */
    self.batchAddPlatformRequest = function(type, message) {
        if (!self.batchPftmRequests) self.batchPftmRequests = [];
        self.batchPftmRequests.push({
            type: type,
            message: message,
        });
        return self;
    };
};
