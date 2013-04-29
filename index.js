/*!
 *
 * Copyright (c) 2013 Sebastian Golasch
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

'use strict';

// ext. libs
var webdriver = require('webdriverjs');
var $superagent = require('superagent');
var Q = require('q');
var spawn = require('child_process').spawn;

// internal globals
var client = null;
var selenium = null;
var lastCalledUrl = null;

/**
 * @module
 */

module.exports.isMultiBrowser = function () {
    return true;
};

module.exports.verifyBrowser = function (browser) {
    return true;
};

module.exports.create = function (opts) {
    return new Selenium(opts);
};

/**
 * @constructor
 */

function Selenium (opts) {
    var stream = '';
    var isInitialized = false;
    this.events = opts.events;

    this.spawned = spawn('java', ['-jar', __dirname + '/selenium-server-standalone-2.28.0.jar', '-Dwebdriver.chrome.driver=/Users/sgolasch/Downloads/chromedriver'], {cwd: '/'});

    this.spawned.stdout.on('data', function (data) {
        var dataStr = new String(data);
        stream += dataStr;
        if (!isInitialized && stream.search('org.openqa.jetty.jetty.servlet.ServletHandler') !== -1) {
            isInitialized = true;

            switch (opts.browser) {
                case 'chrome':
                    client = webdriver.remote({logLevel: 'silent', desiredCapabilities: {browserName: 'chrome', seleniumProtocol: 'WebDriver'}});
                    break;
                case 'opera':
                    client = webdriver.remote({logLevel: 'silent', desiredCapabilities: {browserName: 'opera', 'opera.binary': "/Users/sgolasch/Apps/Opera Next.app/Contents/MacOS/Opera", seleniumProtocol: 'WebDriver'}});
                    break;
                case 'safari':
                    client = webdriver.remote({logLevel: 'silent', desiredCapabilities: {browserName: 'safari', seleniumProtocol: 'WebDriver'}});
                    break;
                default:
                    client = webdriver.remote({logLevel: 'silent'});
                    break;
            }

            opts.events.emit('driver:ready:selenium:' + opts.browser);
        }
    });

    // kill the selenium server when all tests & testsuites are run
    this.events.on('tests:complete:selenium:' + opts.browser, function () {
        this.spawned.kill('SIGHUP');
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.start = function () {
    var deferred = Q.defer();
    client.init();
    deferred.resolve();
    return deferred.promise;
};

/**
 *
 */

Selenium.prototype.run = function () {};

/**
 *
 */

Selenium.prototype.end = function () {
    client.end(function () {
        this.events.emit('driver:message', {key: 'run.complete', value: null});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.open = function (url) {
    lastCalledUrl = url;
    client.url(url, function () {
        this.events.emit('driver:message', {key: 'open', value: null});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.title = function (expected, hash) {
    client.getTitle(function (result) {
        this.events.emit('driver:message', {key: "title", hash: hash, value: result, expected: expected});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.url = function (expected, hash) {
    client.url(function (url) {
        this.events.emit('driver:message', {key: "url", expected: expected, hash: hash, value: url.value});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.httpStatus = function (expected, hash) {
    client.url(function (url) {
        $superagent
        .get(lastCalledUrl)
        .end(function(res){
            this.events.emit('driver:message', {key: 'httpStatus', hash: hash, expected: expected, value: res.status});
        }.bind(this));
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.exists = function (selector, hash) {
    client.element('css selector', selector, function(result) {
        this.events.emit('driver:message', {key: 'exists', hash: hash, selector: selector, value: (result.value === -1 ? 'false' : 'true')});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.visible = function (selector, hash) {
    client.element('css selector', selector, function(result) {
        if (result.value === -1) {
            this.events.emit('driver:message', {key: 'visible', hash: hash, selector: selector, value: (result.value === -1 ? 'false' : 'true')});
            return;
        }

        client.elementIdDisplayed(result.value.ELEMENT, function(result) {
            this.events.emit('driver:message', {key: 'visible', hash: hash, selector: selector, value: (result.value === true ? 'true' : 'false')});
        }.bind(this));
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.text = function (selector, expected, hash) {
    client.element('css selector', selector, function(result) {
        if (result.value === -1) {
            this.events.emit('driver:message', {key: 'text', hash: hash, expected: expected, selector: selector, value: (result.value === -1 ? 'false' : 'true')});
            return;
        }

        client.getText(selector, function(result) {
            this.events.emit('driver:message', {key: 'text', hash: hash, expected: expected, selector: selector, value: result.value});
        }.bind(this));
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.attribute = function (selector, attribute, expected, hash) {
    client.element('css selector', selector, function(result) {
        if (result.value === -1) {
            this.events.emit('driver:message', {key: 'attribute', hash: hash, selector: selector, expected: expected, value: (result.value === -1 ? 'false' : 'true')});
            return;
        }

        if (attribute === 'href' && expected[0] === '#') {
            client.url(function (url) {
                client.getAttribute(selector, attribute, function (result) {
                    this.events.emit('driver:message', {key: 'attribute', selector: selector, hash: hash, expected: expected, value: result.replace(url.value, '') });
                }.bind(this));
            }.bind(this));
            return;
        }

        client.getAttribute(selector, attribute, function (result) {
            this.events.emit('driver:message', {key: 'attribute', selector: selector, expected: expected, value: result });
        }.bind(this));
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.val = function (selector, value) {
    client.setValue(selector, value, function () {
        this.events.emit('driver:message', {key: 'val', selector: selector, value: value});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.getValue = function (selector, expected, hash) {
    client.element('css selector', selector, function(result) {
        if (result.value === -1) {
            this.events.emit('driver:message', {key: 'attribute', hash: hash, selector: selector, expected: expected, value: (result.value === -1 ? 'false' : 'true')});
            return;
        }

        client.getAttribute(selector, 'value', function (result) {
            this.events.emit('driver:message', {key: 'val', selector: selector, expected: expected, hash: hash, value: result});
        }.bind(this));
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.wait = function (timeout) {
    client.pause(timeout, function () {
        this.events.emit('driver:message', {key: 'wait', timeout: timeout});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.waitForElement = function (selector, timeout) {
    client.waitFor(selector, timeout, function () {
        this.events.emit('driver:message', {key: 'waitForElement', selector: selector});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.click = function (selector) {
    client.click(selector, function () {
        this.events.emit('driver:message', {key: 'click', value: selector});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.screenshot = function (path, pathname) {
    client.saveScreenshot(path + pathname, function () {
        this.events.emit('driver:message', {key: 'screenshot', value: path + pathname});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.back = function () {
    client.back(function (result) {
        this.events.emit('driver:message', {key: 'back', value: result});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.forward = function () {
    client.forward(function (result) {
        this.events.emit('driver:message', {key: 'forward', value: result});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.reload = function () {
    client.refresh(function (result) {
        this.events.emit('driver:message', {key: 'reload', value: result});
    }.bind(this));
};

/**
 *
 */

Selenium.prototype.getNumberOfElements = function (selector, expected, hash) {
    client.element('css selector', selector, function(result) {
        if (result.value === -1) {
            this.events.emit('driver:message', {key: 'numberOfElements', hash: hash, selector: selector, expected: expected, value: (result.value === -1 ? 'false' : 'true')});
            return;
        }

        client.elements('css selector', selector, function (result) {
            this.events.emit('driver:message', {key: 'numberOfElements', selector: selector, expected: expected, hash: hash, value: result.value.length});
        }.bind(this));
    }.bind(this));
};
