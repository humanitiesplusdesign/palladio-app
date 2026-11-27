To build Palladio locally, first [make sure you have yarn installed](https://yarnpkg.com/en/docs/install), then use yarn to install the dependencies and build the assets:

```
git clone https://github.com/humanitiesplusdesign/palladio-app.git
cd palladio-app
yarn install
yarn build
```

Then simply run a local web server from this directory -- if you have python installed, you can just use:
```
python -m http.server
```
or on python 2.x:
```
python -m SimpleHTTPServer
```

To run on the latest version of main Palladio framework for testing purposes:

1) First clone the palladio framework repo, and from inside it run `yarn link`:

    ```
    git clone https://github.com/humanitiesplusdesign/palladio.git
    cd palladio
    yarn link
    ```

2) Then from within your clone of this (`palladio-app`) repo, run `yarn link palladio`.

## Embedding a read-only view

Any project can be shown as a single read-only view (map, graph, table or gallery) for embedding in another site with an `<iframe>`. Viewers can pan, zoom, hover and use the project's saved filters, but can't edit the data or settings.

In the app, open a visualization and click **Share / Embed** to get a link and `<iframe>` code. You can also build links by hand:

```
index.html#/visualization?embed=map&file=<URL-encoded link to a Palladio .json file>
index.html#/visualization?embed=graph&data=<base64url of the gzipped Palladio .json>
```

- `embed` is `map`, `graph`, `table` or `gallery`.
- `file` loads a project saved with **Download**. The server hosting it must allow cross-origin (CORS) requests, e.g. GitHub Pages or a gist.
- `data` puts the whole project in the link, so no hosting is needed. It suits small projects. To make one from a saved file: `gzip -c project.json | base64 | tr '+/' '-_' | tr -d '=\n'`.

The project's saved settings and filters are restored, so configure the view and filters before you click Share / Embed (or Download).

## Running with Docker

The `Dockerfile` builds the assets and serves the site with nginx on port 80.

```
docker build --platform linux/amd64 -t palladio-app .
docker run -p 8080:80 palladio-app        # then open http://localhost:8080
```

`--platform linux/amd64` matters when building on an Apple Silicon Mac, because Azure runs amd64 images.

The `FRAME_ANCESTORS` environment variable controls which sites may show Palladio in an iframe. The default `*` allows any site. To restrict it: `-e FRAME_ANCESTORS="'self' https://example.org"`.

### Deploying to Azure

Push the image to an Azure Container Registry, then run it on App Service or Container Apps:

```
az acr create -g <resource-group> -n <registry> --sku Basic
az acr login -n <registry>
docker tag palladio-app <registry>.azurecr.io/palladio-app:latest
docker push <registry>.azurecr.io/palladio-app:latest

# Container Apps (scales to zero; simplest)
az containerapp up -g <resource-group> -n palladio \
  --image <registry>.azurecr.io/palladio-app:latest \
  --registry-server <registry>.azurecr.io \
  --ingress external --target-port 80
```

On App Service (Web App for Containers), point the app at the same image. It listens on port 80, which is App Service's default. Set `FRAME_ANCESTORS` as an app setting or container environment variable.
