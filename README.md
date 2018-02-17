# pogobuf, a Pokémon Go Client Library for node.js
[![npm version](https://badge.fury.io/js/pogobuf-vnext.svg)](https://badge.fury.io/js/pogobuf-vnext)
![npm downloads](https://img.shields.io/npm/dt/pogobuf-vnext.svg)
![dependencies](https://david-dm.org/pogosandbox/pogobuf.svg)
![license](https://img.shields.io/npm/l/pogobuf-vnext.svg)
[![slack](https://img.shields.io/badge/discord-online-blue.svg)](https://discord.pogodev.org/)

## Features
* Implements all known Pokémon Go API calls
* Includes [hashing server support](https://github.com/cyraxx/pogobuf/wiki/Using-a-hashing-server) (API version 0.51 and up)
* Uses ES6 Promises and [Bluebird](https://github.com/petkaantonov/bluebird/)
* Includes [Pokémon Trainer Club](https://www.pokemon.com/en/pokemon-trainer-club) and Google login clients
* Optional batch mode to group several requests in one RPC call
* Automatically retries failed API requests with increasing delay
* Support proxy
* 100% pure JS, no native library bindings

## Install
`npm i pogobuf-vnext`

## Acknowledgements
* Uses the excellent [POGOProtos](https://github.com/AeonLucid/POGOProtos) (via [node-pogo-protos](https://github.com/pogosandbox/node-pogo-protos))

# Documentation and usage
You can find the documentation and other information in the [wiki](https://github.com/cyraxx/pogobuf/wiki).
