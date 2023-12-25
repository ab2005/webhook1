

// const { Firestore } = require('@google-cloud/firestore');
// const firestore = new Firestore();

// function test() {
//     const documentRef = firestore.collection('exampleCollection').doc('exampleDoc');
//     documentRef.get()
//     .then(doc => {
//       if (doc.exists) {
//         console.log('doc.data()');
//       } else {
//         console.log('does not exist');
//       }
//     })
//     .catch(error => {
//       console.error(error);
//     });
// }

// test();


// const admin = require('firebase-admin');
// console.log(1);
// admin.initializeApp();
// console.log(2);
// const db = admin.firestore();
// console.log(3);

// let docData = {
//     name: 'Los Angeles',
//     state: 'CA',
//     country: 'USA',
//     capital: false,
//     population: 3900000
// };
// console.log(4);

// db.collection('cities').doc('LA').set(docData).then(() => {
//     console.log('Document successfully written!');
// }).catch((error) => {
//     console.error('Error writing document: ', error);
// });

const { Datastore } = require('@google-cloud/datastore');

// Initialize the Datastore client
const datastore = new Datastore();

// Define the kind and the key for the new entity
const kind = 'MyEntity';
const taskKey = datastore.key([kind]);

// Prepare the new entity
const task = {
  key: taskKey,
  data: {
    description: 'Buy milk',
    created: new Date().toJSON()
  },
};

// Save the entity to Datastore
datastore.save(task)
  .then(() => {
    console.log(`Saved ${task.key.name}: ${task.data.description}`);
  })
  .catch(err => {
    console.error('ERROR:', err);
  });
