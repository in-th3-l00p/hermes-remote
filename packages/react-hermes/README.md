# @intheloop-studio/hermes-remote-react

React hooks for the [hermes-remote](https://github.com/in-th3-l00p/hermes-remote) API. Put your [Hermes agent](https://hermes-agent.nousresearch.com) on the web.

## Install

```
npm i @intheloop-studio/hermes-remote-react @intheloop-studio/hermes-remote-client
```

## Usage

```tsx
import { HermesClient, HermesProvider, useHermesClient } from "@intheloop-studio/hermes-remote-react";

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
