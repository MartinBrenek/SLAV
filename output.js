const BUILDING_RO_KEY = "BuildingData";
const BUILDING_SLOTS_RO_KEY = "SlotsConfig";
handlers.helloWorld = function (args, context) {
    var message = "Hello " + currentPlayerId + "!";
    log.info(message);
    var inputValue = null;
    if (args && args.inputValue)
        inputValue = args.inputValue;
    log.debug("helloWorld:", { input: args.inputValue });
    return { messageValue: message };
};
handlers.makeAPICall = function (args, context) {
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
                StatisticName: "Level",
                Value: 2
            }]
    };
    var playerStatResult = server.UpdatePlayerStatistics(request);
};
handlers.makeHTTPRequest = function (args, context) {
    var headers = {
        "X-MyCustomHeader": "Some Value"
    };
    var body = {
        input: args,
        userId: currentPlayerId,
        mode: "foobar"
    };
    var url = "http://httpbin.org/status/200";
    var content = JSON.stringify(body);
    var httpMethod = "post";
    var contentType = "application/json";
    var response = http.request(url, httpMethod, content, contentType, headers);
    return { responseContent: response };
};
handlers.handlePlayStreamEventAndProfile = function (args, context) {
    var psEvent = context.playStreamEvent;
    var profile = context.playerProfile;
    var content = JSON.stringify({ user: profile.PlayerId, event: psEvent.EventName });
    var response = http.request('https://httpbin.org/status/200', 'post', content, 'application/json', null);
    return { externalAPIResponse: response };
};
handlers.completedLevel = function (args, context) {
    var level = args.levelName;
    var monstersKilled = args.monstersKilled;
    var updateUserDataResult = server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: {
            lastLevelCompleted: level
        }
    });
    log.debug("Set lastLevelCompleted for player " + currentPlayerId + " to " + level);
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
                StatisticName: "level_monster_kills",
                Value: monstersKilled
            }]
    };
    server.UpdatePlayerStatistics(request);
    log.debug("Updated level_monster_kills stat for player " + currentPlayerId + " to " + monstersKilled);
};
handlers.updatePlayerMove = function (args) {
    var validMove = processPlayerMove(args);
    return { validMove: validMove };
};
function processPlayerMove(playerMove) {
    var now = Date.now();
    var playerMoveCooldownInSeconds = 15;
    var playerData = server.GetUserInternalData({
        PlayFabId: currentPlayerId,
        Keys: ["last_move_timestamp"]
    });
    var lastMoveTimestampSetting = playerData.Data["last_move_timestamp"];
    if (lastMoveTimestampSetting) {
        var lastMoveTime = Date.parse(lastMoveTimestampSetting.Value);
        var timeSinceLastMoveInSeconds = (now - lastMoveTime) / 1000;
        log.debug("lastMoveTime: " + lastMoveTime + " now: " + now + " timeSinceLastMoveInSeconds: " + timeSinceLastMoveInSeconds);
        if (timeSinceLastMoveInSeconds < playerMoveCooldownInSeconds) {
            log.error("Invalid move - time since last move: " + timeSinceLastMoveInSeconds + "s less than minimum of " + playerMoveCooldownInSeconds + "s.");
            return false;
        }
    }
    var playerStats = server.GetPlayerStatistics({
        PlayFabId: currentPlayerId
    }).Statistics;
    var movesMade = 0;
    for (var i = 0; i < playerStats.length; i++)
        if (playerStats[i].StatisticName === "")
            movesMade = playerStats[i].Value;
    movesMade += 1;
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
                StatisticName: "movesMade",
                Value: movesMade
            }]
    };
    server.UpdatePlayerStatistics(request);
    server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: {
            last_move_timestamp: new Date(now).toUTCString(),
            last_move: JSON.stringify(playerMove)
        }
    });
    return true;
}
handlers.RoomCreated = function (args) {
    log.debug("Room Created - Game: " + args.GameId + " MaxPlayers: " + args.CreateOptions.MaxPlayers);
};
handlers.RoomJoined = function (args) {
    log.debug("Room Joined - Game: " + args.GameId + " PlayFabId: " + args.UserId);
};
handlers.RoomLeft = function (args) {
    log.debug("Room Left - Game: " + args.GameId + " PlayFabId: " + args.UserId);
};
handlers.RoomClosed = function (args) {
    log.debug("Room Closed - Game: " + args.GameId);
};
handlers.RoomPropertyUpdated = function (args) {
    log.debug("Room Property Updated - Game: " + args.GameId);
};
handlers.RoomEventRaised = function (args) {
    var eventData = args.Data;
    log.debug("Event Raised - Game: " + args.GameId + " Event Type: " + eventData.eventType);
    switch (eventData.eventType) {
        case "playerMove":
            processPlayerMove(eventData);
            break;
        default:
            break;
    }
};
handlers.UpdateBuildItemState = function (args) {
    var inventory = server.GetUserInventory({
        "PlayFabId": currentPlayerId
    });
    var buildrecord = {};
    var updatebuildconfig;
    var updatebuildslots = [];
    var buildconfig = getUserReadOnlyData([BUILDING_RO_KEY]);
    if (!buildconfig.hasOwnProperty(BUILDING_RO_KEY)) {
        log.info("No object in BUILD CONFIG!");
        updatebuildconfig = { [BUILDING_SLOTS_RO_KEY]: [buildrecord] };
    }
    else
        updatebuildconfig = JSON.parse(buildconfig[BUILDING_RO_KEY].Value);
    args.items.forEach(element => {
        var index = inventory.Inventory.findIndex(x => x.ItemId == element.ItemName);
        if (index != -1) {
            if (inventory.Inventory[index].RemainingUses > 0) {
                var baseObj = {
                    "ItemBPClass": element.ItemName,
                    "SlotID": element.SlotID,
                    "SkinID": element.SkinID
                };
                updatebuildslots.push(baseObj);
                inventory.Inventory[index].RemainingUses--;
            }
            else
                log.info("There are no free build objects of this types in inventory!");
        }
        else
            log.info("Build object of this type does not appears in inventory!");
    });
    updatebuildconfig[BUILDING_SLOTS_RO_KEY] = updatebuildslots;
    updateUserReadOnlyData({ [BUILDING_RO_KEY]: JSON.stringify(updatebuildconfig) }, null);
};
function getTitleData(keyList) {
    log.info("API call: Getting title data " + JSON.stringify(keyList));
    return server.GetTitleData({
        "Keys": keyList
    }).Data;
}
function getTitleInternalData(keyList) {
    log.info("API call: Getting title internal data", keyList);
    return server.GetTitleInternalData({
        "Keys": keyList
    }).Data;
}
function getUserData(keyList) {
    log.info("API call: Getting title data " + JSON.stringify(keyList));
    return server.GetUserData({
        "PlayFabId": currentPlayerId,
        "Keys": keyList
    }).Data;
}
function getUserReadOnlyData(keyList) {
    log.info("API call: Getting UserROD " + JSON.stringify(keyList));
    return server.GetUserReadOnlyData({
        "PlayFabId": currentPlayerId,
        "Keys": keyList
    }).Data;
}
function getUserInternalData(keyList) {
    log.info("API call: Getting UserIntData " + JSON.stringify(keyList));
    return server.GetUserInternalData({
        "PlayFabId": currentPlayerId,
        "Keys": keyList
    }).Data;
}
function updateUserTitleData(dataToUpdate, keysToRemove) {
    log.info("API call: Updating USER TD with data " +
        JSON.stringify(dataToUpdate) +
        (keysToRemove != undefined ? (", removing keys " + JSON.stringify(keysToRemove)) : ""));
    return server.UpdateUserData({
        "PlayFabId": currentPlayerId,
        "Data": dataToUpdate,
        "KeysToRemove": keysToRemove
    });
}
function updateUserReadOnlyData(dataToUpdate, keysToRemove) {
    log.info("API call: Updating USER ROD with data " +
        JSON.stringify(dataToUpdate) +
        (keysToRemove != undefined ? (", removing keys " + JSON.stringify(keysToRemove)) : ""));
    return server.UpdateUserReadOnlyData({
        "PlayFabId": currentPlayerId,
        "Data": dataToUpdate,
        "KeysToRemove": keysToRemove
    });
}
function updateUserInternalData(dataToUpdate, keysToRemove) {
    log.info("API call: Updating USER ID with data " +
        JSON.stringify(dataToUpdate) +
        (keysToRemove != undefined ? (", removing keys " + JSON.stringify(keysToRemove)) : ""));
    return server.UpdateUserInternalData({
        "PlayFabId": currentPlayerId,
        "Data": dataToUpdate,
        "KeysToRemove": keysToRemove
    });
}
function updatePlayerStatistics(statistics) {
    log.info("API call: Updating PLAYER STATISTICS with data " + JSON.stringify(statistics));
    return server.UpdatePlayerStatistics({
        "PlayFabId": currentPlayerId,
        "Statistics": statistics,
    });
}
function getUserInventory(playfabId) {
    if (playfabId == null)
        playfabId = currentPlayerId;
    log.info("API call: Getting user inventory");
    return server.GetUserInventory({
        "PlayFabId": playfabId
    });
}
function GrantItemToUserInventory(name) {
    log.info("API call: Granting items " + JSON.stringify(name));
    return server.GrantItemsToUser({
        "PlayFabId": currentPlayerId,
        "ItemIds": [name]
    });
}
function GrantItemsToUserInventory(names) {
    log.info("API call: Granting items " + JSON.stringify(names));
    return server.GrantItemsToUser({
        "PlayFabId": currentPlayerId,
        "ItemIds": names
    });
}
//# sourceMappingURL=output.js.map