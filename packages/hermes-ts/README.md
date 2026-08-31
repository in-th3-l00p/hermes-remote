# @intheloop-studio/hermes-remote-client

TypeScript client for the [hermes-remote](https://github.com/in-th3-l00p/hermes-remote) API. Put your [Hermes agent](https://hermes-agent.nousresearch.com) on the web.

## Install

```
npm i @intheloop-studio/hermes-remote-client
```

## Usage

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";

const client = new HermesClient({
  baseUrl: "https://agent.example.com",
  tokenProvider: async () => fetchTokenFromYourBackend(),
});

const status = await client.status();
```

Works in browsers, Node ≥18, and Bun. Errors are thrown as `HermesApiError` with `status` and `code`.
