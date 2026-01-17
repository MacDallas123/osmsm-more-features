# OSM Static Maps - Guide d'utilisation complet

## 📋 Table des matières
- [Installation](#installation)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Paramètres de l'API](#paramètres-de-lapi)
- [Cas d'usage détaillés](#cas-dusage-détaillés)

---

## 🚀 Installation

```bash
# Installation globale
sudo npm i -g osm-static-maps

# Lancement du serveur
osmsm serve
```

Le serveur démarre par défaut sur `http://localhost:3000`

---

## 📍 Exemples d'utilisation

### 1. **Carte simple avec un point**

```
http://localhost:3000/?geojson={"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[11.519596,3.868177]}}]}&height=400&width=600
```

**Résultat attendu :** Une carte centrée sur le point avec le marqueur Leaflet par défaut.

---

### 2. **Itinéraire simple (véhicule + vol d'oiseau)**

```
http://localhost:3000/?routes={"origin":[11.729596,3.768177],"destination":[11.319596,3.868177]}
```

**Résultat attendu :**
- Marqueurs par défaut aux points de départ et d'arrivée
- Ligne bleue en pointillés (vol d'oiseau)
- Ligne verte (trajet véhicule via OSRM)
- Distances affichées sur les lignes
- Légende, échelle et flèche Nord

---

### 3. **Itinéraire avec marqueurs personnalisés**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "originMarker":{
    "label":"DÉPART",
    "labelStyle":"style1",
    "circle":{
      "visible":true,
      "radius":10000,
      "color":"purple",
      "fillColor":"green",
      "fillOpacity":0.4,
      "weight":2,
      "legend":"Zone d'influence départ"
    }
  },
  "destinationMarker":{
    "label":"ARRIVÉE",
    "labelStyle":"style2",
    "circle":{
      "visible":true,
      "radius":8000,
      "color":"red",
      "fillColor":"orange",
      "fillOpacity":0.4,
      "weight":2,
      "legend":"Zone d'influence arrivée"
    }
  }
}&height=600&width=1000
```

**Résultat attendu :**
- Marqueurs avec labels personnalisés
- Cercles de rayon autour de chaque marqueur
- Légende incluant les zones d'influence

---

### 4. **Personnalisation des couleurs d'itinéraire**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "vehicleOptions":{"color":"#FF6B6B","weight":6},
  "straightOptions":{"color":"#4ECDC4","weight":3,"dashArray":"10,5"}
}
```

**Résultat attendu :**
- Ligne de véhicule rouge épaisse
- Ligne droite turquoise en pointillés

---

### 5. **Afficher uniquement le trajet véhicule**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "showStraight":false
}
```

**Résultat attendu :** Seul le trajet véhicule est affiché (pas de ligne droite).

---

### 6. **Marqueurs personnalisés sans itinéraires**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "showVehicle":false,
  "showStraight":false,
  "originMarker":{
    "iconUrl":"https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    "iconSize":[25,41],
    "iconAnchor":[12,41],
    "label":"Point A",
    "circle": {
      "visible": false
    }
  },
  "destinationMarker":{
    "iconUrl":"https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    "iconSize":[25,41],
    "iconAnchor":[12,41],
    "label":"Point B"
  }
}
```

**Résultat attendu :** Deux marqueurs colorés personnalisés avec labels, sans aucune ligne.

---

### 7. **Masquer un marqueur**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "originMarker":{"visible":false}
}
```

**Résultat attendu :** Seul le marqueur de destination est visible, avec les itinéraires.

---

### 8. **Image haute résolution**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177]
}&height=1200&width=1920&maxZoom=17
```

**Résultat attendu :** Image HD (1920x1200px) avec zoom élevé.

---

### 9. **Désactiver les éléments de la carte**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177]
}&showLegend=false&showScale=false&showNorthArrow=false
```

**Résultat attendu :** Carte épurée sans légende, échelle ni flèche Nord.

---

### 10. **Changement du serveur de tuiles**

#### Utiliser OpenTopoMap (relief)
```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177]
}&tileserverUrl=https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png
```

**Résultat attendu :** Carte avec relief topographique.

#### Utiliser CartoDB Dark (mode sombre)
```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177]
}&tileserverUrl=https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
```

**Résultat attendu :** Carte avec thème sombre.

#### Utiliser Stamen Watercolor (artistique)
```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177]
}&tileserverUrl=https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg
```

**Résultat attendu :** Carte au rendu aquarelle artistique.

---

### 11. **GeoJSON personnalisé avec marqueurs contrôlés**

```
http://localhost:3000/?geojson={
  "type":"FeatureCollection",
  "features":[
    {
      "type":"Feature",
      "geometry":{"type":"Point","coordinates":[11.519596,3.868177]},
      "properties":{
        "markerOptions":{
          "visible":true,
          "label":"Point d'intérêt",
          "labelStyle":"style2",
          "iconOptions":{
            "iconUrl":"https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
            "iconSize":[25,41],
            "iconAnchor":[12,41]
          }
        }
      }
    }
  ]
}
```

**Résultat attendu :** Marqueur vert personnalisé avec label en gras.

---

### 12. **Combinaison complète avec serveur de tuiles personnalisé**

```
http://localhost:3000/?routes={
  "origin":[11.729596,3.768177],
  "destination":[11.319596,3.868177],
  "originMarker":{"label":"DÉPART"},
  "destinationMarker":{"label":"ARRIVÉE"}
}&tileserverUrl=https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png&height=800&width=1200
```

**Résultat attendu :** Carte haute résolution avec thème clair et labels personnalisés.

---


### 13. Exemple POST (avec curl) pour générer une image avec un point, un marqueur personnalisé et un cercle d'influence

#### POST (Linux/macOS) :
```bash
curl -X POST "http://localhost:3000/" \
  -H "Content-Type: application/json" \
  -d '{
    "geojson": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [11.519596, 3.868177]
          },
          "properties": {
            "markerOptions": {
              "visible": true,
              "label": "Point d'intérêt",
              "labelStyle": "style2",
              "iconOptions": {
                "iconUrl": "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
                "iconSize": [25, 41],
                "iconAnchor": [12, 41]
              },
              "circle": {
                "visible": true,
                "radius": 500,
                "color": "#3388ff",
                "fillColor": "#3388ff",
                "fillOpacity": 0.3,
                "weight": 2,
                "legend": "Zone d'influence 5km"
              }
            }
          }
        }
      ]
    },
    "height": 600,
    "width": 800
  }' \
  -o marker_singleton.png
```

#### POST (Windows avec PowerShell) :
```bash
curl -Method POST "http://localhost:3000/" `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{
    "geojson": {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [11.519596, 3.868177]
        },
        "properties": {
          "markerOptions": {
            "visible": true,
            "label": "Point d''intérêt",
            "labelStyle": "style2",
            "circle": {
              "visible": true,
              "radius": 500,
              "color": "#3388ff",
              "fillColor": "#3388ff",
              "fillOpacity": 0.3,
              "weight": 2,
              "legend": "Zone d''influence 5km"
            }
          }
        }
      }]
    },
    "height": 600,
    "width": 800
  }' `
  -OutFile "marker_singleton.png"
```

## 14. Afficher un cercle d’influence autour d’un point d’intérêt

GET :
```txt
http://localhost:3000/?routes={
  "origin":[11.519596,3.868177],
  "destination":[11.519596,3.868177],
  "showVehicle": false,
  "showStraight": false,
  "originMarker": {
    "label": "Point d'intérêt",
    "circle": {
      "visible": true,
      "radius": 5000,
      "color": "#3388ff",
      "fillColor": "#3388ff",
      "fillOpacity": 0.3,
      "weight": 2,
      "legend": "Zone d'influence"
    }
  },
  "destinationMarker": {"visible": false}
}
```

POST (Linux/macOS) :
```bash
curl -X POST "http://localhost:3000/" \
  -H "Content-Type: application/json" \
  -d '{
    "routes": {
      "origin": [11.519596,3.868177],
      "destination": [11.519596,3.868177],
      "showVehicle": false,
      "showStraight": false,
      "originMarker": {
        "label": "Point d'\''intérêt",
        "circle": {
          "visible": true,
          "radius": 500,
          "color": "#3388ff",
          "fillColor": "#3388ff",
          "fillOpacity": 0.3,
          "weight": 2,
          "legend": "Zone d'\''influence"
        }
      },
      "destinationMarker": {"visible": false}
    },
    "height": 600,
    "width": 800
  }' \
  -o circle_influence.png
```

POST (Windows PowerShell) :
```
curl -Method POST "http://localhost:3000/" `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{
    "routes": {
      "origin": [11.519596,3.868177],
      "destination": [11.519596,3.868177],
      "showVehicle": false,
      "showStraight": false,
      "originMarker": {
        "label": "Point d''intérêt",
        "circle": {
          "visible": true,
          "radius": 500,
          "color": "#3388ff",
          "fillColor": "#3388ff",
          "fillOpacity": 0.3,
          "weight": 2,
          "legend": "Zone d''influence"
        }
      },
      "destinationMarker": {"visible": false}
    },
    "height": 600,
    "width": 800
  }' `
  -OutFile "circle_influence.png"
```

### 15. **Un seul marqueur**

```
https://osmsm.reimca-app.com/?routes={
  "origin":[11.729596,3.768177],
  "detination":[11.729596,3.768177],
  "originMarker":{
    "label":"DÉPART",
    "labelStyle":"style1",
    "circle":{
      "visible":false,
      "radius":10000,
      "color":"purple",
      "fillColor":"green",
      "fillOpacity":0.4,
      "weight":2,
      "legend":"Zone d'influence départ"
    }
  },
  "destinationMarker":{
    "label":"ARRIVÉE",
    "labelStyle":"style2",
    "visible":false,
    "circle":{
      "visible":false,
      "radius":8000,
      "color":"red",
      "fillColor":"orange",
      "fillOpacity":0.4,
      "weight":2,
      "legend":"Zone d'influence arrivée"
    }
  }
}&height=600&width=1000
```

_Note_: For GET requests, URL-encode the value after `routes=` (e.g., using [urlencoder.org](https://www.urlencoder.org/)), or use this prettified version to understand available parameters.

## 🔧 Paramètres de l'API

### Paramètres généraux

| Paramètre | Type | Description | Défaut |
|-----------|------|-------------|--------|
| `height` | number | Hauteur de l'image (px) | 600 |
| `width` | number | Largeur de l'image (px) | 800 |
| `maxZoom` | number | Niveau de zoom maximum | 15 |
| `center` | string | Centre de la carte `"lon,lat"` | Auto (centré sur GeoJSON) |
| `zoom` | number | Niveau de zoom | Auto |
| `markerVisible` | boolean | Afficher les marqueurs par défaut | `true` |
| `showLegend` | boolean | Afficher la légende | `true` |
| `showScale` | boolean | Afficher l'échelle | `true` |
| `showNorthArrow` | boolean | Afficher la flèche Nord | `true` |
| `tileserverUrl` | string | URL du serveur de tuiles | OSM standard |

### Paramètre `routes`

Structure JSON pour définir des itinéraires :

```json
{
  "origin": [longitude, latitude],
  "destination": [longitude, latitude],
  "showVehicle": true,
  "showStraight": true,
  "vehicleOptions": {
    "color": "#3388ff",
    "weight": 5
  },
  "straightOptions": {
    "color": "#ff0000",
    "weight": 3,
    "dashArray": "5,5"
  },
  "originMarker": {
    "visible": true,
    "iconUrl": "...",
    "iconSize": [25, 41],
    "iconAnchor": [12, 41],
    "label": "Départ",
    "labelStyle": "style1",
    "circle": {
      "visible": true,
      "radius": 500,
      "color": "#3388ff",
      "fillColor": "#3388ff",
      "fillOpacity": 0.2,
      "weight": 2,
      "legend": "Zone de départ"
    }
  },
  "destinationMarker": { /* même structure */ }
}
```

**Note :** Les couleurs par défaut sont :
- **Itinéraire véhicule** : Bleu (`#3388ff`)
- **Vol d'oiseau** : Rouge (`#ff0000`)
- **Étiquettes de distance** : Même couleur que leur ligne respective

### Serveurs de tuiles disponibles

Vous pouvez personnaliser l'apparence de la carte en utilisant différents serveurs de tuiles via le paramètre `tileserverUrl` :

#### Serveurs gratuits populaires

| Nom | URL | Description |
|-----|-----|-------------|
| **OpenStreetMap** (défaut) | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Carte standard OSM |
| **OpenTopoMap** | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | Carte topographique avec relief |
| **CartoDB Positron** | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | Thème clair minimaliste |
| **CartoDB Dark Matter** | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | Thème sombre |
| **Stamen Terrain** | `https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.jpg` | Relief et végétation |
| **Stamen Watercolor** | `https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg` | Style aquarelle artistique |
| **Esri WorldImagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Images satellite |
| **Esri WorldStreetMap** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}` | Carte détaillée Esri |

**Exemple d'utilisation :**
```
http://localhost:3000/?routes={"origin":[11.7,3.7],"destination":[11.3,3.8]}&tileserverUrl=https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png
```

**Note importante :** Certains serveurs de tuiles ont des limites d'utilisation. Consultez leurs conditions avant une utilisation intensive.

### Styles de labels

- **`style1`** : Label encadré avec fond blanc semi-transparent
- **`style2`** : Texte en gras avec contour blanc

Vous pouvez aussi définir `customLabelStyle` :

```json
"customLabelStyle": {
  "backgroundColor": "rgba(255,0,0,0.8)",
  "textColor": "white",
  "padding": "5px 10px",
  "borderRadius": "5px",
  "fontWeight": "bold"
}
```

---

## 🎯 Cas d'usage détaillés

### Utilisation en Node.js

```javascript
import osmsm from 'osm-static-maps';

const imageBinary = await osmsm({
  routes: {
    origin: [11.729596, 3.768177],
    destination: [11.319596, 3.868177],
    originMarker: {
      label: "Départ",
      circle: {
        visible: true,
        radius: 5000,
        color: "blue",
        fillColor: "lightblue",
        fillOpacity: 0.3
      }
    }
  },
  height: 800,
  width: 1200
});

// Sauvegarder l'image
import fs from 'fs';
fs.writeFileSync('map.png', imageBinary);
```

### Utilisation en CLI

```bash
# Créer une carte depuis un GeoJSON
echo '{"type":"Point","coordinates":[11.5,3.8]}' | osmsm -f - > map.png

# Créer un itinéraire
osmsm --routes '{"origin":[11.7,3.7],"destination":[11.3,3.8]}' > route.png
```

---

## 🐛 Résolution des problèmes

### Les marqueurs ne s'affichent pas

**Solution :** Vérifiez que `markerVisible=true` dans l'URL ou que `visible: true` est défini dans `markerOptions`.

### L'itinéraire véhicule ne s'affiche pas

**Cause possible :** L'API OSRM n'a pas pu calculer l'itinéraire (zones non routables).  
**Solution :** Vérifiez les coordonnées ou utilisez uniquement `showStraight`.

### Erreur "Invalid routes JSON format"

**Cause :** Le JSON est mal formé.  
**Solution :** Utilisez un validateur JSON (jsonlint.com) pour vérifier votre syntaxe.

---

## 📝 Notes importantes

1. **Coordonnées** : Toujours au format `[longitude, latitude]` (ordre inverse de Google Maps)
2. **Encodage URL** : Pour les requêtes GET, encodez les caractères spéciaux (`#` → `%23`)
3. **Performance** : Les cercles de grande taille peuvent ralentir le rendu
4. **OSRM** : Le calcul d'itinéraire véhicule utilise l'API publique OSRM (limité en débit)

---

## 🔗 Liens utiles

- [Documentation Leaflet](https://leafletjs.com/)
- [Spécification GeoJSON](https://geojson.org/)
- [Marqueurs Leaflet colorés](https://github.com/pointhi/leaflet-color-markers)

---

## 📄 Licence

GPLv2