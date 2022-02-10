require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
module.exports.nodeNameInCorrectCase = function nodeNameInCorrectCase(node) {
  const shadowRootType = node.shadowRoot && node.shadowRoot.mode;
  if (shadowRootType)
    return '#shadow-root (' + shadowRootType + ')';

  // If there is no local name, it's case sensitive
  if (!node.localName)
    return node.nodeName;

  // If the names are different lengths, there is a prefix and it's case sensitive
  if (node.localName.length !== node.nodeName.length)
    return node.nodeName;

  // Return the localname, which will be case insensitive if its an html node
  return node.localName;
}

module.exports.shadowRootType = function(node) {
  const ancestorShadowRoot = node.ancestorShadowRoot();
  return ancestorShadowRoot ? ancestorShadowRoot.mode : null;
}

module.exports.NodeType = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9
}
module.exports.ShadowRootTypes = {
  UserAgent: 'user-agent',
  Open: 'open',
  Closed: 'closed'
};

},{}],"chrome-dompath":[function(require,module,exports){
// This file taken from the ChromeDevTools repository and modified by rannn505 to make it work on JSDOM.
// https://github.com/ChromeDevTools/devtools-frontend/blob/6b5621bb7709854a4697b3aa794822c5898f4d09/front_end/elements/DOMPath.js

// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

require('css.escape');
const { ShadowRootTypes, nodeNameInCorrectCase, NodeType } = require('./DOMNode');

let Elements = {};
Elements.DOMPath = {};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean=} justSelector
 * @return {string}
 */
Elements.DOMPath.fullQualifiedSelector = function(node, justSelector) {
  try {
    if (node.nodeType !== NodeType.ELEMENT_NODE)
      return node.localName || node.nodeName.toLowerCase();
    return Elements.DOMPath.cssPath(node, justSelector);
  } catch (e) {
    return null;
  }
};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean=} optimized
 * @return {string}
 */
Elements.DOMPath.cssPath = function(node, optimized) {
  if (node.nodeType !== NodeType.ELEMENT_NODE)
    return '';

  const steps = [];
  let contextNode = node;
  while (contextNode) {
    const step = Elements.DOMPath._cssPathStep(contextNode, !!optimized, contextNode === node);
    if (!step)
      break;  // Error - bail out early.
    steps.push(step);
    if (step.optimized)
      break;
    contextNode = contextNode.parentNode;
  }

  steps.reverse();
  return steps.join(' > ');
};

/**
 * @param {!SDK.DOMNode} node
 * @return {boolean}
 */
Elements.DOMPath.canGetJSPath = function(node) {
  let wp = node;
  while (wp) {
    if (wp.shadowRoot && wp.shadowRoot.mode !== ShadowRootTypes.Open)
      return false;
    wp = wp.shadowRoot && wp.shadowRoot.host;
  }
  return true;
};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean=} optimized
 * @return {string}
 */
Elements.DOMPath.jsPath = function(node, optimized) {
  if (node.nodeType !== NodeType.ELEMENT_NODE)
    return '';

  const path = [];
  let wp = node;
  while (wp) {
    path.push(Elements.DOMPath.cssPath(wp, optimized));
    wp = wp.shadowRoot && wp.shadowRoot.host;
  }
  path.reverse();
  let result = '';
  for (let i = 0; i < path.length; ++i) {
    const string = JSON.stringify(path[i]);
    if (i)
      result += `.shadowRoot.querySelector(${string})`;
    else
      result += `document.querySelector(${string})`;
  }
  return result;
};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean} optimized
 * @param {boolean} isTargetNode
 * @return {?Elements.DOMPath.Step}
 */
Elements.DOMPath._cssPathStep = function(node, optimized, isTargetNode) {
  if (node.nodeType !== NodeType.ELEMENT_NODE)
    return null;

  const id = node.getAttribute('id');
  if (optimized) {
    if (id)
      return new Elements.DOMPath.Step(idSelector(id), true);
    const nodeNameLower = node.nodeName.toLowerCase();
    if (nodeNameLower === 'body' || nodeNameLower === 'head' || nodeNameLower === 'html')
      return new Elements.DOMPath.Step(nodeNameInCorrectCase(node), true);
  }
  const nodeName = nodeNameInCorrectCase(node);

  if (id)
    return new Elements.DOMPath.Step(nodeName + idSelector(id), true);
  const parent = node.parentNode;
  if (!parent || parent.nodeType === NodeType.DOCUMENT_NODE)
    return new Elements.DOMPath.Step(nodeName, true);

  /**
   * @param {!SDK.DOMNode} node
   * @return {!Array.<string>}
   */
  function prefixedElementClassNames(node) {
    const classAttribute = node.getAttribute('class');
    if (!classAttribute)
      return [];

    return classAttribute.split(/\s+/g).filter(Boolean).map(function(name) {
      // The prefix is required to store "__proto__" in a object-based map.
      return '$' + name;
    });
  }

  /**
   * @param {string} id
   * @return {string}
   */
  function idSelector(id) {
    return '#' + CSS.escape(id);
  }

  const prefixedOwnClassNamesArray = prefixedElementClassNames(node);
  let needsClassNames = false;
  let needsNthChild = false;
  let ownIndex = -1;
  let elementIndex = -1;
  const siblings = parent.children;
  for (let i = 0; (ownIndex === -1 || !needsNthChild) && i < siblings.length; ++i) {
    const sibling = siblings[i];
    if (sibling.nodeType !== NodeType.ELEMENT_NODE)
      continue;
    elementIndex += 1;
    if (sibling === node) {
      ownIndex = elementIndex;
      continue;
    }
    if (needsNthChild)
      continue;
    if (nodeNameInCorrectCase(sibling) !== nodeName)
      continue;

    needsClassNames = true;
    const ownClassNames = new Set(prefixedOwnClassNamesArray);
    if (!ownClassNames.size) {
      needsNthChild = true;
      continue;
    }
    const siblingClassNamesArray = prefixedElementClassNames(sibling);
    for (let j = 0; j < siblingClassNamesArray.length; ++j) {
      const siblingClass = siblingClassNamesArray[j];
      if (!ownClassNames.has(siblingClass))
        continue;
      ownClassNames.delete(siblingClass);
      if (!ownClassNames.size) {
        needsNthChild = true;
        break;
      }
    }
  }

  let result = nodeName;
  if (isTargetNode && nodeName.toLowerCase() === 'input' && node.getAttribute('type') && !node.getAttribute('id') &&
      !node.getAttribute('class'))
    result += '[type=' + CSS.escape(node.getAttribute('type')) + ']';
  if (needsNthChild) {
    result += ':nth-child(' + (ownIndex + 1) + ')';
  } else if (needsClassNames) {
    for (const prefixedName of prefixedOwnClassNamesArray)
      result += '.' + CSS.escape(prefixedName.slice(1));
  }

  return new Elements.DOMPath.Step(result, false);
};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean=} optimized
 * @return {string}
 */
Elements.DOMPath.xPath = function(node, optimized) {
  if (node.nodeType === NodeType.DOCUMENT_NODE)
    return '/';

  const steps = [];
  let contextNode = node;
  while (contextNode) {
    const step = Elements.DOMPath._xPathValue(contextNode, optimized);
    if (!step)
      break;  // Error - bail out early.
    steps.push(step);
    if (step.optimized)
      break;
    contextNode = contextNode.parentNode;
  }

  steps.reverse();
  return (steps.length && steps[0].optimized ? '' : '/') + steps.join('/');
};

/**
 * @param {!SDK.DOMNode} node
 * @param {boolean=} optimized
 * @return {?Elements.DOMPath.Step}
 */
Elements.DOMPath._xPathValue = function(node, optimized) {
  let ownValue;
  const ownIndex = Elements.DOMPath._xPathIndex(node);
  if (ownIndex === -1)
    return null;  // Error.

  switch (node.nodeType) {
    case NodeType.ELEMENT_NODE:
      if (optimized && node.getAttribute('id'))
        return new Elements.DOMPath.Step('//*[@id="' + node.getAttribute('id') + '"]', true);
      ownValue = node.localName;
      break;
    case NodeType.ATTRIBUTE_NODE:
      ownValue = '@' + node.nodeName;
      break;
    case NodeType.TEXT_NODE:
    case NodeType.CDATA_SECTION_NODE:
      ownValue = 'text()';
      break;
    case NodeType.PROCESSING_INSTRUCTION_NODE:
      ownValue = 'processing-instruction()';
      break;
    case NodeType.COMMENT_NODE:
      ownValue = 'comment()';
      break;
    case NodeType.DOCUMENT_NODE:
      ownValue = '';
      break;
    default:
      ownValue = '';
      break;
  }

  if (ownIndex > 0)
    ownValue += '[' + ownIndex + ']';

  return new Elements.DOMPath.Step(ownValue, node.nodeType === NodeType.DOCUMENT_NODE);
};

/**
 * @param {!SDK.DOMNode} node
 * @return {number}
 */
Elements.DOMPath._xPathIndex = function(node) {
  // Returns -1 in case of error, 0 if no siblings matching the same expression, <XPath index among the same expression-matching sibling nodes> otherwise.
  function areNodesSimilar(left, right) {
    if (left === right)
      return true;

    if (left.nodeType === NodeType.ELEMENT_NODE && right.nodeType === NodeType.ELEMENT_NODE)
      return left.localName === right.localName;

    if (left.nodeType === right.nodeType)
      return true;

    // XPath treats CDATA as text nodes.
    const leftType = left.nodeType === NodeType.CDATA_SECTION_NODE ? NodeType.TEXT_NODE : left.nodeType;
    const rightType = right.nodeType === NodeType.CDATA_SECTION_NODE ? NodeType.TEXT_NODE : right.nodeType;
    return leftType === rightType;
  }

  const siblings = node.parentNode ? node.parentNode.children : null;
  if (!siblings)
    return 0;  // Root node - no siblings.
  let hasSameNamedElements;
  for (let i = 0; i < siblings.length; ++i) {
    if (areNodesSimilar(node, siblings[i]) && siblings[i] !== node) {
      hasSameNamedElements = true;
      break;
    }
  }
  if (!hasSameNamedElements)
    return 0;
  let ownIndex = 1;  // XPath indices start with 1.
  for (let i = 0; i < siblings.length; ++i) {
    if (areNodesSimilar(node, siblings[i])) {
      if (siblings[i] === node)
        return ownIndex;
      ++ownIndex;
    }
  }
  return -1;  // An error occurred: |node| not found in parent's children.
};

/**
 * @unrestricted
 */
Elements.DOMPath.Step = class {
  /**
   * @param {string} value
   * @param {boolean} optimized
   */
  constructor(value, optimized) {
    this.value = value;
    this.optimized = optimized || false;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this.value;
  }
};

module.exports = Elements.DOMPath;

},{"./DOMNode":2,"css.escape":1}]},{},[]);
