/*
 * Copyright 2018 Kopano
 *
 * Use of this source code is governed by a MIT license
 * that can be found in the LICENSE.txt file.
 *
 */

'use strict';

export {
	PubsBaseEvent,
	PubsStateChangedEvent,
	PubsStreamEvent,
	PubsErrorEvent,
} from './events';

export {
	IPubsOptions,
	PubsInit,
	authorizationTypeBearer,
} from './pubs';
import { Pubs } from './pubs';
export {
	Pubs,
};

export {
	IStreamEnvelope,
	IStreamWebsocketConnectResponse,
	IStreamReplyTimeoutRecord,
	IStreamInfo,
	IPubsDataError,
	IErrorWithCodeAndMessage,
	IResponse,
	PubsDataError,
} from './models';

export const version = Pubs.version;

export default Pubs;
