/** @returns {import("vite").Plugin} */
export function appEnvPlugin() {
  return {
    name: "app-env-stub",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0];
        if (pathOnly !== "/__app-env") return next();
        res.setHeader("Content-Type", "application/json");
        res.end("{}");
      });
    },
  };
}
