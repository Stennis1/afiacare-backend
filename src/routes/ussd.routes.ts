import express, { Router } from 'express';
import * as ussdController from '../controllers/ussd.controller';

export const ussdRouter = Router();

// Africa's Talking POSTs application/x-www-form-urlencoded — NOT JSON — to
// the USSD callback. Mount the urlencoded parser only on this router so the
// rest of the API stays JSON-only. `extended: false` is the AT-recommended
// setting (simple key=value pairs, no nested objects).
ussdRouter.use(express.urlencoded({ extended: false }));

// Note: NO asyncHandler here. The controller catches all internal errors and
// returns plain-text END strings — Express's default JSON error middleware
// would corrupt AT's expected response format.
ussdRouter.post('/', ussdController.handle);

// Optional end-of-session status callback per §6. AT POSTs date / sessionId /
// status / cost / duration / input here. We log and return 200 — no business
// logic for now, but the endpoint must exist if AT is configured to call it.
ussdRouter.post('/status', (req, res) => {
  console.log('[ussd][status callback]', req.body);
  res.sendStatus(200);
});
