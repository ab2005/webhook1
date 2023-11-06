const axios = require('axios');

/**
 * Get the album ID by name from a Facebook Page.
 *
 * @param {string} accessToken - The access token for authentication.
 * @param {string} pageId - The ID of the Facebook Page.
 * @param {string} albumName - The name of the album you want to find.
 * @returns {Promise<string>} A promise that resolves to the album ID.
 */
async function getAlbumIdByName(accessToken, pageId, albumName) {
  try {
    const url = `https://graph.facebook.com/v14.0/${pageId}/albums?fields=name&access_token=${accessToken}`;
    const response = await axios.get(url);

    const album = response.data.data.find(a => a.name === albumName);
    if (album) {
      return album.id;
    } else {
      throw new Error(`Album with name ${albumName} not found.`);
    }
  } catch (error) {
    console.error('Error fetching album ID:', error);
    throw error;
  }
}

/**
 * Get images with descriptions from a specific Facebook Page album by album name.
 *
 * @param {string} accessToken - The access token for authentication.
 * @param {string} pageId - The ID of the Facebook Page.
 * @param {string} albumName - The name of the album you want to get images from.
 * @returns {Promise<Array>} A promise that resolves to an array of image objects with descriptions.
 */
async function getImagesWithDescriptionsByAlbumName(accessToken, pageId, albumName) {
  try {
    const albumId = await getAlbumIdByName(accessToken, pageId, albumName);

    const url = `https://graph.facebook.com/v14.0/${albumId}/photos?fields=name,images&access_token=${accessToken}`;
    const response = await axios.get(url);

    if (response.data && response.data.data) {
      const imagesWithDescriptions = response.data.data.map(photo => ({
        id: photo.id,
        description: photo.name,
        images: photo.images // This contains different sizes, you can select the one you want.
      }));
      return imagesWithDescriptions;
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error fetching images from album by name:', error);
    throw error;
  }
}

// Usage example:
const accessToken = 'EAAEMK9gufMEBOxkiOHtIzSBDLMJIsZCZAQRdUlgZCvqpwCMTa2ZAJIP1jKuZABZAWvxzbqNnQ1SvVVvnuw7DpcLZBbZBArJcC2fOk5jUgEdWM8EvD7QlYP0nZB52mQSmxAenoiDGd6gJZB0ZAT4tYuHD8H0nZCyc62sAgK0pHNhcLHbUFOAjTFHCKm6YSt1e6TCm6QZDZD'; // Replace with your Page Access Token
const pageId = '146944785160996';
const albumName = 'Personas'; // Replace with the album name you want to access.

getImagesWithDescriptionsByAlbumName(accessToken, pageId, albumName)
  .then(images => {
    console.log('Retrieved images with descriptions:', images);
  })
  .catch(error => {
    console.error('Failed to retrieve images:', error);
  });
