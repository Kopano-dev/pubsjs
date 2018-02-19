/*
 * Copyright 2018 Kopano
 *
 * Use of this source code is governed by a MIT license
 * that can be found in the LICENSE.txt file.
 *
 */

'use strict';

export interface IStreamEnvelope {
	type: string;
	state: string;
	info?: IStreamInfo;
	data?: any;
}

export interface IStreamWebsocketConnectResponse extends IResponse {
	streamUrl: string;
}

export interface IStreamReplyTimeoutRecord {
	resolve: (message: IStreamEnvelope) => void;
	timeout: number;
}

export interface IStreamInfo {
	ref?: string;
	topics?: string[];
}

export interface IPubsDataError {
	code: string;
	msg?: string;
}

export interface IErrorWithCodeAndMessage {
	code: string;
	msg?: string;
}

export interface IResponse {
	error?: IErrorWithCodeAndMessage;
}

export class PubsDataError implements IPubsDataError {
	public code: string;
	public msg: string = '';

	constructor(data: IPubsDataError) {
		this.code = data.code;
		if (data.msg) {
			this.msg = data.msg;
		}
	}
}
