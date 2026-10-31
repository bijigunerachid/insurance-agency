export function createHealthController(healthService, clock) {
  return {
    live(req, res) {
      res.json({ status: 'ok' });
    },

    async ready(req, res) {
      const { ready, checks } = await healthService.readiness(req.log);
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
    },

    /**
     * Signed-in view: readiness and the server's clock. Two-step codes and audit times depend
     * on it, and the server is offline: the page compares it with the PC's clock.
     */
    async status(req, res) {
      const { ready, checks } = await healthService.readiness(req.log);
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks,
        serverTime: clock.now().toISOString(),
        backup: await healthService.backup(req.log),
      });
    },
  };
}
