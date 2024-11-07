const { z } = require("zod");

// Fields we want to extract from user profile
const OutputUser = z.object({
  isHubber: z.string(),
  login: z.string(),
  msft_alias: z.string().nullish(),
  name: z.string().nullish(),
  title: z.string().nullish(),
  cost_center: z.string().nullish(),
  manager: z.string().nullish(),
  country: z.string().nullish(),
  state: z.string().nullish(),
  bio: z.string().nullish(),
  recent: z.string().nullish(),
  twitter_username: z.string().transform((val: any) => val && `[@${val}](https://twitter.com/${val})`).nullish(),
  public_repos: z.number().nullish(),
  public_gists: z.number().nullish(),
  followers: z.number().nullish(),
  following: z.number().nullish(),
}).transform(({ login, isHubber, msft_alias, ...rest }: { login: string, isHubber: string, msft_alias: string | null, [key: string]: any }) => ({
  isHubber,
  ...rest
}));

async function getHubberInfo(handle: string, token: string) {
  handle = handle.replace("@", ""); // remove @ from handle

  const [profileResponse, orgChartResponse] = await Promise.all([
    fetch(`https://api.github.com/users/${handle}`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      }
    }),
    fetch(`https://api.github.com/repos/github/org-chart/contents/org-chart.json`, {
      headers: {
        "Accept": "application/vnd.github.raw+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    })
  ]);

  if (!profileResponse.ok) {
    return "user not found."
  }

  const [publicProfile, orgAllProfiles]: [any, any] = await Promise.all([
    profileResponse.json(),
    orgChartResponse.json()
  ]);

  const orgProfile = orgAllProfiles.find((user: { github_login: string }) => user.github_login === handle) || {};
  const isHubber = !!orgProfile.github_login

  const profileRaw = {
    isHubber: isHubber ? "✅" : "❌",
    ...orgProfile,
    ...publicProfile,
    recent: `[issues](https://github.com/search?q=author%3A${handle}&type=issues&s=created&o=desc) &#x7c; [pull requests](https://github.com/search?q=author%3A${handle}&type=pullrequests&s=created&o=desc) &#x7c; [commits](https://github.com/search?q=author%3A${handle}&type=commits&s=committer-date&o=desc)`,
  }

  if (profileRaw.twitter_username == null) delete profileRaw.twitter_username;

  if (orgProfile) {
    profileRaw.login = `[@${profileRaw.login}](https://github.com/${profileRaw.login}) ([${handle}@github.com](mailto:${handle}@github.com))`;
  } else {
    profileRaw.login = `[@${profileRaw.login}](https://github.com/${profileRaw.login})`;
  }

  const user = OutputUser.safeParse(profileRaw);

  if (user.success) {
    const table = `
| Key | Value |
| --- | --- |
${Object.entries(user.data).map(([key, value]) => `| **${key}** | ${value} |`).join("\r\n")}
      `;

    return table;
  }

  return "user not found."
}

Bun.serve({
  port: Bun.env.PORT ?? "3000",

  async fetch(request) {
    console.debug("received request", request.url);

    // Do nothing with the OAuth callback, for now. Just return a 200.
    if (new URL(request.url).pathname === "/oauth/callback") {
      console.debug("received oauth callback");
      return Response.json({ ok: true }, { status: 200 });
    }

    if (!request.headers.get("X-GitHub-Token")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const json = await request.json();
    const input: any = json;

    // get first word of the message 
    const firstWord = input.messages[input.messages.length - 1].content.split(" ")[0];
    const hubber = await getHubberInfo(firstWord, request.headers.get("X-GitHub-Token") as any);

    const messages = input.messages;

    let content = null;
    if (messages[messages.length - 1].content.toLowerCase().includes('ping')) {
      content = "pong";
    } else {
      content = hubber;
    }

    const data = {
      "id": "copilot-no-llm",
      "object": "chat.completion.chunk",
      "created": (new Date()).getTime(),
      "choices": [
        {
          "delta": {
            "content": content
          },
        },
      ]
    };

    return new Response(
      `data: ${JSON.stringify(data)}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  },
});