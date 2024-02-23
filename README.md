# webhook1

[Install the Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
* [Download tar](https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-458.0.1-darwin-arm.tar.gz)
* copy to ~
* untar 

     ./google-cloud-sdk/install.sh

     ./google-cloud-sdk/bin/gcloud init

[Create a 2nd gen Cloud Function by using the Google Cloud CLI](https://cloud.google.com/functions/docs/create-deploy-gcloud)

[Run functions with Functions Framework](https://cloud.google.com/functions/docs/running/function-frameworks)

```
npm install --save-dev @google-cloud/functions-framework
```

[Call local functions](https://cloud.google.com/functions/docs/running/calling)

[Call Cloud Functions directly](https://cloud.google.com/functions/docs/running/direct)

[Configure environment variables](https://cloud.google.com/functions/docs/configuring/env-var)

gcloud functions deploy nodejs-http-function --gen2 --runtime=nodejs20 --region=REGION --source=. --entry-point=helloGET \
--trigger-http


Data structure

```JS
users/${fb_userId}/config
const config = {
     userId: userId;
     accessToken: longLivedToken;
     // TODO:
     pages: {}   
}; 

pages/${pageId}/config
const config = {
     pageID: page.id,
     name : page.name,
     token: page.access_token,
     admin_id: userId,
     page_password: pagePassword,
     openai_key: config.openai_key,
}; 

pages/${pageId}/${userId}/config
const config = {
      threadId: '0',
      assistantId: '',
      personaId: '0', // ?
      run_count: 0,   // TODO add
      tokens: 0       // TODO: add
};

pages/${pageId}/${userId}/messages

pages/${pageId}/personas

telegram/${botName}/${userName}/config.json

// TODO:
telegram/${userId}/config

// TODO:
// consider assistant metadata
assistants/${assistantId}/config
const config = {
     prompts: {
          on_fb_message: "",
          on_post: "", 
          on_comment: "",
          on_link: "", 
          on_voice: "", 
          on_reaction: "",
          on_mention: "",
          on_instagram: "", // TODO:
     }, 
     scripts: {
          foo: ``,
          bar: ``,     
     }, 
     services: {
          
     }
};

ai-hosts/${aiHostId}/Configure
```

```js
"user": { 
     auth_date: 1707933815,
     first_name: "Alexandre",
     hash: "a3130ba263693eb56751b4925961f83c34de1bfe0a8e265d8fb0fb3b110d7c64",
     id: 1710801225,
     last_name: "Barilov",
     photo_url: "https://t.me/i/userpic/320/FBqEyr2bsPjQ-kyEKRWkiWAn8ieZYS0CkcPNkXkt5JE.jpg" 
     username: "alexandre_bari"
}

"botInfo": {
            “openai_key”:”asdfasdf6adfadf”,
            “openai_assistant_id”:”ass-q31234”,
            “image_url”: ”https://foo.com/image123”,
            "token": "6813745452:AAGfwV0gMNEFbQWFZIawNiOa6kn5CCKlAWI",
            "id": 6813745452,
            "first_name": "ChoPochom",
            "username": "cho_po_chom_bot",
            "can_join_groups": true,
            "can_read_all_group_messages": true,
            "supports_inline_queries": true
        }
```