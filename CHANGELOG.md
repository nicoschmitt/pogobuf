# Work in Progress
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