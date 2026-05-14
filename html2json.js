const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");

  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

function html2json(htmlString) {
  const html = String(htmlString ?? "");
  const root = createRootNode();
  const stack = [root];

  let index = 0;

  while (index < html.length) {
    const nextTagIndex = html.indexOf("<", index);

    if (nextTagIndex === -1) {
      appendText(html.slice(index), stack);
      break;
    }

    if (nextTagIndex > index) {
      appendText(html.slice(index, nextTagIndex), stack);
      index = nextTagIndex;
      continue;
    }

    const result = parseMarkupAt(html, index, stack);

    if (!result.parsed) {
      appendText(html[index], stack);
      index += 1;
      continue;
    }

    index = result.nextIndex;
  }

  return [root];
}

function parseMarkupAt(html, index, stack) {
  if (isComment(html, index)) {
    return parseComment(html, index, stack);
  }

  if (isDeclaration(html, index)) {
    return parseDeclaration(html, index, stack);
  }

  if (!isTagStart(html, index)) {
    return {
      parsed: false,
      nextIndex: index,
    };
  }

  return parseTag(html, index, stack);
}

function parseTag(html, index, stack) {
  const tagEnd = findTagEnd(html, index);

  if (tagEnd === -1) {
    appendText(html.slice(index), stack);

    return {
      parsed: true,
      nextIndex: html.length,
    };
  }

  if (html[index + 1] === "/") {
    closeCurrentNode(html.slice(index + 2, tagEnd), stack);

    return {
      parsed: true,
      nextIndex: tagEnd + 1,
    };
  }

  const tagContent = html.slice(index + 1, tagEnd);
  const { tagName, attributes, selfClosing } = parseTagContent(tagContent);

  if (!tagName) { /////////////////////////////////////////////////////// ? .....................................
    appendText(html.slice(index, tagEnd + 1), stack); ///////////////////////////////////////////////////////////////////////////////// ............................

    return {
      parsed: true,
      nextIndex: tagEnd + 1,
    };
  }

  const tagNode = createTagNode(tagName, attributes);
  appendNode(tagNode, stack);

  if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
    const { content, nextIndex } = parseRawText(html, tagEnd + 1, tagName);

    appendTextToNode(content, tagNode);

    return {
      parsed: true,
      nextIndex: nextIndex,
    };
  }

  if (!selfClosing && !VOID_TAGS.has(tagName.toLowerCase())) {
    stack.push(tagNode);
  }

  return {
    parsed: true,
    nextIndex: tagEnd + 1,
  };
}

function findTagEnd(html, index) {
  let quote = null;

  for (let currentIndex = index + 1; currentIndex < html.length; currentIndex++) {
    const character = html[currentIndex];

    if (quote) {
      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return currentIndex;
    }
  }

  return -1;
}

function isTagStart(html, index) {
  const nextCharacter = html[index + 1];

  return Boolean(nextCharacter && /[a-zA-Z/]/.test(nextCharacter));
}

function isComment(html, index) {
  return html.startsWith("<!--", index);
}

function parseComment(html, index, stack) {
  const commentStart = index + 4;
  const commentEnd = html.indexOf("-->", commentStart);

  if (commentEnd === -1) {
    appendNode(createCommentNode(html.slice(commentStart).trim()), stack);

    return {
      parsed: true,
      nextIndex: html.length,
    };
  }

  appendNode(createCommentNode(html.slice(commentStart, commentEnd).trim()), stack);

  return {
    parsed: true,
    nextIndex: commentEnd + 3, 
  };
}

function isDeclaration(html, index) {
  return html.startsWith("<!", index);
}

function parseDeclaration(html, index, stack) {
  const declarationStart = index + 2;
  const declarationEnd = html.indexOf(">", declarationStart);

  if (declarationEnd === -1) {
    appendNode(createDeclarationNode(html.slice(declarationStart).trim()), stack);

    return {
      parsed: true,
      nextIndex: html.length,
    };
  }

  appendNode(
    createDeclarationNode(html.slice(declarationStart, declarationEnd).trim()),
    stack
  );

  return {
    parsed: true,
    nextIndex: declarationEnd + 1,
  };
}

function parseTagContent(tagContent) {
  const trimmedContent = tagContent.trim();
  const selfClosing = trimmedContent.endsWith("/");
  const normalizedContent = selfClosing
    ? trimmedContent.slice(0, -1).trim()
    : trimmedContent;
  const firstSpaceIndex = normalizedContent.search(/\s/);

  if (firstSpaceIndex === -1) {
    return {
      tagName: normalizedContent,
      attributes: {},
      selfClosing: selfClosing,
    };
  }

  const tagName = normalizedContent.slice(0, firstSpaceIndex);
  const attributesText = normalizedContent.slice(firstSpaceIndex + 1);

  return {
    tagName: tagName,
    attributes: parseAttributes(attributesText),
    selfClosing: selfClosing,
  };
}

function parseAttributes(attributesText) {
  const attributes = {};
  const attributePattern =
    /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>=]+)))?/g;

  let match;

  while ((match = attributePattern.exec(attributesText)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? true;

    attributes[name] = value;
  }

  return attributes;
}

function parseRawText(html, index, tagName) {
  const closeTagPattern = new RegExp(
    "</\\s*" + escapeRegExp(tagName) + "\\s*>",
    "i"
  );
  const remainingHtml = html.slice(index);
  const closeTagMatch = remainingHtml.match(closeTagPattern);  

  if (!closeTagMatch) {
    return {
      content: html.slice(index),
      nextIndex: html.length,
    };
  }

  const closeTagIndex = index + closeTagMatch.index;

  return {
    content: html.slice(index, closeTagIndex),
    nextIndex: closeTagIndex + closeTagMatch[0].length,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function closeCurrentNode(tagContent, stack) {
  const tagName = tagContent.trim().split(/\s+/)[0].toLowerCase();

  while (stack.length > 1) {
    const currentNode = getCurrentNode(stack);

    stack.pop();

    if (currentNode.name.toLowerCase() === tagName) {
      return;
    }
  }
}

function appendText(text, stack) {
  const content = normalizeTextContent(text);

  if (content) {
    appendNode(createTextNode(content), stack);
  }
}

function appendTextToNode(text, node) {
  const content = text.trim();

  if (content) {
    node.children.push(createTextNode(content));
  }
}

function normalizeTextContent(text) { 
  return text.replace(/\s+/g, " ").trim();
}

function appendNode(node, stack) {
  getCurrentNode(stack).children.push(node);
}

function getCurrentNode(stack) {
  return stack[stack.length - 1];
}

function createRootNode() {
  return {
    type: "root",
    children: [],
  };
}

function createTagNode(tagName, attributes) {
  return {
    type: "tag",
    name: tagName,
    attributes: attributes,
    children: [],
  };
}

function createTextNode(content) {
  return {
    type: "text",
    content: content,
  };
}

function createCommentNode(content) {
  return {
    type: "comment",
    content: content,
  };
}

function createDeclarationNode(content) {
  return {
    type: "declaration",
    content: content,
  };
}
