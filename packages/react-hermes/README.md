# @in-th3-l00p/hermes-web-react

React hooks for the [hermes-web](https://github.com/in-th3-l00p/hermes-web) API — put your [Hermes agent](https://hermes-agent.nousresearch.com) on the web.

## Install

Packages are published to GitHub Packages. Point the `@in-th3-l00p` scope at it once (a GitHub token with `read:packages` is required):

```
echo "@in-th3-l00p:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

```
npm i @in-th3-l00p/hermes-web-react @in-th3-l00p/hermes-web-ts
```

## Usage

```tsx
import { HermesClient, HermesProvider, useHermesClient } from "@in-th3-l00p/hermes-web-react";

const client = new HermesClient({
  baseUrl: "https://agent.example.com",
  tokenProvider: async () => fetchTokenFromYourBackend(),
});

function App() {
  return (
    <HermesProvider client={client}>
      <Status />
    </HermesProvider>
  );
}

function Status() {
  const client = useHermesClient();
  // use the client in effects, queries, etc.
  return null;
}
```
