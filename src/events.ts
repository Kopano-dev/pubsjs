/*
 * Copyright 2018 Kopano
 *
 * Use of this source code is governed by a MIT license
 * that can be found in the LICENSE.txt file.
 *
 */

'use strict';

import {
	IStreamInfo,
} from './models';

export class PubsBaseEvent {
	public static eventName = 'PubsBaseEvent';
	public static getName(): string {
		return this.eventName;
	}

	public target: any;

	constructor(target: any) {
		this.target = target;
	}
}

export class PubsStateChangedEvent extends PubsBaseEvent {
	public static eventName = 'PubsStateChangedEvent';

	public connecting: boolean;
	public connected: boolean;
	public reconnecting: boolean;

	constructor(target: any) {
		super(target);

		this.connecting = target.connecting;
		this.connected = target.connected;
		this.reconnecting = target.reconnecting;
	}
}

export class PubsStreamEvent extends PubsBaseEvent {
	public static eventName = 'PubsStreamEvent';

	public data: any;
	public info?: IStreamInfo;

	constructor(target: any, data: any, info?: IStreamInfo) {
		super(target);

		this.data = data;
		this.info = info;
	}
}

export class PubsErrorEvent extends PubsBaseEvent {
	public static eventName = 'PubsErrorEvent';

	public code: string;
	public msg: string;

	constructor(target: any, details: any) {
		super(target);

		this.code = details.code;
		this.msg = details.msg;
	}
}
