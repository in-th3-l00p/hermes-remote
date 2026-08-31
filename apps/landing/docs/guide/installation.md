# Installation

The packages are published to npm under the `@intheloop-studio` scope. They are public, so `npm install` works with no registry setup.

## The server CLI

Install the CLI globally on the machine that runs your Hermes agent:

```bash
npm i -g @intheloop-studio/hermes-remote-cli
hermes-remote --help
```

This installs the `hermes-remote` binary (`hermes-api` is kept as an alias). Bun users can `bun add -g` instead; the server runs on Bun either way, so Bun must be installed on the host.

## The client packages

In your application:

```bash
npm i @intheloop-studio/hermes-remote-client        # any JS/TS app
npm i @intheloop-studio/hermes-remote-react         # React apps (re-exports the client)
```

The client is zero dependency and isomorphic: browsers, Node 18+, and Bun. The React package needs React 18 or later as a peer dependency.

## Embedding the server as a library

`@intheloop-studio/hermes-remote` exports `createApp` and `startServer`, so you can run the server inside your own Bun process instead of through the CLI. See [Custom auth providers](/auth/custom) for a full embedded example.

## Without a registry

Tarballs for all four packages are attached to every [GitHub release](https://github.com/in-th3-l00p/hermes-remote/releases). `npm i ./hermes-remote-cli-x.y.z.tgz` works without any registry configuration.

Next: the [quick start](/guide/quick-start).
