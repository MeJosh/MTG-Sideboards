import { Impit } from "impit";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

function moxfieldImporter(): Plugin {
  return {
    name: "moxfield-importer",
    configureServer(server) {
      server.middlewares.use("/api/moxfield", async (request, response, next) => {
        const deckId = request.url?.match(/^\/decks\/all\/([A-Za-z0-9_-]+)$/)?.[1];
        if (!deckId) return next();
        try {
          const client = new Impit({ browser: "chrome" });
          const upstream = await client.fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
            headers: {
              accept: "application/json",
              "accept-language": "en-US,en;q=0.9",
              origin: "https://moxfield.com",
              referer: "https://moxfield.com/",
            },
          });
          response.statusCode = upstream.status;
          response.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
          response.end(await upstream.text());
        } catch {
          response.statusCode = 502;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ error: "Moxfield import service was unavailable." }));
        }
      });
    },
  };
}

export default defineConfig({
  base: "/MTG-Sideboards/",
  plugins: [vue(), tailwindcss(), moxfieldImporter()],
});
