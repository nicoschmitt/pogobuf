# 2.6.x
* Compatible with 0.91.x
* Add `fetchAllNews` and `markReadNewsArticle`
* Update to long.js 4.0
* Bug fixes

# 2.5.x
* 0.73.1 compatibility (be sure dependencies are up to date) (2.5.0)
* Bug fix (2.5.1)
* Add missing api in typings (2.5.2)

# 2.4.x
* Code clean up and refactor (api definition in a separate file) (2.4.0)
* `addPlatformRequestToEnvelope` does not break chain anymore (2.4.0)
* Fix http headers on rpc requests (2.4.0)
* Cleanup restart requestid sequence (2.4.0)
* Add `getRaidDetails` (2.4.1)

# 2.3.x
* Bug in getGetInfo data sent (2.3.8)
* Fix request ID generation (2.3.7)
* Fix typings (2.3.5)
* Fix an issue when resending request including more than one signature (2.3.5)
* Option `hashingVersion` allows you to bypass hash version auto detect mecanism (2.3.5)
* 0.69.x (2.3.4)
* Some clean up (2.3.3)
* Fix addFortModifier response (2.3.2)
* Improve PTC login internal (2.3.1)
* Switch to protobufjs v6 (2.3.0) - not published
* 0.67 (2.2.0)
* Improve Google login error handling (2.1.1)
* Add `client.getOption()` to get an option current value (2.1.1)
* Minor text fix

# 2.1.x
* Allow passing a platform request to the current batch with `client.batchAddPlatformRequest()`
* If a store plateform request is passed, it's returned as response.
* Fix `util.splitItemTemplates()` which was broken. You should now pass the `item_templates` object directly and not the response object anymore.
* Default is now `client.init()` don't call any api anymore.
* Dependencies update

# 2.0.x
* First pogobuf-vnext version