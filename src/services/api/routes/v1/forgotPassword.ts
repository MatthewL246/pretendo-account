import express from 'express';
import validator from 'validator';
import { getPNIDByEmailAddress, getPNIDByUsername } from '@/database';
import { sendForgotPasswordEmail } from '@/util';
import { HydratedPNIDDocument } from '@/types/mongoose/pnid';

const router = express.Router();

router.post('/', async (request: express.Request, response: express.Response): Promise<void> => {
	const input = request.body?.input;

	if (!input || input.trim() === '') {
		response.status(400).json({
			app: 'api',
			status: 400,
			error: 'Invalid or missing input'
		});

		return;
	}

	let pnid: HydratedPNIDDocument | null;

	if (validator.isEmail(input)) {
		pnid = await getPNIDByEmailAddress(input);
	} else {
		pnid = await getPNIDByUsername(input);
	}

	if (pnid) {
		await sendForgotPasswordEmail(pnid);
	}

	response.json({
		app: 'api',
		status: 200
	});
});

export default router;