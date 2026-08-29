export { MGMT_ROUTES, type CliRouteSpec, type RouteParam } from "./catalog.ts";
export { buildArgv, registerMgmtRoutes } from "./routes.ts";
export { registerFsRoutes } from "./fs-routes.ts";
export {
  cliResponse,
  requireKeyScope,
  type ManagementOptions,
} from "./shared.ts";
