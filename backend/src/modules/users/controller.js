import {
  createUserBody,
  listUsersQuery,
  updateUserBody,
  userIdParams,
  versionBody,
} from './schemas.js';

export function createUsersController(usersService) {
  const context = (req) => ({ actor: req.auth.user, request: req });
  const idOf = (req) => userIdParams.parse(req.params).id;

  /** Handler for an action on another user that takes { version } and returns the account. */
  const versioned = (method) => async (req, res) => {
    const id = idOf(req);
    res.json(await usersService[method](context(req), id, versionBody.parse(req.body)));
  };

  return {
    async roles(req, res) {
      res.json({ items: await usersService.listRoles() });
    },

    async list(req, res) {
      res.json(await usersService.list(listUsersQuery.parse(req.query)));
    },

    async get(req, res) {
      res.json(await usersService.get(idOf(req)));
    },

    async create(req, res) {
      const result = await usersService.create(context(req), createUserBody.parse(req.body));
      res.status(201).json(result);
    },

    async update(req, res) {
      const id = idOf(req);
      res.json(await usersService.update(context(req), id, updateUserBody.parse(req.body)));
    },

    disable: versioned('disable'),
    enable: versioned('enable'),
    resetPassword: versioned('resetPassword'),
    resetTwoFactor: versioned('resetTwoFactor'),
    unlock: versioned('unlock'),

    async endSessions(req, res) {
      res.json(await usersService.endSessions(context(req), idOf(req)));
    },
  };
}
