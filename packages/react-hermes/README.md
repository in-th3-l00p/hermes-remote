# hermes-web-react

React hooks for the [hermes-web](https://github.com/in-th3-l00p/hermes-web) API — put your [Hermes agent](https://hermes-agent.nousresearch.com) on the web.

## Install

```
npm i hermes-web-react hermes-web-ts
```

## Usage

```tsx
import { HermesClient, HermesProvider, useHermesClient } from "hermes-web-react";

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
