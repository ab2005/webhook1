const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucketName = 'YOUR_BUCKET_NAME'; // Replace with your bucket name
const fileName = 'YOUR_FILE_NAME.json'; // Replace with your JSON file name

async function modifyJsonFile() {
    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        // Download the file
        const data = (await file.download())[0];
        const json = JSON.parse(data.toString());
        console.log(json);

        // Modify the JSON object
        // Example modification: Add a new property
        json.newProperty = 'New Value';

        // Upload the modified JSON back to the bucket
        await file.save(JSON.stringify(json, null, 2), {
            contentType: 'application/json'
        });

        console.log('JSON file modified and saved back to the bucket.');
    } catch (error) {
        console.error('Error:', error);
    }
}

// Call the function to perform the operation
modifyJsonFile();
