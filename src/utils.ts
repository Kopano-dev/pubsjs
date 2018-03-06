/*
 * Copyright 2018 Kopano
 *
 * Use of this source code is governed by a MIT license
 * that can be found in the LICENSE.txt file.
 *
 */

'use strict';

/**
 * @private
 */
export function makeAbsoluteURL(url: string): string {
	const a = document.createElement('a');
	a.href = url;
	return a. href;
}
