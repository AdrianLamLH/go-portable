/// <reference types="vite/client" />

// Provided by the postersManifest plugin in vite.config.ts
declare module "virtual:posters" {
  const urls: string[];
  export default urls;
}

// Provided by the galleryManifest plugin in vite.config.ts
declare module "virtual:gallery" {
  const urls: string[];
  export default urls;
}
