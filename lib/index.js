/*
 * Copyright 2015, Yahoo Inc.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

'use strict';

var _slicedToArray = require('babel-runtime/helpers/sliced-to-array')['default'];

var _toConsumableArray = require('babel-runtime/helpers/to-consumable-array')['default'];

var _Set = require('babel-runtime/core-js/set')['default'];

var _Map = require('babel-runtime/core-js/map')['default'];

var _interopRequireWildcard = require('babel-runtime/helpers/interop-require-wildcard')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _path = require('path');

var p = _interopRequireWildcard(_path);

var _fs = require('fs');

var _mkdirp = require('mkdirp');

var _printIcuMessage = require('./print-icu-message');

var _printIcuMessage2 = _interopRequireDefault(_printIcuMessage);

var COMPONENT_NAMES = ['FormattedMessage', 'FormattedHTMLMessage', 'FormattedPlural','FormattedMessageRender'];

var FUNCTION_NAMES = ['defineMessages'];

var sourceList = ['react-intl'];

var IMPORTED_NAMES = new _Set([].concat(COMPONENT_NAMES, FUNCTION_NAMES));
var DESCRIPTOR_PROPS = new _Set(['id', 'description', 'defaultMessage']);

exports['default'] = function (_ref) {
    var Plugin = _ref.Plugin;
    var t = _ref.types;

    function getReactIntlOptions(options) {
        return options.extra['react-intl'] || {};
    }

    function getModuleSourceName(options) {
        return getReactIntlOptions(options).moduleSourceName || 'react-intl';
    }

    function getMessageDescriptorKey(path) {
        if (path.isIdentifier() || path.isJSXIdentifier()) {
            return path.node.name;
        }

        var evaluated = path.evaluate();
        if (evaluated.confident) {
            return evaluated.value;
        }
    }


    function getMessageDescriptorValue(path) {
        if (path.isJSXExpressionContainer()) {
            path = path.get('expression');
        }

        var evaluated = path.evaluate();
        if (evaluated.confident) {
            return evaluated.value;
        }

        if (path.isTemplateLiteral() && path.get('expressions').length === 0) {
            var str = path.get('quasis').map(function (quasi) {
                return quasi.node.value.cooked;
            }).reduce(function (str, value) {
                return str + value;
            });

            return str;
        } 
     
     throw path.errorWithNode('[React Intl] Messages must be statically evaluate-able for extraction.');
    }

    function createMessageDescriptor(propPaths) {
        var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
        var _options$isJSXSource = options.isJSXSource;
        var isJSXSource = _options$isJSXSource === undefined ? false : _options$isJSXSource;

        return propPaths.reduce(function (hash, _ref2) {
            var _ref22 = _slicedToArray(_ref2, 2);

            var keyPath = _ref22[0];
            var valuePath = _ref22[1];

            var key = getMessageDescriptorKey(keyPath);
            if (DESCRIPTOR_PROPS.has(key)) {
                var value = getMessageDescriptorValue(valuePath).trim();

                if (key === 'defaultMessage') {
                    try {
                        hash[key] = (0, _printIcuMessage2['default'])(value);
                    } catch (e) {
                        if (isJSXSource && valuePath.isLiteral() && value.indexOf('\\\\') >= 0) {

                            throw valuePath.errorWithNode('[React Intl] Message failed to parse. ' + 'It looks like `\\`s were used for escaping, ' + 'this won\'t work with JSX string literals. ' + 'Wrap with `{}`. ' + 'See: http://facebook.github.io/react/docs/jsx-gotchas.html');
                        }

                        throw valuePath.errorWithNode('[React Intl] Message failed to parse: ' + e + ' ' + 'See: http://formatjs.io/guides/message-syntax/');
                    }
                } else {
                    hash[key] = value;
                }
            }

            return hash;
        }, {});
    }

    function createPropNode(key, value) {
        return t.property('init', t.literal(key), t.literal(value));
    }

    function storeMessage(_ref3, node, file) {
        var id = _ref3.id;
        var description = _ref3.description;
        var defaultMessage = _ref3.defaultMessage;

        var _getReactIntlOptions = getReactIntlOptions(file.opts);

        var enforceDescriptions = _getReactIntlOptions.enforceDescriptions;

        var _file$get = file.get('react-intl');

        var messages = _file$get.messages;

        if (!id) {
            throw file.errorWithNode(node, '[React Intl] Message is missing an `id`.');
        }

        if (messages.has(id)) {
            var existing = messages.get(id);

            if (description !== existing.description || defaultMessage !== existing.defaultMessage) {

                throw file.errorWithNode(node, '[React Intl] Duplicate message id: "' + id + '", ' + 'but the `description` and/or `defaultMessage` are different.');
            }
        }

        if (!defaultMessage) {
            var loc = node.loc;

            file.log.warn('[React Intl] Line ' + loc.start.line + ': ' + 'Message is missing a `defaultMessage` and will not be extracted.');

            return;
        }

        if (enforceDescriptions && !description) {
            throw file.errorWithNode(node, '[React Intl] Message must have a `description`.');
        }

        messages.set(id, { id: id, description: description, defaultMessage: defaultMessage });
    }

    function referencesImport(path, sourceList,  importedNames) {
       if (!(path.isIdentifier() || path.isJSXIdentifier())) {
            return false;
        }

        return importedNames.some(function (name) {
            return sourceList.reduce(function(previous, next) {
               return path.referencesImport(previous, name) || path.referencesImport(next, name);
            });
        });
    }

    return new Plugin('react-intl', {
        visitor: {
            Program: {
                enter: function enter(node, parent, scope, file) {
                    var moduleSourceName = getModuleSourceName(file.opts);
                    var imports = file.metadata.modules.imports;
                    var mightHaveReactIntlMessages = imports.some(function (mod) {
                        if ((mod.source.indexOf("FormattedMessageRender") > -1) && (sourceList.indexOf(mod.source) === -1)) {
                           sourceList.push(mod.source);
                         }
                        if ((mod.source === moduleSourceName) || (mod.source.toString().indexOf("FormattedMessageRender") > -1)) {
                            return mod.imported.some(function (name) {
                                return IMPORTED_NAMES.has(name);
                            });
                        }
                    });

                    if (mightHaveReactIntlMessages) {
                        file.set('react-intl', {
                            messages: new _Map()
                        });
                    } else {
                        this.skip();
                    }
                },

                exit: function exit(node, parent, scope, file) {
                    var _file$get2 = file.get('react-intl');

                    var messages = _file$get2.messages;

                    var _getReactIntlOptions2 = getReactIntlOptions(file.opts);

                    var messagesDir = _getReactIntlOptions2.messagesDir;
                    var _file$opts = file.opts;
                    var basename = _file$opts.basename;
                    var filename = _file$opts.filename;

                    var descriptors = [].concat(_toConsumableArray(messages.values()));
                    file.metadata['react-intl'] = { messages: descriptors };

                    if (messagesDir) {
                        var messagesFilename = p.join(messagesDir, p.dirname(p.relative(process.cwd(), filename)), basename + '.json');

                        var messagesFile = JSON.stringify(descriptors, null, 2);

                        (0, _mkdirp.sync)(p.dirname(messagesFilename));
                        (0, _fs.writeFileSync)(messagesFilename, messagesFile);
                    }
                }
            },

            JSXOpeningElement: function JSXOpeningElement(node, parent, scope, file) {
                var moduleSourceName = getModuleSourceName(file.opts);
                var name = this.get('name');

                if (name.referencesImport(moduleSourceName, 'FormattedPlural')) {
                    var loc = node.loc;

                    file.log.warn('[React Intl] Line ' + loc.start.line + ': ' + 'Default messages are not extracted from ' + '<FormattedPlural>, use <FormattedMessage> instead.');

                    return;
                }
               var renderAttributes; 
               if (referencesImport(name, sourceList , COMPONENT_NAMES)) {
                    var attributes = this.get('attributes').filter(function (attr) {
                        return attr.isJSXAttribute();
                    });

                    var descriptor = createMessageDescriptor(attributes.map(function (attr) {
                        return [attr.get('name'), attr.get('value')];
                    }), { isJSXSource: true });

                    // In order for a default message to be extracted when
                    // declaring a JSX element, it must be done with standard
                    // `key=value` attributes. But it's completely valid to
                    // write `<FormattedMessage {...descriptor} />`, because it
                    // will be skipped here and extracted elsewhere. When
                    // _either_ an `id` or `defaultMessage` prop exists, the
                    // descriptor will be checked; this way mixing an object
                    // spread with props will fail.
                    if (descriptor.id || descriptor.defaultMessage) {
                        storeMessage(descriptor, node, file);

                        attributes.filter(function (attr) {
                            var keyPath = attr.get('name');
                            var key = getMessageDescriptorKey(keyPath);
                            return key === 'description';
                        }).forEach(function (attr) {
                            return attr.dangerouslyRemove();
                        });
                    }
                }
            },

            CallExpression: function CallExpression(node, parent, scope, file) {
                var moduleSourceName = getModuleSourceName(file.opts);

                function processMessageObject(messageObj) {
                    if (!(messageObj && messageObj.isObjectExpression())) {
                        throw file.errorWithNode(node, '[React Intl] `' + callee.node.name + '()` must be ' + 'called with message descriptors defined as ' + 'object expressions.');
                    }

                    var properties = messageObj.get('properties');

                    var descriptor = createMessageDescriptor(properties.map(function (prop) {
                        return [prop.get('key'), prop.get('value')];
                    }));

                    storeMessage(descriptor, node, file);

                    messageObj.replaceWith(t.objectExpression([createPropNode('id', descriptor.id), createPropNode('defaultMessage', descriptor.defaultMessage)]));
                }

                var callee = this.get('callee');
                var myComponentSourceName = './FormattedMessageRender';
                if (referencesImport(callee, sourceList, FUNCTION_NAMES)) {
                    var messagesObj = this.get('arguments')[0];

                    messagesObj.get('properties').map(function (prop) {
                        return prop.get('value');
                    }).forEach(processMessageObject);
                }
            }
        }
    });
};

module.exports = exports['default'];