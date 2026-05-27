import express, { Router } from 'express';
import * as voiceController from '../controllers/voice.controller';

export const voiceRouter = Router();

// AT Voice POSTs application/x-www-form-urlencoded — like USSD, not JSON.
// Mount the parser only on this router so the JSON API stays untouched.
voiceRouter.use(express.urlencoded({ extended: false }));

// No asyncHandler wrapper: the controller handles its own errors and
// returns XML on every branch. The default JSON error middleware would
// corrupt AT's expected response format.
voiceRouter.post('/', voiceController.handle);

// Optional end-of-call status callback (mirrors USSD's). AT POSTs call
// metadata (duration, hangup cause, recording URLs, etc) here when the
// leg ends. We log and 200 — no business logic yet, but the endpoint
// must exist if AT is configured to call it.
voiceRouter.post('/status', (req, res) => {
  console.log('[voice][status callback]', req.body);
  res.sendStatus(200);
});
