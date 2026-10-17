// Base map tiles. CARTO raster basemaps need a (free) API key, requested at
// https://www.carto.com/basemaps/apikey/ and passed as VITE_CARTO_API_KEY at build time.
// Without a key the maps fall back to plain OpenStreetMap tiles.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASE_TILES = CARTO_API_KEY
  ? {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    }
  : {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: OSM_ATTRIBUTION,
    };
