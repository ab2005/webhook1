# webhook1

[Create a 2nd gen Cloud Function by using the Google Cloud CLI](https://cloud.google.com/functions/docs/create-deploy-gcloud)

[Run functions with Functions Framework](https://cloud.google.com/functions/docs/running/function-frameworks)

```
npm install --save-dev @google-cloud/functions-framework
```

[Call local functions](https://cloud.google.com/functions/docs/running/calling)


gcloud functions deploy nodejs-http-function --gen2 --runtime=nodejs20 --region=REGION --source=. --entry-point=helloGET \
--trigger-http
