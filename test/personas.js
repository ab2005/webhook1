const axios = require('axios');

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
    'token': 'EAAEMK9gufMEBOxkiOHtIzSBDLMJIsZCZAQRdUlgZCvqpwCMTa2ZAJIP1jKuZABZAWvxzbqNnQ1SvVVvnuw7DpcLZBbZBArJcC2fOk5jUgEdWM8EvD7QlYP0nZB52mQSmxAenoiDGd6gJZB0ZAT4tYuHD8H0nZCyc62sAgK0pHNhcLHbUFOAjTFHCKm6YSt1e6TCm6QZDZD'
  }];

const pageAccessToken = 'EAAEMK9gufMEBOxkiOHtIzSBDLMJIsZCZAQRdUlgZCvqpwCMTa2ZAJIP1jKuZABZAWvxzbqNnQ1SvVVvnuw7DpcLZBbZBArJcC2fOk5jUgEdWM8EvD7QlYP0nZB52mQSmxAenoiDGd6gJZB0ZAT4tYuHD8H0nZCyc62sAgK0pHNhcLHbUFOAjTFHCKm6YSt1e6TCm6QZDZD'; // Replace with your Page Access Token
const pageID = '146944785160996';

async function createPersona(name, profilePictureUrl) {
  const url = `https://graph.facebook.com/${pageID}/personas?access_token=${pageAccessToken}`;
  const data = {
    name: name,
    profile_picture_url: profilePictureUrl
  };

  try {
    const response = await axios.post(url, data);
    console.log('Created Persona:', response.data);
    return response.data.id; // The Persona ID
  } catch (error) {
    console.error('Error creating Persona:', error.response);
    throw error;
  }
}

// Example usage:
createPersona('Doggy', 'https://www.hartz.com/wp-content/uploads/2022/04/small-dog-owners-1.jpg')
  .then(personaId => {
    console.log(`New Persona ID: ${personaId}`);
    // You can now use this personaId to send messages
  })
  .catch(error => {
    console.log('An error occurred:', error.message);
  });

  createPersona('Puppy', 'https://kb.rspca.org.au/wp-content/uploads/2018/11/golder-retriever-puppy.jpeg')
  .then(personaId => {
    console.log(`New Persona ID: ${personaId}`);
    // You can now use this personaId to send messages
  })
  .catch(error => {
    console.log('An error occurred:', error.message);
  });

  createPersona('Toy', 'https://media.npr.org/assets/img/2022/11/23/russian-toy-2-002--059b8a825dac13f92234d65777e6b29b0914e92f-s1600-c85.webp')
  .then(personaId => {
    console.log(`New Persona ID: ${personaId}`);
    // You can now use this personaId to send messages
  })
  .catch(error => {
    console.log('An error occurred:', error.message);
  });
