/*
    This example script repeatedly queries the area near the given coordinates for
    catchable Pokémon. It uses the pogodev hashing server to provide the encrypted
    request signature.
    This is a really simple example, you should be mimicing the app much better than this.
*/

const pogobuf = require('pogobuf-vnext');
const POGOProtos = require('node-pogo-protos-vnext');

// Note: To avoid getting softbanned, change these coordinates to something close to where you
// last used your account
const lat = 48.8628407;
const lng = 2.3286178;

async function Main() {
    const client = new pogobuf.Client({
        authType: 'ptc or google',
        username: 'your username',
        password: 'your password',
        version: 6901,
        useHashingServer: true,
        hashingKey: 'hash key'
    });
    client.setPosition(lat, lng);

    await client.init();

    const cellIDs = pogobuf.Utils.getCellIDs(lat, lng, 5, 17);
    const mapObjects = await client.getMapObjects(cellIDs, Array(cellIDs.length).fill(0));

    for (const cell of mapObjects.map_cells) {
        console.log('Cell ' + cell.s2_cell_id.toString());
        console.log('Has ' + cell.catchable_pokemons.length + ' catchable Pokemon');

        for (const catchablePokemon of cell.catchable_pokemons) {
            console.log(' - A ' + pogobuf.Utils.getEnumKeyByValue(POGOProtos.Enums.PokemonId,
                catchablePokemon.pokemon_id) + ' is asking you to catch it.');
        }
    }

    client.cleanUp();
}

Main();

