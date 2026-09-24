import { ChatStore, UserStore, type User } from "@intheloop-studio/hermes-remote";
import { flag, parseArgs } from "../args.ts";
import { USAGE, fail, ok, type CliResult } from "../context.ts";

function describeUser(user: User): string {
  const identities = user.identities.map((i) => `${i.provider}:${i.subject}`).join(",");
  const state = user.disabled ? "disabled" : "active";
  return `${user.id}  ${state}  ${user.agentVisibility}  ${identities}`;
}

/** `hermes-remote users list|show|disable|enable|delete` on the host. */
export async function usersCommand(
  args: string[],
  paths: { usersDb: string; chatDb: string },
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const [action, id] = parsed.positionals;
  const store = new UserStore(paths.usersDb);
  if (action === "list") {
    const { users } = store.list(1_000, 0);
    return ok(users.length === 0 ? "no users" : users.map(describeUser).join("\n"));
  }
  if (action === "show" || action === "disable" || action === "enable" || action === "delete") {
    if (id === undefined) {
      return fail(`users ${action} requires a user id`);
    }
    const user = store.get(id);
    if (user === null) {
      return fail(`no such user: ${id}`);
    }
    if (action === "show") {
      return ok(JSON.stringify(user, null, 2));
    }
    if (action === "delete") {
      let sessions = 0;
      if (flag(parsed, "cascade") === "true") {
        const chat = new ChatStore(paths.chatDb);
        for (const archived of [false, true]) {
          for (const session of chat.listSessions({ userId: id, archived })) {
            chat.deleteSession(session.id);
            sessions += 1;
          }
        }
      }
      store.delete(id);
      return ok(`deleted user ${id}${sessions > 0 ? ` and ${sessions} session(s)` : ""}`);
    }
    return ok(describeUser(store.setDisabled(id, action === "disable") as User));
  }
  return fail(`unknown users action: ${action ?? "(none)"}\n\n${USAGE}`);
}
