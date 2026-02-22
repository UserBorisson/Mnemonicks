const DEFAULT_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "hr",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  // MathML tags that may appear in pre-rendered KaTeX output.
  "math",
  "annotation",
  "annotation-xml",
  "mfrac",
  "mi",
  "mn",
  "mo",
  "mrow",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "semantics"
];

const DEFAULT_ALLOWED_ATTR = [
  "aria-hidden",
  "class",
  "colspan",
  "data-cloze-idx",
  "data-cloze-revealed",
  "data-tts",
  "dir",
  "href",
  "lang",
  "rel",
  "rowspan",
  "role",
  "style",
  "target",
  "title"
];

const FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "link", "meta"];
const JS_PROTOCOL_RE = /^\s*javascript:/i;
const DATA_PROTOCOL_RE = /^\s*data:/i;

function fallbackSanitize(raw = "") {
  const input = String(raw ?? "");
  if (!input) return "";
  if (typeof document === "undefined") {
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const template = document.createElement("template");
  template.innerHTML = input;
  FORBIDDEN_TAGS.forEach((tag) => {
    template.content.querySelectorAll(tag).forEach((node) => node.remove());
  });
  template.content.querySelectorAll("*").forEach((node) => {
    const attrs = Array.from(node.attributes || []);
    attrs.forEach((attr) => {
      const name = String(attr.name || "").toLowerCase();
      const value = String(attr.value || "");
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src") && JS_PROTOCOL_RE.test(value)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === "href" && DATA_PROTOCOL_RE.test(value)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

export function sanitizeDeckHtml(raw = "") {
  const input = String(raw ?? "");
  if (!input) return "";

  const purifier = (typeof window !== "undefined" && window.DOMPurify) ? window.DOMPurify : null;
  if (!purifier || typeof purifier.sanitize !== "function") {
    return fallbackSanitize(input);
  }

  return purifier.sanitize(input, {
    ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
    ALLOWED_ATTR: DEFAULT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: FORBIDDEN_TAGS
  });
}

export function escapeHtml(text = "") {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
