import * as THREE from 'three';

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeLongitude(longitude) {
  let normalized = longitude;

  while (normalized < -180) {
    normalized += 360;
  }

  while (normalized >= 180) {
    normalized -= 360;
  }

  return normalized;
}

export async function loadLandMask(url = '/data/land-mask.png') {
  const textureLoader = new THREE.TextureLoader();

  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        const image = texture.image;
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          reject(new Error('Unable to acquire a 2D canvas context for the land mask.'));
          return;
        }

        context.drawImage(image, 0, 0);

        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        resolve({
          texture,
          canvas,
          context,
          width: canvas.width,
          height: canvas.height,
          data: imageData.data,
        });
      },
      undefined,
      reject
    );
  });
}

export function isLand(landMask, latitude, longitude) {
  const normalizedLongitude = normalizeLongitude(longitude);
  const normalizedLatitude = clamp(latitude, -90, 90);
  const u = (normalizedLongitude + 180) / 360;
  const v = (90 - normalizedLatitude) / 180;
  const x = ((Math.floor(u * landMask.width) % landMask.width) + landMask.width) % landMask.width;
  const y = clamp(Math.floor(v * landMask.height), 0, landMask.height - 1);
  const offset = (y * landMask.width + x) * 4;

  return landMask.data[offset] >= 128;
}
