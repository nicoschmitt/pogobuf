/*
    This example script shows how to work with the getInventory() API call and the
    splitInventory() function.
    This one suppose node > 7.6.0 to use await/async
*/
const pogobuf = require('pogobuf-vnext');
const POGOProtos = require('node-pogo-protos-vnext');

// Note: To avoid getting softbanned, change these coordinates to something close to where you
// last used your account
const pos = {
    lat: 37.7876146,
    lng: -122.3884353,
};

async function Main() {
    const client = new pogobuf.Client({
        authType: 'google',
        username: 'your-username@gmail.com',
        password: 'your-google-password',
        hashingKey: 'hash key',
        useHashingServer: true,
    });

    client.setPosition(pos.lat, pos.lng);

    await client.init();
    await client.batchStart().batchCall();
    await client.getPlayer('US', 'en', 'Europe/Paris');
    const response = await client.batchStart()
        .downloadRemoteConfigVersion(POGOProtos.Enums.Platform.IOS, '', '', '', 6301)
        .checkChallenge()
        .getHatchedEggs()
        .getInventory()
        .checkAwardedBadges()
        .downloadSettings()
        .batchCall();

    const inventory = pogobuf.Utils.splitInventory(response[3]);
    console.log('Items:');
    inventory.items.forEach(item => {
        const name = pogobuf.Utils.getEnumKeyByValue(POGOProtos.Inventory.Item.ItemId, item.item_id);
        console.log(item.count + 'x ' + name);
    });

    client.cleanUp();
}

Main()
    .then(() => console.log('Done.'))
    .catch(e => console.error(e));
