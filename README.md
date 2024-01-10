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
