import express from 'express';
import xmlbuilder from 'xmlbuilder';
import { getServerByTitleId, getServerByGameServerId } from '@/database';
import { generateToken, getValueFromHeaders, getValueFromQueryString } from '@/util';
import { NEXAccount } from '@/models/nex-account';
import { TokenOptions } from '@/types/common/token-options';
import { HydratedPNIDDocument } from '@/types/mongoose/pnid';
import { HydratedServerDocument } from '@/types/mongoose/server';
import { HydratedNEXAccountDocument } from '@/types/mongoose/nex-account';

const router: express.Router = express.Router();

/**
 * [GET]
 * Replacement for: https://account.nintendo.net/v1/api/provider/service_token/@me
 * Description: Gets a service token
 */
router.get('/service_token/@me', async (request: express.Request, response: express.Response) => {
	const pnid: HydratedPNIDDocument | null = request.pnid;

	if (!pnid) {
		response.status(400);

		return response.end(xmlbuilder.create({
			errors: {
				error: {
					cause: 'access_token',
					code: '0002',
					message: 'Invalid access token'
				}
			}
		}).end());
	}

	const titleID: string | undefined = getValueFromHeaders(request.headers, 'x-nintendo-title-id');

	if (!titleID) {
		// TODO - Research this error more
		return response.send(xmlbuilder.create({
			errors: {
				error: {
					code: '1021',
					message: 'The requested game server was not found'
				}
			}
		}).end());
	}

	const serverAccessLevel: string = pnid.server_access_level;
	const server: HydratedServerDocument | null = await getServerByTitleId(titleID, serverAccessLevel);

	if (!server || !server.aes_key) {
		return response.send(xmlbuilder.create({
			errors: {
				error: {
					code: '1021',
					message: 'The requested game server was not found'
				}
			}
		}).end());
	}

	const tokenOptions: TokenOptions = {
		system_type: server.device,
		token_type: 0x4, // * Service token
		pid: pnid.pid,
		access_level: pnid.access_level,
		title_id: BigInt(parseInt(titleID, 16)),
		expire_time: BigInt(Date.now() + (3600 * 1000))
	};

	const serviceTokenBuffer: Buffer | null = await generateToken(server.aes_key, tokenOptions);
	let serviceToken: string = serviceTokenBuffer ? serviceTokenBuffer.toString('base64') : '';

	if (request.isCemu) {
		serviceToken = Buffer.from(serviceToken, 'base64').toString('hex');
	}

	response.send(xmlbuilder.create({
		service_token: {
			token: serviceToken
		}
	}).end());
});

/**
 * [GET]
 * Replacement for: https://account.nintendo.net/v1/api/provider/nex_token/@me
 * Description: Gets a NEX server address and token
 */
router.get('/nex_token/@me', async (request: express.Request, response: express.Response) => {
	const pnid: HydratedPNIDDocument | null = request.pnid;

	if (!pnid) {
		response.status(400);

		return response.end(xmlbuilder.create({
			errors: {
				error: {
					cause: 'access_token',
					code: '0002',
					message: 'Invalid access token'
				}
			}
		}).end());
	}

	const nexAccount: HydratedNEXAccountDocument | null = await NEXAccount.findOne({
		owning_pid: pnid.pid
	});

	if (!nexAccount) {
		return response.status(404).send(xmlbuilder.create({
			errors: {
				error: {
					cause: '',
					code: '0008',
					message: 'Not Found'
				}
			}
		}).end());
	}

	const gameServerID: string | undefined = getValueFromQueryString(request.query, 'game_server_id');

	if (!gameServerID) {
		return response.send(xmlbuilder.create({
			errors: {
				error: {
					code: '0118',
					message: 'Unique ID and Game Server ID are not linked'
				}
			}
		}).end());
	}

	const serverAccessLevel: string = pnid.server_access_level;
	const server: HydratedServerDocument | null = await getServerByGameServerId(gameServerID, serverAccessLevel);

	if (!server || !server.aes_key) {
		return response.send(xmlbuilder.create({
			errors: {
				error: {
					code: '1021',
					message: 'The requested game server was not found'
				}
			}
		}).end());
	}

	const titleID: string | undefined = getValueFromHeaders(request.headers, 'x-nintendo-title-id');

	if (!titleID) {
		// TODO - Research this error more
		return response.send(xmlbuilder.create({
			errors: {
				error: {
					code: '1021',
					message: 'The requested game server was not found'
				}
			}
		}).end());
	}

	const tokenOptions: TokenOptions = {
		system_type: server.device,
		token_type: 0x3, // nex token,
		pid: pnid.pid,
		access_level: pnid.access_level,
		title_id: BigInt(parseInt(titleID, 16)),
		expire_time: BigInt(Date.now() + (3600 * 1000))
	};

	const nexTokenBuffer: Buffer | null = await generateToken(server.aes_key, tokenOptions);
	let nexToken: string = nexTokenBuffer ? nexTokenBuffer.toString('base64') : '';

	if (request.isCemu) {
		nexToken = Buffer.from(nexToken || '', 'base64').toString('hex');
	}

	response.send(xmlbuilder.create({
		nex_token: {
			host: server.ip,
			nex_password: nexAccount.password,
			pid: nexAccount.pid,
			port: server.port,
			token: nexToken
		}
	}).end());
});

export default router;