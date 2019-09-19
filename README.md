(Note: These instructions are based on the new forks of palladio updated by the [CIDR team at Stanford University Libraries](https://cidr.stanford.edu) -- they will be adjusted when everything is merged back upstream.)

To build Palladio locally, first [make sure you have yarn installed](https://yarnpkg.com/en/docs/install), then use yarn to install the dependencies and build the assets:

```
git clone https://github.com/simonwiles/palladio-app.git
cd palladio-app
git checkout cidr-2019
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
    git clone https://github.com/simonwiles/palladio.git
    cd palladio
    git checkout cidr-2019
    yarn link
    ```

2) Then from within your clone of this (`palladio-app`) repo, run `yarn link palladio`.
