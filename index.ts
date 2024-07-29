import { z } from "zod";
const Message = z.object({
  role: z.string(),
  name: z.string().optional(),
  content: z.string(),
});

const Input = z.object({
  messages: z.array(Message),
});

Bun.serve({
  port: Bun.env.PORT ?? "3000",

  async fetch(request) {
    console.debug("received request", request.url);

    // Do nothing with the OAuth callback, for now. Just return a 200.
    if (new URL(request.url).pathname === "/oauth/callback") {
      console.debug("received oauth callback");
      return Response.json({ ok: true }, { status: 200 });
    }

    // Parsing with Zod strips unknown Copilot-specific fields in the request
    const json = await request.json();
    const input = Input.safeParse(json);

    if (!input.success) {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }

    const messages = input.data.messages;
    console.debug("received input", JSON.stringify(json, null, 4));
    console.debug("received messages", JSON.stringify(messages, null, 4));

    let content = null;
    if (messages[messages.length - 1].content.toLowerCase().includes('ping')) {
      content = "pong";
    } else {
      content = "I'm sorry, I don't understand that command. Please try again.";
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
