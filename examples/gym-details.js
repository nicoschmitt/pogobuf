'use strict';

/*
    This example script performs a sequence of actions:

    1. Geocode an address to get latitude and longitude
    2. Login to Pokémon Trainer Club account
    3. Retrieve nearby map objects
    4. Retrieve detailed data for all gyms in the area
    5. Display information about each gym

    It shows how to use the pogobuf library to perform requests and work with the returned data.
    This is not using a proper flow that mimic the app but it show how to use the lib

    In addition to pogobuf, this example requires the npm package node-geocoder and lodash.
    async/await requires node > 7.6
*/

const pogobuf = require('pogobuf-vnext');
const POGOProtos = require('node-pogo-protos-vnext');
const nodeGeocoder = require('node-geocoder');
const _ = require('lodash');

const RequestType = POGOProtos.Networking.Requests.RequestType;

async function Main() {
    let location = await nodeGeocoder().geocode('Invalides, Paris');
    if (!location.length) throw new Error('Location not found.');

    var coords = { 
        latitude: location[0].latitude, 
        longitude: location[0].longitude,
        altitude: _.random(0, 20, true),
    };

    let client = new pogobuf.Client({
        authType: 'ptc',
        username: 'ptc user name', 
        password: 'ptc password',
        useHashingServer: true,
        hashingKey: 'your hashing key',
        version: 6701,
        includeRequestTypeInResponse: true,
    });

    // set player position
    client.setPosition(coords);

    // init the app
    await client.init();

    // first empty request like the app
    await client.batchStart().batchCall();

    // get player info
    await client.getPlayer('US', 'en', 'Europe/Paris');

    // get settings, inventory, etc...
    let response = await client.batchStart()
                               .downloadRemoteConfigVersion(POGOProtos.Enums.Platform.IOS, '', '', '', 6701)
                               .checkChallenge()
                               .getHatchedEggs()
                               .getInventory()
                               .checkAwardedBadges()
                               .downloadSettings()
                               .batchCall();

    // get data returned by the server that it expect in following calls
    const inventoryResponse = _.find(response, resp => resp._requestType === RequestType.GET_INVENTORY);
    const level = pogobuf.Utils.splitInventory(inventoryResponse).player.level;
    const settings = _.find(response, resp => resp._requestType === RequestType.DOWNLOAD_SETTINGS).hash;
    const inventory = inventoryResponse.inventory_delta.new_timestamp_ms;

    // call getPlayerProfile with data got before
    response = await client.batchStart()
                           .getPlayerProfile()
                           .checkChallenge()
                           .getHatchedEggs()
                           .getInventory(inventory)
                           .checkAwardedBadges()
                           .downloadSettings(settings)
                           .getBuddyWalked()
                           .batchCall();

    // same for levelUpRewards
    response = await client.batchStart()
                           .levelUpRewards(level)
                           .checkChallenge()
                           .getHatchedEggs()
                           .getInventory(inventory)
                           .checkAwardedBadges()
                           .downloadSettings(settings)
                           .getBuddyWalked()
                           .getInbox(true, false, 0)
                           .batchCall();

    // then call a getMapObjects
    const cellIDs = pogobuf.Utils.getCellIDs(coords.latitude, coords.longitude);
    response = await client.batchStart()
                           .getMapObjects(cellIDs, Array(cellIDs.length).fill(0))
                           .checkChallenge()
                           .getHatchedEggs()
                           .getInventory(inventory)
                           .checkAwardedBadges()
                           .getBuddyWalked()
                           .getInbox(true, false, 0)
                           .batchCall();

    let forts = response[0].map_cells.reduce((all, c) => all.concat(c.forts), []);
    let pokestops = forts.filter(f => f.type === 1);
    let gyms = forts.filter(f => f.type === 0);

    console.log(`Found ${pokestops.length} pokestops.`);
    console.log(`Found ${gyms.length} gyms`);
    if (gyms.length > 0) {
        gyms = gyms.filter(g => g.raid_info != null);
        console.log(`  with ${gyms.length} raids.`);
    }

    client.cleanUp();
}

Main()
    .then(() => console.log('Done.'))
    .catch(e => console.error(e));
