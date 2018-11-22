/*!
 * Copyright 2018 Kopano
 *
 * Use of this source code is governed by a MIT license
 * that can be found in the LICENSE.txt file.
 *
 * @author   Kopano <https://kopano.com>
 * @license  MIT
 * @preserve
 */

'use strict';

import {
	PubsErrorEvent,
	PubsStateChangedEvent,
	PubsStreamEvent,
} from './events';
import {
	IPubsDataError,
	IStreamEnvelope,
	IStreamInfo,
	IStreamReplyTimeoutRecord,
	IStreamWebsocketConnectResponse,
	PubsDataError,
} from './models';
import {
	makeAbsoluteURL,
} from './utils';

export const authorizationTypeBearer = 'Bearer';

export interface IPubsOptions {
	authorizationValue?: string;
	authorizationType?: string;
}

interface IPubsConnectionGate {
	promise?: Promise<void>;
	reject?: () => void;
}

/**
 * The sequence counter for sent websocket message payloads. It is automatically
 * incremented whenever a payload message is sent via [[Pubs.sendWebSocketPayload]].
 * @private
 */
let websocketSequence = 0;

/**
 * PubsInit is a helper constructor to create Pubs interface with settings.
 */
export class PubsInit {
	public static options: any = {
		connectTimeout: 5000,
		heartbeatInterval: 5000,
		maxReconnectInterval: 30000,
		reconnectEnabled: true,
		reconnectFactor: 1.5,
		reconnectInterval: 1000,
		reconnectSpreader: 500,
		streamAckTimeout: 20000,
	};

	/**
	 * Initialized Pubs defaults with the provided options.
	 *
	 * @param options Additional options.
	 */
	public static init(options: any) {
		Object.assign(this.options, options);
	}
}

export class Pubs {
	public static version: string = __VERSION__;

	/**
	 * Boolean flag wether Pubs is currently trying to establish a connection.
	 */
	public connecting: boolean = false;

	/**
	 * Boolean flag wether Pubs is currently connected or not.
	 */
	public connected: boolean = false;

	/**
	 * Boolean flag wether Pubs is automatically reconnecting or not.
	 */
	public reconnecting: boolean = false;

	/**
	 * Event handler for [[PubsStateChangedEvent]]. Set to a function to get called
	 * whenever [[PubsStateChangedEvent]]s are triggered.
	 */
	public onstatechanged?: (event: PubsStateChangedEvent) => void;

	/**
	 * Event handler for [[PubsErrorEvent]]. Set to a function to get called
	 * whenever [[PubsErrorEvent]]s are triggered.
	 */
	public onerror?: (event: PubsErrorEvent ) => void;

	/**
	 * Event handler for [[PubsStreamEvent]]. Set to a function to get called
	 * whenever [[PubsStreamEvent]]s are triggered.
	 */
	public onstreamevent?: (event: PubsStreamEvent ) => void;

	private baseURI: string;
	private options: IPubsOptions;
	private socket?: WebSocket;
	private closing: boolean = false;
	private reconnector: number = 0;
	private reconnectAttempts: number = 0;
	private replyHandlers: Map<string, IStreamReplyTimeoutRecord>;
	private gate: IPubsConnectionGate;

	/**
	 * Creates a Pubs instance with the provided parameters.
	 *
	 * @param baseURI The base URI to the Pubs server API.
	 * @param options Additional options.
	 */
	constructor(baseURI: string = '', options?: IPubsOptions) {
		this.baseURI = baseURI.replace(/\/$/, '');
		this.options = options || {};
		this.replyHandlers = new Map<string, IStreamReplyTimeoutRecord>();
		this.gate = {};
	}

	/**
	 * Establish Websocket connection to Pubs server.
	 *
	 * @returns Promise which resolves when the connection was established.
	 */
	public async connect(): Promise<void> {
		console.debug('pubs: connect');

		clearTimeout(this.reconnector);
		const reconnector = (fast: boolean = false): void => {
			clearTimeout(this.reconnector);
			if (!this.reconnecting) {
				return;
			}
			let reconnectTimeout = PubsInit.options.reconnectInterval;
			if (!fast) {
				reconnectTimeout *= Math.trunc(Math.pow(PubsInit.options.reconnectFactor, this.reconnectAttempts));
				if (reconnectTimeout > PubsInit.options.maxReconnectInterval) {
					reconnectTimeout = PubsInit.options.maxReconnectInterval;
				}
				reconnectTimeout += Math.floor(Math.random() * PubsInit.options.reconnectSpreader);
			}
			this.reconnector = window.setTimeout(() => {
				this.connect();
			}, reconnectTimeout);
			this.reconnectAttempts++;
		};

		this.reconnecting = (PubsInit.options.reconnectEnabled || true);
		this.connecting = true;
		this.dispatchStateChangedEvent();

		return new Promise<void>(async (resolve, reject) => {
			const gate: IPubsConnectionGate  = this.gate = {};
			gate.promise = new Promise<void>(async (gateResolve, gateReject) => {
				gate.reject = gateReject;
				let connectResponse: IStreamWebsocketConnectResponse;
				let authorizationHeader: string = '';
				if (this.options.authorizationType && this.options.authorizationValue) {
					authorizationHeader = this.options.authorizationType + ' ' + this.options.authorizationValue;
				}
				try {
					connectResponse = await this.fetchStreamWebSocketConnect(authorizationHeader);
				} catch (err) {
					console.warn('pubs: failed to fetch websocket connection details', err);
					connectResponse = {
						error: {
							code: 'request_failed',
							msg: '' + err,
						},
						streamUrl: '',
					};
				}
				console.debug('connect result', connectResponse);
				if (!connectResponse.streamUrl) {
					this.connecting = false;
					this.dispatchStateChangedEvent();
					if (this.reconnecting) {
						if (connectResponse.error && connectResponse.error.code === 'http_error_403') {
							console.warn('pubs: giving up reconnect, as connect returned forbidden', connectResponse.error.msg);
							this.reconnecting = false;
							this.dispatchStateChangedEvent();
							this.dispatchErrorEvent(connectResponse.error);
						}
						reconnector();
					} else if (connectResponse.error) {
						reject(new PubsDataError(connectResponse.error));
					} else {
						reject(new PubsDataError({code: 'unknown_error', msg: ''}));
					}
					return;
				}

				let streamURL = connectResponse.streamUrl;
				if (!streamURL.includes('://')) {
					// Prefix with base when not absolute already.
					streamURL = this.baseURI + streamURL;
				}
				this.connectStreamWebSocket(streamURL, this.reconnecting ? reconnector : undefined).then(() => {
					this.reconnectAttempts = 0;
					console.debug('pubs: connection established', this.reconnectAttempts);
					delete gate.reject;
					resolve();
					gateResolve();
				}, (err: any) => {
					console.warn('pubs: connection failed', err, !!this.reconnecting);
					if (this.reconnecting) {
						reconnector();
					} else {
						delete gate.reject;
						reject(err);
						gateReject();
					}
				});
			});
		});
	}

	/**
	 * Subscribe to topics.
	 *
	 * @param topics The array of topics to subscribe.
	 * @returns Promise which resolves when the topics were subscribed.
	 */
	public async sub(topics: string[]): Promise<void> {
		/// {"type": "sub", "state": "123", "info": {"topics": ["lala"]}}
		return this.pubsub('sub', topics);
	}

	/**
	 * Encode and send JSON payload data via [[Pubs.socket]] connection.
	 *
	 * @param payload The payload data.
	 * @param replyTimeout Timeout in milliseconds for reply callback. If 0,
	 *        then no callback is expected and none is registered.
	 * @returns Promise which resolves when the reply was received or immediately
	 *          when no timeout was given.
	 */
	public async sendStreamWebSocketPayload(payload: IStreamEnvelope, replyTimeout: number = 0): Promise<IStreamEnvelope> {
		if (replyTimeout === 0) {
			replyTimeout = PubsInit.options.streamAckTimeout;
		}

		return new Promise<IStreamEnvelope>((resolve, reject) => {
			if (!this.connected || !this.socket || this.closing) {
				reject(new Error('no_connection'));
				return;
			}

			payload.state = String(++websocketSequence);
			try {
				this.socket.send(JSON.stringify(payload));
			} catch (err) {
				reject(err);
				return;
			}
			if (replyTimeout > 0) {
				const timeout = window.setTimeout(() => {
					reject(new Error('timeout'));
				}, replyTimeout);
				this.replyHandlers.set(payload.state, {resolve, timeout});
			} else {
				setTimeout(resolve, 0);
			}
		});
	}

	/**
	 * Unsubscribe from topics.
	 *
	 * @param topics The array of topics to subscribe.
	 * @returns Promise which resolves when the topics were subscribed.
	 */
	public async unsub(topics: string[]): Promise<void> {
		return this.pubsub('unsub', topics);
	}

	private async pubsub(type: string, topics: string[]): Promise<void> {
		const payload = {
			info: {
				topics,
			},
			state: '',
			type,
		};
		return new Promise<void>(async (resolve, reject) => {
			if (!this.gate.promise) {
				reject(new Error('no gate - connected not called?'));
				return;
			}

			this.gate.promise.then(() => {
				this.sendStreamWebSocketPayload(payload).then(() => {
					console.log('pubs: send done');
					resolve();
				});
			});
		});
	}

	/**
	 * Call Pubs connect via REST to retrieve Websocket stream endpoint details.
	 *
	 * @param user The user ID.
	 * @param authorizationHeader Authorization HTTP request header value.
	 * @returns Promise with the unmarshalled response data once received.
	 */
	private async fetchStreamWebSocketConnect(authorizationHeader?: string): Promise<IStreamWebsocketConnectResponse> {
		const url = this.baseURI + '/api/pubs/v1/stream/connect';
		const headers = new Headers();
		if (authorizationHeader) {
			headers.set('Authorization', authorizationHeader);
		}

		return fetch(url, {
			headers,
			method: 'POST',
			mode: 'cors',
		}).then(response => {
			if (!response.ok) {
				return {
					error: {
						code: 'http_error_' + response.status,
						msg: response.statusText,
					},
				};
			}

			return response.json();
		});
	}

	/**
	 * Create a new Pubs stream Websocket connection using the provided uri. If
	 * the accociated Pubs instance already has a connection, the old connection
	 * will be closed before the new connection is established.
	 *
	 * @param uri URI or URL to use. The value will be made absolute if not
	 *        already absolute. The scheme will be transformed to `ws:` or `wss:`
	 *        if `http:` or `https:`.
	 */
	private async connectStreamWebSocket(uri: string, reconnector?: (fast?: boolean) => void): Promise<WebSocket> {
		console.debug('pubs: connect stream websocket', uri);

		return new Promise<WebSocket>((resolve, reject) => {
			if (this.socket) {
				console.warn('pubs: closing existing socket connection');
				const oldSocket = this.socket;
				this.socket = undefined;
				this.connected = false;
				this.closeStreamWebsocket(oldSocket);
			}

			const url = makeAbsoluteURL(uri).replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
			console.debug('pubs: connecting stream socket URL', url);
			const socket = new WebSocket(url + '?v=1');

			let isTimeout = false;
			const timeout = setTimeout(() => {
				isTimeout = true;
				if (socket === this.socket) {
					this.socket = undefined;
					this.connected = false;
					this.connecting = false;
					this.dispatchStateChangedEvent();
				}
				setTimeout(() => {
					this.closeStreamWebsocket(socket);
				}, 0);
				reject(new Error('connect_timeout'));
			}, PubsInit.options.connectTimeout);

			socket.onopen = (event: Event) => {
				clearTimeout(timeout);
				if (isTimeout) {
					return;
				}
				if (event.target !== this.socket) {
					this.closeStreamWebsocket(event.target as WebSocket);
					return;
				}
				console.debug('pubs: stream socket connected', event);
				this.connected = true;
				this.connecting = false;
				this.dispatchStateChangedEvent();
				this.socket.onmessage = this.handleStreamWebSocketMessage.bind(this);
				resolve(event.target as WebSocket);
			};
			socket.onclose = (event: CloseEvent) => {
				clearTimeout(timeout);
				if (isTimeout) {
					return;
				}
				if (event.target !== this.socket) {
					if (!this.socket && !this.connecting && reconnector) {
						console.debug('pubs: socket closed, retry immediate reconnect now', event);
						// Directly try to reconnect. This makes reconnects fast
						// in the case where the connection was lost on the client
						// and has come back.
						reconnector(true);
					}
					return;
				}
				console.debug('pubs: socket closed', event);
				this.socket = undefined;
				this.closing = false;
				this.connected = false;
				this.connecting = false;
				this.dispatchStateChangedEvent();
				if (reconnector) {
					reconnector();
				}
			};
			socket.onerror = (event: Event) => {
				clearTimeout(timeout);
				if (isTimeout) {
					return;
				}
				setTimeout(() => {
					reject(event);
				}, 0);
				if (event.target !== this.socket) {
					return;
				}
				console.debug('pubs: socket error', event);
				this.socket = undefined;
				this.connected = false;
				this.connecting = false;
				this.dispatchErrorEvent({
					code: 'websocket_error',
					msg: '' + event,
				});
				this.dispatchStateChangedEvent();
			};

			this.closing = false;
			this.socket = socket;
		});
	}

	/**
	 * Closes the provided websocket connection.
	 *
	 * @param socket Websocket to close.
	 */
	private closeStreamWebsocket(socket: WebSocket): void {
		if (socket === this.socket) {
			this.closing = true;
		}
		socket.close();
	}

	/**
	 * Process incoming Pubs stream Websocket payload data.
	 *
	 * @param event Websocket event holding payload data.
	 */
	private handleStreamWebSocketMessage(event: MessageEvent): void {
		if (event.target !== this.socket) {
			(event.target as WebSocket).close();
			return;
		}

		const message: IStreamEnvelope = JSON.parse(event.data);

		switch (message.type) {
			case 'hello':
				console.debug('pubs: server hello', message);
				break;
			case 'goodbye':
				console.debug('pubs: server goodbye, close connection', message);
				this.reconnectAttempts = 1; // NOTE(longsleep): avoid instant reconnect.
				this.closeStreamWebsocket(this.socket);
				this.connected = false;
				break;
			case 'ack':
				// console.debug('pubs: server ack', message);
				const replyTimeout = this.replyHandlers.get(message.state);
				if (replyTimeout) {
					this.replyHandlers.delete(message.state);
					clearTimeout(replyTimeout.timeout);
					replyTimeout.resolve(message);
				} else {
					console.log('received ack without handler', message);
				}
				break;
			case 'event':
				// console.debug('pubs: server event', message.data, message.info);
				this.dispatchStreamEvent(message.data, message.info);
				break;
			default:
				console.debug('pubs: unknown type', message.type, message);
				break;
		}
	}

	/**
	 * Generic event dispatcher. Dispatches callback functions based on event
	 * types. Throws error for unknown event types. If a known event type has no
	 * event handler registered, dispatchEvent does nothing.
	 *
	 * @param event Event to be dispatched.
	 */
	private dispatchEvent(event: any): void {
		switch (event.constructor.getName()) {
			case PubsStateChangedEvent.getName():
				if (this.onstatechanged) {
					this.onstatechanged(event);
				}
				break;
			case PubsStreamEvent.getName():
				if (this.onstreamevent) {
					this.onstreamevent(event);
				}
				break;
			case PubsErrorEvent.getName():
				if (this.onerror) {
					this.onerror(event);
				}
				break;
			default:
				throw new Error('unknown event: ' + event.constructor.getName());
		}
	}

	/**
	 * Dispatch a new [[PubsStateChangedEvent]] implicitly created from the
	 * associated Pubs current state.
	 */
	private dispatchStateChangedEvent(): void {
		this.dispatchEvent(new PubsStateChangedEvent(this));
	}

	/**
	 * Dispatch a new [[PubsStreamEvent]] with the provided error details.
	 *
	 * @param data Data of the event to be dispatched.
	 * @param info Info of the data.
	 */
	private dispatchStreamEvent(data: any, info?: IStreamInfo): void {
		this.dispatchEvent(new PubsStreamEvent(this, data, info));
	}

	/**
	 * Dispatch a new [[PubsErrorEvent]] with the provided error details.
	 *
	 * @param err Error to be dispatched.
	 */
	private dispatchErrorEvent(err: IPubsDataError): void {
		this.dispatchEvent(new PubsErrorEvent(this, err));
	}

}
