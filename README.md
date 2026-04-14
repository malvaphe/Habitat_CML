# Habitat RN2000 marini, costieri e litoranei

Web app statica (solo frontend) basata su MapLibre GL JS per visualizzare habitat Natura 2000 da **vector tiles**, con overlay dei siti marini da `data/siti_mare.geojson`.

## Avvio locale
Apri il progetto tramite un server HTTP (non `file://`), ad esempio:

- Python:
  - `python -m http.server 8000`
  - poi apri `http://localhost:8000/`