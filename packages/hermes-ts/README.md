# hermes-web-ts

TypeScript client for the [hermes-web](https://github.com/in-th3-l00p/hermes-web) API — put your [Hermes agent](https://hermes-agent.nousresearch.com) on the web.

## Install

```
npm i hermes-web-ts
```

## Usage

```ts
import { HermesClient } from "hermes-web-ts";

const client = new HermesClient({
  baseUrl: "https://agent.example.com",
  tokenProvider: async () => fetchTokenFromYourBackend(),
});

const status = await client.status();
```

Works in browsers, Node ≥18, and Bun. Errors are thrown as `HermesApiError` with `status` and `code`.
