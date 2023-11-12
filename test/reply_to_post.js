const postToPage = {
    "entry": [
        {
            "id": "146944785160996",
            "time": 1699308265,
            "changes": [
                {
                    "value": {
                        "from": {
                            "id": "24360293243554509",
                            "name": "New-i Ai-host"
                        },
                        "message": "Санечка, привет!",
                        "post_id": "146944785160996_122121291596063732",
                        "created_time": 1699308263,
                        "item": "post",
                        "recipient_id": "146944785160996",
                        "verb": "edit"
                    },
                    "field": "feed"
                }
            ]
        }
    ],
    "object": "page"
};

function getPageToken(pageID) {
    const pageTokens = [{
        'name': 'Chloe',
        'pageID': '129830246883745',
        'token': 'EAAEMK9gufMEBOzXElrrJISPOcuQYuCQFDmwa47PnBVCAt2VvtO2ZBCyGl7SDJk7jpmzYtZAO87aEMtYHn0zmh6BgOSHioI5pLEojBZAI8OyCZBllZAZASX7xqiJE7L8C8ZC3SwZBiqZBvNKDP5wlNbX403dFn4e9iGIV4gohtt2RpTdGkochXZAKl00LsS6dMCGgZDZD'
        }, {
        'name': 'Gleb',
        'pageID': '139249235935855',
        'token': 'EAAEMK9gufMEBO5dYHjO7AWmWUZAsIrRk9vTl98PvQwU8Fy4rI3Tx0ZBh1jNvItU2eQyZBIAFpvkWZCNJgGKR0g0FB8GczPSEqBFYXvP8OP6Ow2Keic75eJOk2gVDiIqiwuNazPNcYkGVJm7HczGXzoduwJRnM0Yp9tE7wUgNT3lyYvfrSsqFm8RDzwtFSQZDZD'
        }, {
        'name': 'Gleb V1',
        'pageID': '144905368686649',
        'token': 'EAAEMK9gufMEBO4V2uiZA2kvmZACTI7uLFN9jOLhXiZBHk3ZCnjvmZBryrVMQwWA3PMnBRi5Cusr7ZBMLwEebAHmQdWcSZC6yRZBRJZAZAL11tRTZBXif8YqyFuV4n7H46HIjLo5BGEDIZAZAlqb5tnGXahTaSxNNrx6nZA8JZB8HiymZAhqjPtYMDFZBJcqNKQGLvND05pQZDZD'
        }, {
        'name': 'New-i',
        'pageID': '156845804176635',
        'token': 'EAAEMK9gufMEBOxPktHTPzVIsQUkbE16ndEWFJXBeGaZBVZATB7Fs9MZBkN4eLBb1Ie31KAwL9ZAt1WutZB7NNGHSWnUu0ZBH4x38lkGhMWE2xGY0q0UyGZAG8N7bQXZAil1HLHSvCJ7I3GxIm0jllcDS3d7cPnLNLSlES7qQkKZCM6BIEhkL6oZBbkmzxjFbPB4gZDZD'
        },{
        'name': 'Sunny Zajchonok',
        'pageID': '146944785160996',
        'token': 'EAAEMK9gufMEBOwTiWMehtkMqtic42Lr5rOGa8Lwa6E6nb5cO3hd4v5IQCZCYsVwYGIZCbsI9izlYXteN472Ntmqw7jSR0sCUtNWeWyZCyqG69ROtFNUpGvb30F56DRpyiHc8MGL6szdHJZA7zNqB3BNMcZA1cqQVI22PuYSZBhiOFlgVLUoOEpsRdiAJkxS0JFiHvUZCHSVNTrR0AdcdRwi'
        }];
    return pageTokens.find(pt => pt.pageID === pageID).token;
}

 // Assuming request is properly required from a library like axios
const axios = require('axios');


function replyToPage(body) {
    if (body.object === 'page') {
        body.entry.forEach(entry => {
        if (entry.changes) {
            replyToChanges(entry.changes);
        } else {
            console.error("Not implemented " + entry)
        }
        });
    } else {
        console.error(`not a "page":` + JSON.stringify(body));
    }
};

function replyToChanges(changes) {
    log(`replyToChanges ${JSON.stringify(changes)}`);
    changes.forEach(change => {
        if (change.field === `feed`) {
            replyToFeed(change.value);
        }
    });
}

function replyToFeed(value) {
    log(`replyToFeed ${JSON.stringify(value)}`);
    let postId = value.post_id;
    let pageId = value.recipient_id;
    let event = value.item;
    let senderId = value.from.id;
    let message = `${value.message}@[${senderId}]`;
    let text = `Test reply to @[${value.from.name}]`;
    commentOnPost(pageId, postId, text);
};

function commentOnPost(pageId, postId, message) {
    const pageToken = getPageToken(pageId);
    const url = `https://graph.facebook.com/v12.0/${postId}/comments`;

    log(`commentOnPost post:${postId} token: ${pageToken}`);

    axios.post(url, {
      message: message
    }, {
      params: {
        access_token: pageToken
      }
    })
    .then(response => {
      console.log('Comment successfully posted', response.data);
    })
    .catch(error => {
      console.error('Error posting comment', error.response);
    });
  }

function test() {
    replyToPage(postToPage);
}

test();
