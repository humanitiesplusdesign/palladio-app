# Stage 1: install dependencies and copy their built files into assets/.
# The full Debian image is used because dependencies are installed from GitHub
# and need git. webpack 4 needs the legacy OpenSSL provider on Node 17+.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
COPY webpack.config.js ./
COPY js ./js
RUN NODE_OPTIONS=--openssl-legacy-provider yarn build

# Stage 2: serve the static site with nginx.
FROM nginx:1.27-alpine

# Which sites may show Palladio in an <iframe> (CSP frame-ancestors).
# "*" allows any site; restrict with e.g. "'self' https://example.org".
ENV FRAME_ANCESTORS="*"

COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/assets /usr/share/nginx/html/assets
COPY index.html palladio-app.css sample.json /usr/share/nginx/html/
COPY html /usr/share/nginx/html/html
COPY js /usr/share/nginx/html/js
COPY img /usr/share/nginx/html/img

EXPOSE 80
