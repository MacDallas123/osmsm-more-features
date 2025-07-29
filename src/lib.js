import { readFileSync } from 'fs';
import http from 'http';
import https from "https";
import handlebars from 'handlebars';
import { spawn } from "child_process";
import { fileURLToPath } from 'url';

let chrome = { args: [] };
let puppeteer;

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  // running on the Vercel platform.
  chrome = import("chrome-aws-lambda");
  puppeteer = (await import("puppeteer-core")).default;
} else {
  // running locally.
  puppeteer = (await import("puppeteer")).default;
}

async function calculateVehicleRoute(origin, destination) {
  // Utilisation de l'API OSRM (Open Source Routing Machine)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
    const response = await httpGet(url);
    const data = JSON.parse(response);
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
  const R = 6371e3; // Rayon de la Terre en mètres
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

    // Calculer les bounds initiaux
    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    const bounds = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
    ];

    // Calculer le ratio image/itinéraire
    const latRange = bounds[1][0] - bounds[0][0];
    const lngRange = bounds[1][1] - bounds[0][1];
    const routeRatio = lngRange / latRange;
    const imageRatio = width / height;

    // Ajuster les bounds pour correspondre au ratio de l'image
    if (routeRatio > imageRatio) {
        // Étendre verticalement
        const neededHeight = lngRange / imageRatio;
        const center = (bounds[0][0] + bounds[1][0]) / 2;
        bounds[0][0] = center - neededHeight / 2;
        bounds[1][0] = center + neededHeight / 2;
    } else {
        // Étendre horizontalement
        const neededWidth = latRange * imageRatio;
        const center = (bounds[0][1] + bounds[1][1]) / 2;
        bounds[0][1] = center - neededWidth / 2;
        bounds[1][1] = center + neededWidth / 2;
    }

    // Ajouter une marge de 10%
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
  /// browser singleton
  constructor() {
    this.browser = null;
  }
  async launch() {
    const executablePath = await chrome.executablePath
    return puppeteer.launch({
      args: [...chrome.args, "--no-sandbox", "--disable-setuid-sandbox"],
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
  // from https://stackoverflow.com/a/41471647/912450
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


// add network cache to cache tiles
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
              // some responses do not contain buffer and do not need to be catched
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
    // TODO: validate options to avoid template injection
    options = options || {};
    options.geojson = (options.geojson && (typeof options.geojson === 'string' ? options.geojson : JSON.stringify(options.geojson))) || '';
    options.geojsonfile = options.geojsonfile || '';
    options.height = options.height || 600;
    options.width = options.width || 800;
    options.center = options.center || '';
    options.zoom = options.zoom || '';
    //options.maxZoom = options.maxZoom || 17;
    options.maxZoom = options.maxZoom || 15;
    options.attribution = options.attribution || 'osm-static-maps | © OpenStreetMap contributors';
    options.tileserverUrl = options.tileserverUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    options.vectorserverUrl = options.vectorserverUrl || '';
    options.vectorserverToken = options.vectorserverToken || 'no-token';
    options.imagemin = options.imagemin || false;
    options.oxipng = options.oxipng || false;
    options.arrows = options.arrows || false;
    options.markerVisible = options.markerVisible || false;
    options.scale = (options.scale && (typeof options.scale === 'string' ? options.scale : JSON.stringify(options.scale))) || false;
    options.markerIconOptions = (options.markerIconOptions && (typeof options.markerIconOptions === 'string' ? options.markerIconOptions : JSON.stringify(options.markerIconOptions))) || false;
    options.style = (options.style && (typeof options.style === 'string' ? options.style : JSON.stringify(options.style))) || false;
    options.timeout = typeof options.timeout == undefined ? 60000 : options.timeout;
    options.haltOnConsoleError = !!options.haltOnConsoleError;
    options.showLegend = options.showLegend !== false;
    options.forceTransparentFill = options.forceTransparentFill !== true;
    options.showScale = options.showScale !== false;
    options.showNorthArrow = options.showNorthArrow !== false;
    
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

          if(!options.routes.vehicleOptions) options.routes.vehicleOptions = { color: "#3388ff", weight: 5 };
          if(!options.routes.straightOptions) options.routes.straightOptions = { color: "#ff0000", weight: 3, dashArray: "5.5" };
          
          if(!options.routes.showVehicle) options.routes.showVehicle = true;
          if(!options.routes.showStraight) options.routes.showStraight = true;
          const defaultObj = {
            //iconUrl: "data:image/png;base64,//markericonpng//", 
            //iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
            iconUrl: `data:image/png;base64,${files.markericonpng}`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            visible: true
          };

          if (!options.routes.originMarker) options.routes.originMarker = defaultObj;
          else {
              if (!options.routes.originMarker.visible) options.routes.originMarker.visible = true;
              if (!options.routes.originMarker.iconUrl) options.routes.originMarker.iconUrl = `data:image/png;base64,${files.markericonpng}`;
              // Ajouter les options de cercle par défaut
              if (!options.routes.originMarker.circle) {
                  options.routes.originMarker.circle = {
                      visible: true,
                      radius: 500,
                      color: '#3388ff',
                      fillColor: '#3388ff',
                      fillOpacity: 0.2,
                      weight: 2
                  };
              } else if (options.forceTransparentFill) {
                  options.routes.originMarker.circle.fillOpacity = 0.3;
              }
          }

          // Faire de même pour destinationMarker
          if (!options.routes.destinationMarker) options.routes.destinationMarker = defaultObj;
          else {
              if (!options.routes.destinationMarker.visible) options.routes.destinationMarker.visible = true;
              if (!options.routes.destinationMarker.iconUrl) options.routes.destinationMarker.iconUrl = `data:image/png;base64,${files.markericonpng}`;
              if (!options.routes.destinationMarker.circle) {
                  options.routes.destinationMarker.circle = {
                      legend: "circle legend",
                      visible: true,
                      radius: 500,
                      color: '#ff0000',
                      fillColor: '#ff0000',
                      fillOpacity: 0.2,
                      weight: 2
                  };
              } else if (options.forceTransparentFill) {
                  options.routes.originMarker.circle.fillOpacity = 0.3;
              }
          }

          const { 
            origin, 
            destination, 
            showVehicle,// = true, 
            showStraight,// = true,
            vehicleOptions,// = { color: "#3388ff", weight: 5 }, 
            straightOptions,// = { color: "#ff0000", weight: 3, dashArray: "5,5" },
            originMarker = {},
            destinationMarker = {}
          } = options.routes;
        
          //console.log("ROUTE OPTIONS", options.routes);
          const features = [];

          // Ajout des marqueurs
          if (originMarker?.visible !== false) {
             const markerFeature = {
                type: "Feature",
                geometry: { type: "Point", coordinates: origin },
                properties: {
                    markerOptions: {
                        circle: originMarker.circle,
                        iconOptions: {
                            iconUrl: originMarker.iconUrl || `data:image/png;base64,${files.markericonpng}`,
                            iconSize: originMarker.iconSize || [25, 41],
                            iconAnchor: originMarker.iconAnchor || [12, 41]
                        },
                        label: originMarker.label || null,
                        legend: originMarker.legend || null,
                        labelStyle: originMarker.labelStyle || 'style1',
                        customLabelStyle: originMarker.customLabelStyle || null
                    }
                }
            };
            features.push(markerFeature);
          }

          if (destinationMarker?.visible !== false) {
             const markerFeature = {
                type: "Feature",
                geometry: { type: "Point", coordinates: destination },
                properties: {
                    markerOptions: {
                        circle: destinationMarker.circle,
                        iconOptions: {
                            iconUrl: destinationMarker.iconUrl || `data:image/png;base64,${files.markericonpng}`,
                            iconSize: destinationMarker.iconSize || [25, 41],
                            iconAnchor: destinationMarker.iconAnchor || [12, 41]
                        },
                        label: destinationMarker.label || null,
                        legend: destinationMarker.legend || null,
                        labelStyle: destinationMarker.labelStyle || 'style2',
                        customLabelStyle: destinationMarker.customLabelStyle || null
                    }
                }
            };
            features.push(markerFeature);
          }
          
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
                },
              });
            }
          }
          
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
              },
              // pathOptions: straightOptions
            });
          }
          
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
                  ...(existingGeoJson.features || existingGeoJson)
                ]
              });
            } else {
              options.geojson = JSON.stringify(routesFeatureCollection);
            }
          }
        } catch (e) {
          console.error('Error processing routes:', e);
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
