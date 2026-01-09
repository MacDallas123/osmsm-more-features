import { readFileSync } from 'fs';
import http from 'http';
import https from "https";
import handlebars from 'handlebars';
import { spawn } from "child_process";
import { fileURLToPath } from 'url';

let chrome = { args: [] };
let puppeteer;

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  chrome = import("chrome-aws-lambda");
  puppeteer = (await import("puppeteer-core")).default;
} else {
  puppeteer = (await import("puppeteer")).default;
}

async function calculateVehicleRoute(origin, destination) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
    const response = await httpGet(url);
    const data = JSON.parse(response);
    
    if (!data.routes || data.routes.length === 0) {
      console.warn('OSRM returned no routes');
      return null;
    }
    
    return data.routes[0].geometry;
  } catch (e) {
    console.error('OSRM request failed:', e);
    return null;
  }
}

function createStraightLineRoute(origin, destination) {
  return {
    type: "LineString",
    coordinates: [origin, destination]
  };
}

function calculateDistance(coords) {
  const R = 6371e3;
  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i-1];
    const [lon2, lat2] = coords[i];
    
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    total += R * c;
  }

  return total;
}

function formatDistance(meters) {
  if (meters > 1000) {
    return (meters / 1000).toFixed(1) + ' km';
  }
  return Math.round(meters) + ' m';
}

function getExtendedBounds(geojson, width, height) {
    const coords = geojson.features.flatMap(f => 
        f.geometry.type === 'LineString' ? f.geometry.coordinates :
        f.geometry.type === 'Point' ? [f.geometry.coordinates] :
        []
    );
    
    if (coords.length === 0) return null;

    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    const bounds = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
    ];

    const latRange = bounds[1][0] - bounds[0][0];
    const lngRange = bounds[1][1] - bounds[0][1];
    const routeRatio = lngRange / latRange;
    const imageRatio = width / height;

    if (routeRatio > imageRatio) {
        const neededHeight = lngRange / imageRatio;
        const center = (bounds[0][0] + bounds[1][0]) / 2;
        bounds[0][0] = center - neededHeight / 2;
        bounds[1][0] = center + neededHeight / 2;
    } else {
        const neededWidth = latRange * imageRatio;
        const center = (bounds[0][1] + bounds[1][1]) / 2;
        bounds[0][1] = center - neededWidth / 2;
        bounds[1][1] = center + neededWidth / 2;
    }

    const latMargin = (bounds[1][0] - bounds[0][0]) * 0.1;
    const lngMargin = (bounds[1][1] - bounds[0][1]) * 0.1;
    
    return [
        [bounds[0][0] - latMargin, bounds[0][1] - lngMargin],
        [bounds[1][0] + latMargin, bounds[1][1] + lngMargin]
    ];
}

function getDep(nodeModulesFile, binary = false) {
  const abspath = fileURLToPath(import.meta.resolve(nodeModulesFile));
  if (binary) {
    return new Buffer.from(readFileSync(abspath), 'binary').toString('base64');
  }
  else {
    return readFileSync(abspath, 'utf8');
  }
}

const files = {
  leafletjs: getDep('leaflet/dist/leaflet.js'),
  leafletcss: getDep('leaflet/dist/leaflet.css'),
  leafletpolylinedecorator: getDep('leaflet-polylinedecorator/dist/leaflet.polylineDecorator.js'),
  mapboxjs: getDep('mapbox-gl/dist/mapbox-gl.js'),
  mapboxcss: getDep('mapbox-gl/dist/mapbox-gl.css'),
  leafletmapboxjs: getDep('mapbox-gl-leaflet/leaflet-mapbox-gl.js'),
  markericonpng: getDep('leaflet/dist/images/marker-icon.png', true),
  northArrow: getDep('./north.png', true)
}
const templatestr = getDep('./template.html');
const template = handlebars.compile(templatestr);

function replacefiles(str) {
  const ff = Object.entries(files)
  let res = str
  ff.reverse()
  ff.forEach(([k, v]) => res = res.replace(`//${k}//`, v))
  return res
}

class Browser {
  constructor() {
    this.browser = null;
  }
  async launch() {
    const executablePath = await chrome.executablePath
    return puppeteer.launch({
      args: [...chrome.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Important pour les VPS avec peu de RAM
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'],
      defaultViewport: chrome.defaultViewport,
      executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });
  }
  async getBrowser() {
    if (this.openingBrowser) {
      throw new Error('osm-static-maps is not ready, please wait a few seconds')
    }
    if (!this.browser || !this.browser.isConnected()) {
      this.openingBrowser = true;
      try {
        this.browser = await this.launch();
      }
      catch (e) {
        this.openingBrowser = false;
        console.log(e)
        console.log('Error opening browser')
        console.log(JSON.stringify(e, undefined, 2))
        throw e;
      }
      this.openingBrowser = false;
    }
    return this.browser
  }
  async getPage() {
    const browser = await this.getBrowser()
    return browser.newPage()
  }
}
const browser = new Browser();

function httpGet(url) {
  const httpx = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    let req = httpx.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(`Error ${res.statusCode} trying to get geojson file from ${url}`);
      }
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => resolve(rawData) );
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

process.on("warning", (e) => console.warn(e.stack));

const cache = {};
async function configCache(page) {
  await page.setRequestInterception(true);

  page.on('request', async (request) => {
      const url = request.url();
      if (cache[url] && cache[url].expires > Date.now()) {
          await request.respond(cache[url]);
          return;
      }
      request.continue();
  });
  
  page.on('response', async (response) => {
      const url = response.url();
      const headers = response.headers();
      const cacheControl = headers['cache-control'] || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const maxAge = maxAgeMatch && maxAgeMatch.length > 1 ? parseInt(maxAgeMatch[1], 10) : 0;
      if (maxAge) {
          if (cache[url] && cache[url].expires > Date.now()) return;
  
          let buffer;
          try {
              buffer = await response.buffer();
          } catch (error) {
              return;
          }
  
          cache[url] = {
              status: response.status(),
              headers: response.headers(),
              body: buffer,
              expires: Date.now() + (maxAge * 1000),
          };
      }
  });
}

export default function(options) {
  return new Promise(function(resolve, reject) {
    options = options || {};
    options.geojson = (options.geojson && (typeof options.geojson === 'string' ? options.geojson : JSON.stringify(options.geojson))) || '';
    options.geojsonfile = options.geojsonfile || '';
    options.height = options.height || 600;
    options.width = options.width || 800;
    options.center = options.center || '';
    options.zoom = options.zoom || '';
    options.maxZoom = options.maxZoom || 15;
    options.attribution = options.attribution || 'osm-static-maps | © OpenStreetMap contributors';
    options.tileserverUrl = options.tileserverUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    options.vectorserverUrl = options.vectorserverUrl || '';
    options.vectorserverToken = options.vectorserverToken || 'no-token';
    options.imagemin = options.imagemin || false;
    options.oxipng = options.oxipng || false;
    options.arrows = options.arrows || false;
    options.markerVisible = options.markerVisible !== false; // TRUE par défaut
    options.scale = (options.scale && (typeof options.scale === 'string' ? options.scale : JSON.stringify(options.scale))) || false;
    options.markerIconOptions = (options.markerIconOptions && (typeof options.markerIconOptions === 'string' ? options.markerIconOptions : JSON.stringify(options.markerIconOptions))) || false;
    options.style = (options.style && (typeof options.style === 'string' ? options.style : JSON.stringify(options.style))) || false;
    options.timeout = typeof options.timeout == undefined ? 60000 : options.timeout;
    options.haltOnConsoleError = !!options.haltOnConsoleError;
    
    // Fonction helper pour convertir en booléen
    const parseBoolean = (value, defaultValue = true) => {
      if (value === undefined || value === null) return defaultValue;
      if (value === false || value === 'false' || value === '0' || value === 0) return false;
      if (value === true || value === 'true' || value === '1' || value === 1) return true;
      return defaultValue;
    };
    
    // Gestion correcte des booléens (supporte: true/false, "true"/"false", 1/0, "1"/"0")
    options.showLegend = parseBoolean(options.showLegend, true);
    options.showScale = parseBoolean(options.showScale, true);
    options.showNorthArrow = parseBoolean(options.showNorthArrow, true);
    options.forceTransparentFill = parseBoolean(options.forceTransparentFill, false);
    
    (async () => {

      if (options.geojsonfile) {
        if (options.geojson) {
          throw new Error(`Only one option allowed: 'geojsonfile' or 'geojson'`)
        }
        if (options.geojsonfile.startsWith("http://") || options.geojsonfile.startsWith("https://")) {
          options.geojson = await httpGet(options.geojsonfile)
        }
        else {
          options.geojson = readFileSync(
            options.geojsonfile == "-"
              ? process.stdin.fd
              : options.geojsonfile,
            "utf8"
          );
        }
      }

      if (options.routes) {
        try {
          // Parser les routes si c'est une chaîne
          if (typeof options.routes === 'string') {
            try {
              options.routes = JSON.parse(options.routes);
            } catch (err) {
              console.error('Failed to parse routes string:', err);
              throw new Error('Invalid routes JSON format');
            }
          }
          
          // Valider les coordonnées
          const { origin, destination } = options.routes;
          if (!origin || !destination) {
            throw new Error('Routes must contain origin and destination');
          }
          if (!Array.isArray(origin) || origin.length !== 2 || !Array.isArray(destination) || destination.length !== 2) {
            throw new Error('Origin and destination must be arrays of [longitude, latitude]');
          }
          
          // Configuration par défaut (véhicule = bleu, vol d'oiseau = rouge)
          if (!options.routes.vehicleOptions) {
            options.routes.vehicleOptions = { color: "#3388ff", weight: 5 };
          }
          if (!options.routes.straightOptions) {
            options.routes.straightOptions = { color: "#ff0000", weight: 3, dashArray: "5,5" };
          }
          
          if (options.routes.showVehicle === undefined) options.routes.showVehicle = true;
          if (options.routes.showStraight === undefined) options.routes.showStraight = true;
          
          const defaultMarkerObj = {
            iconUrl: `data:image/png;base64,${files.markericonpng}`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            visible: true
          };

          // Configuration des marqueurs d'origine
          if (!options.routes.originMarker) {
            options.routes.originMarker = defaultMarkerObj;
          } else {
            if (options.routes.originMarker.visible === undefined) {
              options.routes.originMarker.visible = true;
            }
            if (!options.routes.originMarker.iconUrl) {
              options.routes.originMarker.iconUrl = `data:image/png;base64,${files.markericonpng}`;
            }
            if (!options.routes.originMarker.iconSize) {
              options.routes.originMarker.iconSize = [25, 41];
            }
            if (!options.routes.originMarker.iconAnchor) {
              options.routes.originMarker.iconAnchor = [12, 41];
            }
            
            // Configuration du cercle
            if (options.routes.originMarker.circle === undefined) {
              options.routes.originMarker.circle = {
                visible: true,
                radius: 500,
                color: '#3388ff',
                fillColor: '#3388ff',
                fillOpacity: 0.2,
                weight: 2,
                legend: "Zone d'influence départ"
              };
            } else if (options.routes.originMarker.circle && options.forceTransparentFill) {
              options.routes.originMarker.circle.fillOpacity = 0.3;
            }
          }

          // Configuration des marqueurs de destination
          if (!options.routes.destinationMarker) {
            options.routes.destinationMarker = defaultMarkerObj;
          } else {
            if (options.routes.destinationMarker.visible === undefined) {
              options.routes.destinationMarker.visible = true;
            }
            if (!options.routes.destinationMarker.iconUrl) {
              options.routes.destinationMarker.iconUrl = `data:image/png;base64,${files.markericonpng}`;
            }
            if (!options.routes.destinationMarker.iconSize) {
              options.routes.destinationMarker.iconSize = [25, 41];
            }
            if (!options.routes.destinationMarker.iconAnchor) {
              options.routes.destinationMarker.iconAnchor = [12, 41];
            }
            
            if (options.routes.destinationMarker.circle === undefined) {
              options.routes.destinationMarker.circle = {
                visible: true,
                radius: 500,
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.2,
                weight: 2,
                legend: "Zone d'influence arrivée"
              };
            } else if (options.routes.destinationMarker.circle && options.forceTransparentFill) {
              options.routes.destinationMarker.circle.fillOpacity = 0.3;
            }
          }

          const { 
            showVehicle,
            showStraight,
            vehicleOptions, 
            straightOptions,
            originMarker,
            destinationMarker
          } = options.routes;
        
          const features = [];

          // Ajout du marqueur d'origine
          if (originMarker.visible) {
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: origin },
              properties: {
                markerOptions: {
                  visible: true,
                  circle: originMarker.circle,
                  iconOptions: {
                    iconUrl: originMarker.iconUrl,
                    iconSize: originMarker.iconSize,
                    iconAnchor: originMarker.iconAnchor
                  },
                  label: originMarker.label || null,
                  legend: originMarker.legend || null,
                  labelStyle: originMarker.labelStyle || 'style1',
                  customLabelStyle: originMarker.customLabelStyle || null
                }
              }
            });
          }

          // Ajout du marqueur de destination
          if (destinationMarker.visible) {
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: destination },
              properties: {
                markerOptions: {
                  visible: true,
                  circle: destinationMarker.circle,
                  iconOptions: {
                    iconUrl: destinationMarker.iconUrl,
                    iconSize: destinationMarker.iconSize,
                    iconAnchor: destinationMarker.iconAnchor
                  },
                  label: destinationMarker.label || null,
                  legend: destinationMarker.legend || null,
                  labelStyle: destinationMarker.labelStyle || 'style2',
                  customLabelStyle: destinationMarker.customLabelStyle || null
                }
              }
            });
          }
          
          // Ajout de l'itinéraire véhicule
          if (showVehicle) {
            const vehicleGeometry = await calculateVehicleRoute(origin, destination);
            if (vehicleGeometry) {
              const distance = calculateDistance(vehicleGeometry.coordinates);
              features.push({
                type: "Feature",
                geometry: vehicleGeometry,
                properties: {
                  routeType: "vehicle",
                  pathOptions: vehicleOptions,
                  distance: formatDistance(distance)
                }
              });
            } else {
              console.warn('Vehicle route calculation failed, skipping vehicle route');
            }
          }
          
          // Ajout de l'itinéraire direct
          if (showStraight) {
            const straightGeometry = createStraightLineRoute(origin, destination);
            const distance = calculateDistance(straightGeometry.coordinates);
            features.push({
              type: "Feature",
              geometry: straightGeometry,
              properties: {
                routeType: "straight",
                pathOptions: straightOptions,
                distance: formatDistance(distance)
              }
            });
          }
          
          // Intégration avec le GeoJSON existant
          if (features.length > 0) {
            const routesFeatureCollection = {
              type: "FeatureCollection",
              features: features
            };
            
            if (options.geojson) {
              const existingGeoJson = JSON.parse(options.geojson);
              options.geojson = JSON.stringify({
                type: "FeatureCollection",
                features: [
                  ...routesFeatureCollection.features,
                  ...(existingGeoJson.features || [existingGeoJson])
                ]
              });
            } else {
              options.geojson = JSON.stringify(routesFeatureCollection);
            }
          }
        } catch (e) {
          console.error('Error processing routes:', e);
          throw new Error(`Routes processing failed: ${e.message}`);
        }
      }
      
      const html = replacefiles(template(options));

      if (options.renderToHtml) {
        return resolve(html);
      }

      const page = await browser.getPage();
      await configCache(page);
      try {
        page.on('error', function (err) { reject(err.toString()) })
        page.on('pageerror', function (err) { reject(err.toString()) })
        if (options.haltOnConsoleError) {
          page.on('console', function (msg) {
            if (msg.type() === "error") {
              reject(JSON.stringify(msg));
            }
          })
        }
        await page.setViewport({
          width: Number(options.width),
          height: Number(options.height)
        });

        await page.setContent(html);
        await page.waitForFunction(() => window.mapRendered === true, { timeout: Number(options.timeout) });

        let imageBinary = await page.screenshot({
          type: options.type || 'png',
          quality: options.type === 'jpeg' ? Number(options.quality || 100) : undefined,
          fullPage: true
        });

        if (options.imagemin) {
          const imagemin = (await import("imagemin")).default;
          const imageminJpegtran = (await import("imagemin-jpegtran")).default;
          const imageminOptipng = (await import("imagemin-optipng")).default;
          const plugins = []
          if (options.type === 'jpeg') {
            plugins.push(imageminJpegtran());
          } else {
            plugins.push(imageminOptipng());
          }
          (async () => {
            resolve(await imagemin.buffer(
              Buffer.from(imageBinary),
              {
                plugins,
              }
            ))
          })();
        } else {
          if (options.oxipng) {
            const child = spawn('/root/.cargo/bin/oxipng', ['-o0', '-s', '-']);
            child.stdin.on('error', function() {});
            child.stdin.write(imageBinary);
            child.stdin.end();
            let newimg = [];
            child.stdout.on('data', data => newimg.push(data));
            child.on('close', () => resolve(Buffer.concat(newimg)));
            child.on('error', e => reject(e.toString()));
          } else {
            resolve(imageBinary);
          }
        }

      }
      catch(e) {
        page.close();
        console.log("PAGE CLOSED with err" + e);
        throw(e);
      }
      page.close();

    })().catch(reject)
  });
};