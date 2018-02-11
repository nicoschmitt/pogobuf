/*
    Example script to download game master
    This is far (far) away from how the real app does it, but it works

    In addition to pogobuf, this example requires the npm package node-geocoder and lodash.
    async/await requires node > 7.6
*/

const pogobuf = require('pogobuf-vnext');
const nodeGeocoder = require('node-geocoder');
const fs = require('mz/fs');

async function Main() {
    const location = await nodeGeocoder().geocode('Invalides, Paris');
    if (!location.length) throw new Error('Location not found.');

    var coords = {
        latitude: location[0].latitude,
        longitude: location[0].longitude,
        altitude: Math.random() * 20,
    };

    const client = new pogobuf.Client({
        authType: 'ptc',
        username: 'ptc user name',
        password: 'ptc password',
        hashingKey: 'your hashing key',
        version: 8705,
    });

    // set player position
    client.setPosition(coords);

    // init the app
    await client.init();

    // get player info to boot up the api
    await client.getPlayer('US', 'en', 'Europe/Paris');

    // get game master
    const response = await client.downloadItemTemplates(false);
    await fs.writeFile('game_master.json', JSON.stringify(response, null, 2), 'utf8');

    client.cleanUp();
}

Main()
    .then(() => console.log('Done.'))
    .catch(e => console.error(e));
